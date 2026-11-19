<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Jobs\Mcp\SyncMcpScopeJob;
use PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob;
use PanelAlpha\ClientArea\Mcp\McpScopeSynchronizer;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * A Connect AI token's Engine scope follows its owner's projects.
 * The Engine fixes the scope at mint time (`McpTokenController::store`: "A
 * project the token creates or clones … is not added to its scope"), so the
 * panel pushes `PUT /mcp-tokens/{id}/projects` when it differs
 * (`McpScopeSynchronizer`), in `SyncMcpScopeJob` – queued on the `database`
 * connection, unique per user, retried on an Engine hiccup, never inline.
 *
 * Triggers: `EngineProjectsSynced` (every token owner on that Engine), a new
 * `ProjectMirrored` row (a project created, cloned or staged) and
 * `ProjectsUnmirrored` (a project deleted through the panel or gone from the
 * Engine); an edition calls `syncUser()` when it links or unlinks.
 *
 * Engine: `GET /projects/all` (core/app/Http/Controllers/UserController.php:122),
 * `GET /mcp-tokens` (core/app/Http/Controllers/McpTokenController.php:35, each
 * token with `projects` and `revoked_at`, `formatToken` :178-188) and
 * `PUT /mcp-tokens/{id}/projects` (core/app/Http/Controllers/McpTokenController.php:130;
 * `projects` is `present|array` since Engine 2.2.0 (develop `3ff542d4b`), so
 * an empty list scopes a token to no project, and each name is
 * `exists:users,username`: core/app/Http/Requests/McpTokenProjectsRequest.php:20-21).
 *
 * The queue behaviour runs on a real `database` queue (`queue:work --once`).
 */
final class McpScopeSyncTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /** The fake Engine's state: its project list and MCP tokens. */
    private object $engine;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->configureEngine();
        $this->engine = new class
        {
            /** @var list<array<string, mixed>> */
            public array $projects = [];

            /** @var list<array<string, mixed>> */
            public array $tokens = [];

            public ?\Closure $tokenList = null;

            public ?\Closure $put = null;
        };
        $engine = $this->engine;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 → UserController::listAll
            'engine.example.com/api/projects/all*' => static fn () => Http::response(['data' => $engine->projects]),
            'engine.example.com/api/mcp-tokens' => static fn () => $engine->tokenList !== null
                ? ($engine->tokenList)()
                // Engine: core/app/Http/Controllers/McpTokenController.php:35 → index(), {data:[…]}
                : Http::response(['data' => $engine->tokens]),
            'engine.example.com/api/mcp-tokens/*/projects' => static function (Request $request) use ($engine) {
                if ($engine->put !== null) {
                    return ($engine->put)($request);
                }
                $id = (int) explode('/', (string) parse_url($request->url(), PHP_URL_PATH))[3];

                // Engine: core/app/Http/Controllers/McpTokenController.php:130 → updateProjects(), {data:{…}}
                return Http::response(['data' => [...self::token($id), 'projects' => $request->data()['projects'] ?? null]]);
            },
            // Engine: core/app/Http/Controllers/UserController.php:1513 → UserController::destroy, {data:{username}}
            'engine.example.com/api/projects/*' => Http::response(['data' => ['username' => 'site2']]),
        ]);
    }

    /**
     * @param  list<string>|null  $projects
     * @return array<string, mixed>
     */
    private static function token(int $id, ?array $projects = [], ?string $revokedAt = null): array
    {
        return [
            'id' => $id, 'name' => 'Claude', 'projects' => $projects, 'last_used_at' => null,
            'revoked_at' => $revokedAt, 'created_at' => '2026-10-13T00:00:00+00:00',
        ];
    }

    /**
     * Mirror the Engine's list now (no token owner yet, so nothing is queued).
     *
     * @param  list<string>  $usernames
     */
    private function mirror(array $usernames): void
    {
        $this->engine->projects = array_map(
            fn (string $username, int $i): array => $this->engineProject($i + 1, $username),
            $usernames,
            array_keys($usernames),
        );
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        // The sync also queued legacy's type probes; isolate the scope jobs.
        DB::table('jobs')->delete();
        Cache::flush();
        $this->rememberNoSelfProject();
    }

    /** Queued scope jobs (the sync also queues other work, e.g. type probes). */
    private function scopeJobs(): int
    {
        return DB::table('jobs')->where('payload', 'like', '%SyncMcpScopeJob%')->count();
    }

    private function own(User $user, int $engineTokenId): void
    {
        McpToken::query()->create([
            'user_id' => $user->id,
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_token_id' => $engineTokenId,
            'name' => 'Claude',
        ]);
    }

    private function workOnce(): void
    {
        $this->artisan('queue:work', [
            'connection' => 'database',
            '--once' => true,
            '--queue' => 'default',
        ])->run();
    }

    /**
     * @return list<array{int, mixed}>
     */
    private function puts(): array
    {
        return Http::recorded(static fn (Request $request): bool => $request->method() === 'PUT')
            ->map(static fn (array $pair): array => [
                (int) explode('/', (string) parse_url($pair[0]->url(), PHP_URL_PATH))[3],
                $pair[0]->data()['projects'] ?? null,
            ])
            ->values()
            ->all();
    }

    public function test_a_new_project_reaches_the_users_tokens_after_the_sync_job(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1']);
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['site1'])];

        // The Engine now lists a project created outside the panel; the
        // scheduled sync mirrors it and announces the Engine.
        $this->engine->projects[] = $this->engineProject(2, 'site2');
        (new SyncEnginesJob)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class), app(EngineHealth::class));

        // Queued, never inline: no MCP call yet, and one job for the user
        // although both the new row and the sync announced it.
        $this->assertSame([], $this->puts());
        $this->assertSame(1, $this->scopeJobs());

        $this->workOnce();

        $this->assertSame([[5, ['site1', 'site2']]], $this->puts());
        $this->assertSame(0, $this->scopeJobs());
    }

    public function test_a_project_the_panel_creates_reaches_the_users_tokens(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1']);
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['site1'])];

        // `mirror()` is how a created, cloned or staged project gets its row.
        app(ApplicationSynchronizer::class)->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(2, 'site1stg', ['staging_of' => 'site1']));
        $this->assertSame(1, $this->scopeJobs());
        $this->workOnce();

        $this->assertSame([[5, ['site1', 'site1stg']]], $this->puts());
    }

    public function test_a_project_deleted_through_the_panel_leaves_the_scope(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1', 'site2']);
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['site1', 'site2'])];
        $site2 = Application::query()->where('engine_username', 'site2')->firstOrFail();
        // The scope job is queued, not run: the delete answers whatever the
        // Engine's MCP side would say.
        // Defensive (not an Engine shape): any Engine 5xx body
        $this->engine->tokenList = static fn () => Http::response(['message' => 'boom'], 500);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($alice)->deleteJson("/api/projects/{$site2->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])->assertOk();

        $this->assertSame(1, $this->scopeJobs());
        $this->engine->tokenList = null;
        $this->workOnce();

        $this->assertSame([[5, ['site1']]], $this->puts());
    }

    public function test_a_project_gone_from_the_engine_leaves_the_scope(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1', 'site2']);
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['site1', 'site2'])];

        // The Engine no longer lists site2: the sync deletes the row.
        array_pop($this->engine->projects);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        $this->assertSame(1, $this->scopeJobs());
        $this->workOnce();

        $this->assertSame([[5, ['site1']]], $this->puts());
    }

    public function test_an_unchanged_scope_sends_no_put(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1', 'site2']);
        $this->own($alice, 5);
        // The Engine's order is not the panel's: still the same scope.
        $this->engine->tokens = [self::token(5, ['site2', 'site1'])];

        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        $this->workOnce();

        $this->assertCount(1, Http::recorded(static fn (Request $request): bool => str_ends_with($request->url(), '/api/mcp-tokens')));
        $this->assertSame([], $this->puts());
    }

    public function test_a_token_scoped_to_a_project_that_runs_a_panel_is_narrowed(): void
    {
        // A token minted before the scope dropped panel installations still
        // lists one; the next sync pushes the narrowed scope.
        $this->engine->projects = [
            $this->engineProject(1, 'site1'),
            $this->engineProject(2, 'otherpanel', ['details' => [
                'env_override_keys' => ['PANELALPHA_USER_EMAIL', 'PANELALPHA_USER_PASSWORD', 'PANELALPHA_SELF_PROJECT'],
            ]]),
        ];
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        DB::table('jobs')->delete();
        Cache::flush();
        $this->rememberNoSelfProject();

        $alice = User::factory()->create();
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['otherpanel', 'site1'])];

        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        $this->workOnce();

        $this->assertSame([[5, ['site1']]], $this->puts());
    }

    public function test_revoked_and_unowned_tokens_are_skipped(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1', 'site2']);
        $this->own($alice, 5);
        $this->own($alice, 6);
        $this->engine->tokens = [
            self::token(5, ['site1'], '2026-10-13T01:00:00+00:00'),
            self::token(6, ['site1']),
            // The operator's own server-wide token: no row, never rescoped.
            self::token(7, null),
        ];

        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        $this->workOnce();

        $this->assertSame([[6, ['site1', 'site2']]], $this->puts());
    }

    public function test_an_unscoped_owned_token_is_scoped(): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1']);
        $this->own($alice, 5);
        // `projects: null` is an unscoped token (TokenAbilities::projects()).
        $this->engine->tokens = [self::token(5, null)];

        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        $this->workOnce();

        $this->assertSame([[5, ['site1']]], $this->puts());
    }

    /**
     * @return array<string, array{\Closure}>
     */
    public static function hiccups(): array
    {
        return [
            'connection error' => [static fn () => throw new ConnectionException('down')],
            // Defensive (not an Engine shape): any Engine 5xx body
            'engine 5xx' => [static fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('hiccups')]
    public function test_an_engine_hiccup_retries_without_failing_the_sync_job(\Closure $hiccup): void
    {
        $alice = User::factory()->create();
        $this->mirror(['site1']);
        $this->own($alice, 5);
        $this->engine->tokens = [self::token(5, ['site1'])];
        $this->engine->put = $hiccup;

        // The sync job that triggers the scope sync completes: the scope job
        // is only queued.
        $this->engine->projects[] = $this->engineProject(2, 'site2');
        (new SyncEnginesJob)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class), app(EngineHealth::class));
        $this->assertTrue(Application::query()->where('engine_username', 'site2')->exists());

        // First run: the PUT fails, the job is released, not failed.
        $this->workOnce();
        $this->assertSame(0, DB::table('failed_jobs')->count());
        $this->assertSame(1, $this->scopeJobs());
        $this->assertSame(1, (int) DB::table('jobs')->where('payload', 'like', '%SyncMcpScopeJob%')->value('attempts'));

        // After the first backoff the Engine answers: the scope arrives.
        $this->engine->put = null;
        Carbon::setTestNow(now()->addSeconds(SyncMcpScopeJob::BACKOFF_SECONDS[0] + 1));
        $this->workOnce();

        // The retried PUT carries the scope (a refused connect is not recorded
        // as sent, a 5xx is).
        $puts = $this->puts();
        $this->assertNotSame([], $puts);
        $this->assertSame([5, ['site1', 'site2']], $puts[array_key_last($puts)]);
        $this->assertSame(0, $this->scopeJobs());
        $this->assertSame(0, DB::table('failed_jobs')->count());
        Carbon::setTestNow();
    }

    public function test_the_last_attempt_reports_and_never_lands_in_failed_jobs(): void
    {
        Exceptions::fake();
        $alice = User::factory()->create();
        $this->own($alice, 5);
        // Defensive (not an Engine shape): any Engine 5xx body
        $this->engine->tokenList = static fn () => Http::response(['message' => 'boom'], 500);

        app(McpScopeSynchronizer::class)->syncUser($alice);

        $runs = 0;
        while ($this->scopeJobs() > 0) {
            $this->workOnce();
            $runs++;
            $this->assertLessThanOrEqual(SyncMcpScopeJob::TRIES, $runs);
            Carbon::setTestNow(now()->addSeconds(121));
        }

        $this->assertSame(5, $runs);
        $this->assertSame(0, DB::table('failed_jobs')->count());
        Exceptions::assertReported(EngineRequestException::class);
        Carbon::setTestNow();
    }

    /**
     * Since Engine 2.2.0 a user whose last project is gone gets every token
     * scoped to no project, which the Engine accepts – nothing is reported.
     */
    public function test_a_user_without_projects_gets_every_token_scoped_to_none(): void
    {
        Exceptions::fake();
        $alice = User::factory()->create();
        $this->mirror([]);
        $this->own($alice, 5);
        $this->own($alice, 6);
        $this->engine->tokens = [self::token(5, ['gone']), self::token(6, ['gone'])];

        app(McpScopeSynchronizer::class)->syncUser($alice);
        $this->workOnce();

        $this->assertSame([[5, []], [6, []]], $this->puts());
        $this->assertSame(0, DB::table('failed_jobs')->count());
        Exceptions::assertNothingReported();
    }

    public function test_a_refused_scope_is_reported_and_the_other_tokens_still_sync(): void
    {
        Exceptions::fake();
        $alice = User::factory()->create();
        $this->mirror([]);
        $this->own($alice, 5);
        $this->own($alice, 6);
        $this->engine->tokens = [self::token(5, ['gone']), self::token(6, ['gone'])];
        // Engine: core/app/Http/Requests/McpTokenProjectsRequest.php:21 → `projects.*` exists:users,username (a project deleted meanwhile)
        $this->engine->put = static fn () => Http::response([
            'message' => 'The selected projects.0 is invalid.',
            'errors' => ['projects.0' => ['The selected projects.0 is invalid.']],
        ], 422);

        app(McpScopeSynchronizer::class)->syncUser($alice);
        $this->workOnce();

        // Both tokens were asked; a refusal is not retried.
        $this->assertSame([[5, []], [6, []]], $this->puts());
        $this->assertSame(0, $this->scopeJobs());
        $this->assertSame(0, DB::table('failed_jobs')->count());
        Exceptions::assertReported(EngineValidationException::class);
    }

    public function test_an_edition_queues_the_sync_and_only_token_owners_are_queued(): void
    {
        Queue::fake();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->own($alice, 5);
        // Carol's token lives on another Engine (Multi).
        McpToken::query()->create(['user_id' => $carol->id, 'engine_id' => EngineConnection::DEFAULT_ID + 1, 'engine_token_id' => 5, 'name' => 'Claude']);

        // A real sync queues the token owners on that Engine only: not Bob
        // (no token), not Carol (another Engine).
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        Queue::assertPushed(SyncMcpScopeJob::class, 1);
        Queue::assertPushed(SyncMcpScopeJob::class, static fn (SyncMcpScopeJob $job): bool => $job->userId === $alice->id
            && $job->connection === 'database' && $job->queue === 'default');

        // An edition linking or unlinking a project calls syncUser(): queued,
        // never inline.
        app(McpScopeSynchronizer::class)->syncUser($bob);
        Queue::assertPushed(SyncMcpScopeJob::class, 2);
        Queue::assertPushed(SyncMcpScopeJob::class, static fn (SyncMcpScopeJob $job): bool => $job->userId === $bob->id);
        Queue::assertNotPushed(SyncMcpScopeJob::class, static fn (SyncMcpScopeJob $job): bool => $job->userId === $carol->id);
        Http::assertNothingSent();
    }

    public function test_one_job_per_user_is_queued(): void
    {
        $alice = User::factory()->create();
        $this->own($alice, 5);

        app(McpScopeSynchronizer::class)->syncUser($alice);
        app(McpScopeSynchronizer::class)->syncUser($alice);

        $this->assertSame(1, $this->scopeJobs());
    }

    public function test_the_job_pins_its_retry_settings(): void
    {
        $job = new SyncMcpScopeJob(7);

        // Literals, so a changed value is caught.
        $this->assertSame(5, SyncMcpScopeJob::TRIES);
        $this->assertSame(5, $job->tries);
        $this->assertSame([10, 30, 60, 120], SyncMcpScopeJob::BACKOFF_SECONDS);
        $this->assertSame(1, $job->maxExceptions);
        $this->assertSame(600, $job->uniqueFor);
        $this->assertSame('client-area:mcp-scope:7', $job->uniqueId());
        $this->assertSame('default', $job->queue);
    }
}
