<?php

namespace Tests\Feature\ClientArea\Git;

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Jobs\Git\FollowGitHookDeploysJob;
use PanelAlpha\ClientArea\Jobs\Git\FollowProjectHookDeploysJob;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Projects\HookDeployFollower;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The hook-deploy follower restores what the retired delivery import
 * (`ImportAutoDeployDeliveriesJob`, `GitAutoDeployService::importDeliveries()`,
 * tested by the deleted `GitAutoDeployImportTest`) did besides the
 * `deploy_logs` rows, on top of the Engine's deploy history.
 *
 * Contract:
 * - Engine `GET /projects/{u}/deploys` (`Http/Controllers/User/DeployHistoryController.php:39-42`,
 *   items `Lib/Deploy/DeployLog/DeployHistory.php:84-102`): the kept deploys newest first, ids
 *   `Ymd-His-<6 hex>` (`DeployLogger.php:128`) that sort by their start (`DeployHistory.php:65-75`);
 *   `status` `running|success|partial|failed|cancelled|unknown`, `trigger` `hook` for a deploy a
 *   hook delivery names (`DeployHistory.php:144-151`), `commit`, `branch`, `error`, unix
 *   `started_at`/`finished_at`.
 * - What the old import made of a delivery (`Lib/DeployHook/DeliveryRunner.php:104-109`: a deploy's
 *   `success` → `deployed`, `partial` → `partial`, `failed` → `deploy_failed` with its error or
 *   "The deploy failed.", `cancelled` → `deploy_failed` "The deploy was cancelled."): the
 *   notification `user.instance.git_auto_deploy_finished` (payload `[]`) or `…_failed` (payload
 *   `message`, sanitised by `ApplicationNotifier`) to `AccessResolver::usersFor()`, a
 *   `webhook_pull` git operation (`GitOperationLog::recordWebhookPull`), and the last commit of
 *   the newest delivery that deployed.
 * - The CA renders the notification from `html_text` (`components/navbar/NotificationsManager.vue:10-11`)
 *   and lists the git operation in its git log (`views/instance/advanced/Git.vue:675`).
 */
final class GitHookDeployFollowTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const OLD = '20261014-090000-aaaaaa';

    private const HOOK = '20261014-101500-a1b2c3';

    private const NEWER = '20261014-111500-b2c3d4';

    /**
     * The Engine's deploy list the fakes answer; a test changes it between runs.
     *
     * @var list<array<string, mixed>>
     */
    private array $deploys = [];

    private function hookedApplication(User $user, string $username = 'site1'): Application
    {
        $application = $this->syncedApplication($user, $username, [
            'details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main'],
        ]);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        return $application;
    }

    /**
     * Fake the Engine reads of one follower run; `$this->deploys` is read at
     * request time. The hook's URL has not moved.
     */
    private function fakeEngine(string $username = 'site1'): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158-163 -> show (DeployHookActions.php:54-68)
            "engine.example.com/api/projects/{$username}/git/deploy-hook" => Http::response(['data' => $this->deployHook()]),
            "engine.example.com/api/projects/{$username}/deploys" => function (): mixed {
                // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
                return Http::response(['data' => $this->deploys]);
            },
        ]);
    }

    /**
     * `GET git/deploy-hook` as `DeployHookActions::show()` answers it
     * (`DeployHookActions.php:54-68`, `describe()` :102-115, deliveries :125-142).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function deployHook(array $overrides = []): array
    {
        return array_merge([
            'url' => 'https://engine.test/api/hooks/deploy/abc',
            'path' => 'project',
            'created_at' => '2026-10-10T09:00:00+00:00',
            'updated_at' => '2026-10-10T09:00:00+00:00',
            'registered_url' => 'https://engine.test/api/hooks/deploy/abc',
            'url_changed_since_registration' => false,
            'tls' => ['state' => 'valid', 'warning' => null, 'instructions' => null],
            'deliveries' => [],
        ], $overrides);
    }

    /**
     * A hook deploy as `DeployHistory::entry()` lists it (`DeployHistory.php:91-101`).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function hookDeploy(string $id, array $overrides = []): array
    {
        return $this->engineDeploy(array_merge([
            'id' => $id,
            'source' => 'hook',
            'trigger' => 'hook',
            'action' => null,
            'task_id' => null,
            'commit' => 'c0ffee'.substr($id, -6),
        ], $overrides));
    }

    private function follow(Application $application): void
    {
        app(HookDeployFollower::class)->follow($application->fresh() ?? $application);
    }

    public function test_the_scheduled_job_fans_out_one_follow_per_hooked_application(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['git_repo' => 'https://github.com/acme/site']]),
            $this->engineProject(11, 'site2', ['details' => ['git_repo' => 'https://github.com/acme/site2']]),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $site1 = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $site2 = Application::query()->where('engine_username', 'site2')->firstOrFail();
        $site1->forceFill(['git_token' => 'ghp_token', 'git_provider' => 'github', 'git_webhook_id' => '555'])->save();

        Queue::fake();
        (new FollowGitHookDeploysJob)->handle(app(EngineHealth::class));

        // Only a project with auto-deploy on; the scheduled run itself makes no
        // Engine call.
        Queue::assertPushed(FollowProjectHookDeploysJob::class, fn (FollowProjectHookDeploysJob $job): bool => $job->applicationId === $site1->id
            && $job->queue === 'sync'
            && $job->connection === 'database');
        Queue::assertNotPushed(FollowProjectHookDeploysJob::class, fn (FollowProjectHookDeploysJob $job): bool => $job->applicationId === $site2->id);
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/deploys'));
    }

    public function test_the_scheduled_job_is_unique_on_the_sync_queue(): void
    {
        $job = new FollowGitHookDeploysJob;

        $this->assertSame('sync', $job->queue);
        $this->assertSame(300, $job->uniqueFor);
        $this->assertSame('user-application:git-hook-deploys', $job->uniqueId());
    }

    public function test_a_down_engine_is_skipped_by_the_fan_out(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        app(EngineHealth::class)->open($application->engine_id);
        Queue::fake();

        (new FollowGitHookDeploysJob)->handle(app(EngineHealth::class));

        // A down Engine's projects are not fanned out.
        Queue::assertNotPushed(FollowProjectHookDeploysJob::class);
    }

    public function test_a_second_follow_for_the_same_application_is_dropped(): void
    {
        Queue::fake();

        FollowProjectHookDeploysJob::dispatch(42)->onConnection('database');
        FollowProjectHookDeploysJob::dispatch(42)->onConnection('database');
        FollowProjectHookDeploysJob::dispatch(43)->onConnection('database');

        // Unique per application id: the second run for 42 is dropped, another
        // project's is not.
        $pushed = Queue::pushed(FollowProjectHookDeploysJob::class);
        $this->assertSame(2, $pushed->count());
        $this->assertSame(1, $pushed->where('applicationId', 42)->count());
        $this->assertSame(1, $pushed->where('applicationId', 43)->count());
    }

    public function test_the_first_run_marks_the_newest_deploy_and_replays_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::HOOK, ['status' => 'failed', 'error' => 'build failed']),
            $this->hookDeploy(self::OLD),
        ];

        $this->follow($application);

        // The deploys that ended before the follower ran are old: no
        // notification, no git operation, no last commit – only the marker.
        Notification::assertNothingSent();
        $this->assertSame(0, GitOperation::query()->count());
        $fresh = $application->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame(self::HOOK, $fresh->git_hook_deploy_id);
        $this->assertNull($fresh->git_last_commit_hash);

        // The second run finds nothing new either.
        $this->follow($application);
        Notification::assertNothingSent();
    }

    public function test_a_first_run_without_finished_deploys_still_counts_the_running_one_when_it_ends(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK, ['status' => 'running', 'finished_at' => null])];

        $this->follow($application);
        // Followed, nothing finished yet: the empty marker is below every id.
        $this->assertSame('', $application->fresh()?->git_hook_deploy_id);
        Notification::assertNothingSent();

        $this->deploys = [$this->hookDeploy(self::HOOK)];
        $this->follow($application);

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        $this->assertSame(self::HOOK, $application->fresh()?->git_hook_deploy_id);
    }

    /**
     * @return iterable<string, array{array<string, mixed>, string, array<string, mixed>, string}>
     */
    public static function statuses(): iterable
    {
        // Engine statuses → the old import's notification and git operation
        // (DeliveryRunner.php:104-109, GitOperationLog::recordWebhookPull).
        yield 'success' => [['status' => 'success'], 'user.instance.git_auto_deploy_finished', [], GitOperation::STATUS_SUCCESS];
        yield 'partial' => [['status' => 'partial', 'error' => 'The app answers 502.'], 'user.instance.git_auto_deploy_finished', [], GitOperation::STATUS_SUCCESS];
        yield 'failed' => [['status' => 'failed', 'error' => 'build failed'], 'user.instance.git_auto_deploy_failed', ['message' => 'build failed'], GitOperation::STATUS_FAILED];
        yield 'failed without an error' => [['status' => 'failed', 'error' => null], 'user.instance.git_auto_deploy_failed', ['message' => 'The deploy failed.'], GitOperation::STATUS_FAILED];
        yield 'cancelled' => [['status' => 'cancelled', 'error' => null], 'user.instance.git_auto_deploy_failed', ['message' => 'The deploy was cancelled.'], GitOperation::STATUS_FAILED];
        yield 'unknown (died without a verdict)' => [['status' => 'unknown', 'error' => null, 'finished_at' => null], 'user.instance.git_auto_deploy_failed', ['message' => 'The deploy failed.'], GitOperation::STATUS_FAILED];
    }

    /**
     * @param  array<string, mixed>  $deploy
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('statuses')]
    public function test_a_new_hook_deploy_notifies_its_result_exactly_once(array $deploy, string $type, array $payload, string $operation): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK, $deploy), $this->hookDeploy(self::OLD)];

        $this->follow($application);
        $this->follow($application);

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => $n->type === $type
            && $n->payload === $payload
            && $n->isError === ($type === 'user.instance.git_auto_deploy_failed')
            && $n->includeInstance
            && $n->application->is($application));

        // The old `GitAutoDeploy` job's `webhook_pull` git operation, settled.
        $pull = GitOperation::query()->where('action', GitOperation::ACTION_WEBHOOK_PULL)->sole();
        $this->assertSame($application->id, $pull->application_id);
        $this->assertSame($operation, $pull->status);
        $this->assertSame('c0ffee'.substr(self::HOOK, -6), $pull->commit_hash);
        $this->assertSame($payload['message'] ?? null, $pull->error_message);
        $this->assertTrue(Carbon::createFromTimestamp(1791972900)->equalTo($pull->created_at));
        $this->assertSame(self::HOOK, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_a_handled_hook_deploy_forgets_the_cached_source_facts(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];
        $key = ProjectSourceDetails::cacheKey($application);
        Cache::put($key, ['facts' => ['label' => 'Node.js', 'services' => [], 'database' => ['present' => false, 'label' => null], 'last_deploy' => ['status' => 'running', 'finished_at' => null, 'waiting_for_files' => false]], 'refreshed_at' => now()->getTimestamp()], ProjectSourceDetails::KEEP_SECONDS);

        $this->follow($application);

        // The notification makes the CA refetch the project: the Source card
        // must not read the running deploy cached while the hook's deploy ran.
        $this->assertFalse(Cache::has($key));
    }

    public function test_every_user_of_the_project_is_notified(): void
    {
        $first = User::factory()->create();
        $second = User::factory()->create();
        $application = $this->hookedApplication($first);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];

        $this->follow($application);

        // The recipients are `AccessResolver::usersFor()`, as before.
        Notification::assertSentToTimes($first, ApplicationNotification::class, 1);
        Notification::assertSentToTimes($second, ApplicationNotification::class, 1);
    }

    public function test_a_failed_hook_deploy_hides_home_paths_from_the_notification_and_the_git_log(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK, [
            'status' => 'failed',
            'error' => 'open /home/e2estatic21537/.incoming/docker-compose.yml: permission denied',
        ])];

        $this->follow($application);

        // The redacted text, as the old row and notification.
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => ($n->payload['message'] ?? null) === 'open [path]: permission denied');
        $this->assertSame('open [path]: permission denied', GitOperation::query()->sole()->error_message);
    }

    public function test_a_successful_hook_deploy_sets_the_last_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD, 'git_last_commit_hash' => 'olderc0ffee', 'git_last_commit_message' => 'Old message', 'git_last_commit_at' => now()])->save();
        $this->fakeEngine();
        Http::fake([
            // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => 'deployedc0ffee', 'short_hash' => 'deploye', 'subject' => 'Pushed from GitHub', 'author' => 'Dev', 'date' => '2026-10-14T12:15:00+02:00'],
            ]]),
        ]);
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::NEWER, ['status' => 'failed', 'commit' => 'brokenc0ffee']),
            $this->hookDeploy(self::HOOK, ['status' => 'partial', 'commit' => 'deployedc0ffee']),
            $this->hookDeploy(self::OLD),
        ];

        $this->follow($application);

        // The newest deploy that moved the checkout; the failed one never did.
        $fresh = $application->fresh();
        $this->assertSame('deployedc0ffee', $fresh?->git_last_commit_hash);
        $this->assertSame('Pushed from GitHub', $fresh?->git_last_commit_message);
        $this->assertSame('2026-10-14 10:15:00', $fresh?->git_last_commit_at?->utc()->format('Y-m-d H:i:s'));
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/git/commits') && str_contains($request->url(), 'branch=main') && str_contains($request->url(), 'limit=50'));
        Notification::assertSentToTimes($user, ApplicationNotification::class, 2);
        $this->assertSame(self::NEWER, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_a_hook_commit_missing_from_the_git_log_clears_the_old_message(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD, 'git_last_commit_hash' => 'olderc0ffee', 'git_last_commit_message' => 'Old message', 'git_last_commit_at' => now()])->save();
        $this->fakeEngine();
        // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (no row for the new hash)
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => []])]);
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::HOOK, ['commit' => 'newc0ffee']),
            $this->hookDeploy(self::OLD),
        ];

        $this->follow($application);

        // The commit is not in the 50 newest rows: the hash moves, the old
        // message and date never stay under it.
        $fresh = $application->fresh();
        $this->assertSame('newc0ffee', $fresh?->git_last_commit_hash);
        $this->assertNull($fresh?->git_last_commit_message);
        $this->assertNull($fresh?->git_last_commit_at);
    }

    public function test_a_failed_commit_read_is_retried_on_the_next_run(): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD, 'git_last_commit_hash' => 'olderc0ffee', 'git_last_commit_message' => 'Old message', 'git_last_commit_at' => now()])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::HOOK, ['commit' => 'newc0ffee']),
            $this->hookDeploy(self::OLD),
        ];
        $reads = 0;
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => function () use (&$reads): mixed {
            $reads++;

            // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (first read fails)
            if ($reads === 1) {
                return Http::response(['message' => 'boom'], 500);
            }

            // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (then the row)
            return Http::response(['data' => [
                ['hash' => 'newc0ffee', 'short_hash' => 'newc0ff', 'subject' => 'Late message', 'author' => 'Dev', 'date' => '2026-10-14T12:15:00+02:00'],
            ]]);
        }]);

        $this->follow($application);

        $fresh = $application->fresh();
        $this->assertSame('newc0ffee', $fresh?->git_last_commit_hash);
        $this->assertNull($fresh?->git_last_commit_message);

        $this->follow($application);

        $fresh = $application->fresh();
        $this->assertSame('Late message', $fresh?->git_last_commit_message);
        $this->assertSame('2026-10-14 10:15:00', $fresh?->git_last_commit_at?->utc()->format('Y-m-d H:i:s'));
        $this->assertSame(2, $reads);

        // Done: a third run makes no more reads.
        $this->follow($application);
        $this->assertSame(2, $reads);
    }

    public function test_a_commit_missing_from_the_log_is_not_retried(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::HOOK, ['commit' => 'newc0ffee']),
            $this->hookDeploy(self::OLD),
        ];
        $reads = 0;
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => function () use (&$reads): mixed {
            $reads++;

            // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (no row for the new hash)
            return Http::response(['data' => []]);
        }]);

        $this->follow($application);
        $this->follow($application);

        $this->assertSame(1, $reads);
    }

    public function test_a_newer_panel_deploy_keeps_its_own_last_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD, 'git_last_commit_hash' => 'redeployc0ffee'])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            // A redeploy the panel started after the push: its watcher recorded
            // its commit, which an older hook deploy must not overwrite.
            $this->engineDeploy(['id' => self::NEWER, 'commit' => 'redeployc0ffee']),
            $this->hookDeploy(self::HOOK, ['commit' => 'pushedc0ffee']),
        ];

        $this->follow($application);

        $this->assertSame('redeployc0ffee', $application->fresh()?->git_last_commit_hash);
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/git/commits'));
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
    }

    public function test_non_hook_deploys_are_ignored_but_passed(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            $this->engineDeploy(['id' => self::NEWER, 'trigger' => 'cli', 'source' => 'rebuild']),
            $this->engineDeploy(['id' => self::HOOK, 'trigger' => 'api', 'status' => 'failed', 'error' => 'build failed']),
        ];

        $this->follow($application);

        // A panel, `pae` or MCP deploy is not an auto-deploy: its own watcher (or
        // nobody) reports it.
        Notification::assertNothingSent();
        $this->assertSame(0, GitOperation::query()->count());
        $this->assertNull($application->fresh()?->git_last_commit_hash);
        $this->assertSame(self::NEWER, $application->fresh()?->git_hook_deploy_id);
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/git/commits'));
    }

    public function test_a_running_hook_deploy_is_handled_once_it_ends(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            $this->hookDeploy(self::HOOK, ['status' => 'running', 'finished_at' => null]),
            $this->hookDeploy(self::OLD),
        ];

        $this->follow($application);
        Notification::assertNothingSent();
        $this->assertSame(0, GitOperation::query()->count());
        $this->assertSame(self::OLD, $application->fresh()?->git_hook_deploy_id);

        $this->deploys[0] = $this->hookDeploy(self::HOOK);
        $this->follow($application);

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        $this->assertSame(1, GitOperation::query()->count());
    }

    public function test_a_project_without_auto_deploy_is_not_followed(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->fakeEngine();

        $this->follow($application);

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/deploys'));
        $this->assertNull($application->fresh()?->git_hook_deploy_id);
    }

    public function test_a_moved_hook_url_re_registers_the_provider_webhook(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Notification::fake();
        // The rotate resolves the provider API host through the HostGuard; the
        // fake keeps the test off DNS.
        $this->fakeHostResolver(['api.github.com' => [TestNetwork::routable(35)]]);
        $this->deploys = [$this->hookDeploy(self::HOOK)];
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198-203 -> rotate (DeployHookActions.php:74-82: describe() + rotated + secret, Models/DeployHook.php:50 48-hex secret)
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://new.test/api/hooks/deploy/def',
                'path' => 'project',
                'created_at' => '2026-10-10T09:00:00+00:00',
                'updated_at' => '2026-10-14T10:00:00+00:00',
                'rotated' => true,
                'secret' => str_repeat('a1', 24),
            ]]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158-163 -> show (DeployHookActions.php:59-60: the address moved)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => $this->deployHook([
                'url' => 'https://new.test/api/hooks/deploy/def',
                'url_changed_since_registration' => true,
                'tls' => ['state' => 'self_signed', 'warning' => 'self-signed', 'instructions' => null],
            ])]),
            // External: https://docs.github.com/en/rest/repos/webhooks (delete, then create a repository webhook)
            'api.github.com/*' => Http::response(['id' => 999]),
        ]);
        $this->fakeEngine();

        $this->follow($application);

        // The same provider calls as the retired import's rotate: the old
        // webhook goes, a new one is registered at the moved URL (self-signed:
        // TLS verification off), and its id is kept.
        $this->assertSame('999', $application->fresh()?->git_webhook_id);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://engine.example.com/api/projects/site1/git/deploy-hook/rotate');
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && $request->url() === 'https://api.github.com/repos/acme/site/hooks/555'
            && $request->hasHeader('Authorization', 'Bearer ghp_token'));
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://api.github.com/repos/acme/site/hooks'
            && $request['config']['url'] === 'https://new.test/api/hooks/deploy/def'
            && $request['config']['secret'] === str_repeat('a1', 24)
            && $request['config']['insecure_ssl'] === '1');
        // The deploys are still followed in the same run.
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
    }

    public function test_a_failed_re_registration_switches_auto_deploy_off(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeHostResolver(['api.github.com' => [TestNetwork::routable(35)]]);
        Exceptions::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198-203 -> rotate (DeployHookActions.php:74-82)
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://new.test/api/hooks/deploy/def',
                'path' => 'project',
                'rotated' => true,
                'secret' => str_repeat('b2', 24),
            ]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => function (Request $request): mixed {
                if ($request->method() === 'DELETE') {
                    // Engine: core/app/Http/Controllers/User/DeployHookController.php:223-233 -> destroy (204)
                    return Http::response(null, 204);
                }

                // Engine: core/app/Http/Controllers/User/DeployHookController.php:158-163 -> show (DeployHookActions.php:59-60: the address moved)
                return Http::response(['data' => $this->deployHook(['url_changed_since_registration' => true])]);
            },
            'api.github.com/*' => function (Request $request): mixed {
                // External: https://docs.github.com/en/rest/repos/webhooks (the create fails, the delete succeeds)
                return $request->method() === 'POST' ? Http::response(['message' => 'Validation Failed'], 422) : Http::response(null, 204);
            },
        ]);
        $this->fakeEngine();

        $this->follow($application);

        // A background run cannot answer 422: auto-deploy is switched off
        // cleanly – the Engine hook first, then the provider webhook, then the
        // marker – and the user re-enables it.
        $this->assertNull($application->fresh()?->git_webhook_id);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && $request->url() === 'https://engine.example.com/api/projects/site1/git/deploy-hook');
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && $request->url() === 'https://api.github.com/repos/acme/site/hooks/555');
        // The provider's refusal is reported, not swallowed.
        Exceptions::assertReported(RequestException::class);
    }

    public function test_an_unmoved_hook_url_makes_no_provider_call(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();

        $this->follow($application);

        Http::assertSent(fn (Request $request): bool => $request->method() === 'GET'
            && $request->url() === 'https://engine.example.com/api/projects/site1/git/deploy-hook');
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'rotate')
            || str_contains($request->url(), 'api.github.com'));
        $this->assertSame('555', $application->fresh()?->git_webhook_id);
    }

    public function test_a_hook_the_engine_no_longer_has_still_follows_the_deploys(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:239-240 -> respond (DeployHookNotFound → 404)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'No deploy hook on project.'], 404),
        ]);
        $this->fakeEngine();

        $this->follow($application);

        // Nothing to re-register; a hook deploy that ran before still notifies.
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'rotate'));
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        $this->assertSame('555', $application->fresh()?->git_webhook_id);
    }

    public function test_the_follower_requests_the_notification_event(): void
    {
        // Ported from the import's firing test: the follower fires
        // ClientAreaNotificationRequested; the controller's listener delivers
        // it through ApplicationNotifier.
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Event::fake([ClientAreaNotificationRequested::class]);
        $this->deploys = [$this->hookDeploy(self::HOOK, ['status' => 'failed', 'error' => 'Cannot fast-forward: diverged'])];

        $this->follow($application);

        Event::assertDispatchedTimes(ClientAreaNotificationRequested::class, 1);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->application->is($application)
            && $event->type === 'user.instance.git_auto_deploy_failed'
            && $event->payload() === ['message' => 'Cannot fast-forward: diverged']
            && $event->isError === true
            && $event->includeInstance === true
            && $event->recipients === null);
    }

    public function test_several_new_hook_deploys_notify_each_once_oldest_first(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        // Two pushes of the same commit between two runs; the second failed.
        // Each is its own deploy, so neither hides the other (the old import's
        // same-second and same-commit cases).
        $this->deploys = [
            $this->hookDeploy(self::NEWER, ['status' => 'failed', 'error' => 'build failed', 'commit' => 'samec0ffee', 'started_at' => 1791976500, 'finished_at' => 1791976600]),
            $this->hookDeploy(self::HOOK, ['commit' => 'samec0ffee', 'started_at' => 1791972900, 'finished_at' => 1791973000]),
            $this->hookDeploy(self::OLD),
        ];

        $this->follow($application);
        $this->follow($application);

        $types = [];
        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use (&$types): bool {
            $types[] = $n->type;

            return true;
        });
        $this->assertSame(['user.instance.git_auto_deploy_finished', 'user.instance.git_auto_deploy_failed'], $types);
        $this->assertSame(
            [GitOperation::STATUS_SUCCESS, GitOperation::STATUS_FAILED],
            GitOperation::query()->orderBy('id')->pluck('status')->all(),
        );
    }

    public function test_a_deploy_below_the_marker_is_never_replayed(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        // The marker passed HOOK (handled or older than the first run): even
        // when the newer deploys are pruned away, HOOK stays handled (the old
        // watermark/keys cases).
        $application->forceFill(['git_hook_deploy_id' => self::NEWER])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK), $this->hookDeploy(self::OLD)];

        $this->follow($application);

        Notification::assertNothingSent();
        $this->assertSame(0, GitOperation::query()->count());
        $this->assertSame(self::NEWER, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_an_item_without_an_engine_deploy_id_is_skipped(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [
            // Defensive (not an Engine shape): an id that is not `Ymd-His-<6 hex>` cannot be ordered against the marker.
            $this->hookDeploy('zzz-not-an-id'),
            $this->hookDeploy(self::HOOK),
        ];

        $this->follow($application);

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        $this->assertSame(self::HOOK, $application->fresh()?->git_hook_deploy_id);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function hiccupReads(): iterable
    {
        yield 'the hook read' => ['git/deploy-hook'];
        yield 'the deploy list' => ['deploys'];
    }

    #[DataProvider('hiccupReads')]
    public function test_an_engine_connection_error_moves_nothing_and_the_next_run_retries(string $path): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];
        $down = true;
        Http::fake([
            "engine.example.com/api/projects/site1/{$path}" => function () use (&$down): mixed {
                if ($down) {
                    throw new ConnectionException('Connection refused');
                }

                return null;
            },
        ]);
        $this->fakeEngine();

        try {
            $this->follow($application);
            $this->fail('An Engine hiccup must bubble so the scheduled run retries.');
        } catch (EngineUnavailableException) {
            // expected
        }

        Notification::assertNothingSent();
        $this->assertSame(self::OLD, $application->fresh()?->git_hook_deploy_id);

        $down = false;
        $this->follow($application);
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
    }

    #[DataProvider('hiccupReads')]
    public function test_an_engine_5xx_moves_nothing_and_the_next_run_retries(string $path): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];
        $down = true;
        Http::fake([
            "engine.example.com/api/projects/site1/{$path}" => function () use (&$down): mixed {
                // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's 5xx body)
                return $down ? Http::response(['message' => 'boom'], 500) : null;
            },
        ]);
        $this->fakeEngine();

        try {
            $this->follow($application);
            $this->fail('An Engine 5xx must bubble so the scheduled run retries.');
        } catch (EngineRequestException $e) {
            $this->assertSame(500, $e->engineStatus);
        }

        Notification::assertNothingSent();
        $this->assertSame(self::OLD, $application->fresh()?->git_hook_deploy_id);

        $down = false;
        $this->follow($application);
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
    }

    public function test_a_project_the_engine_no_longer_has_ends_quietly(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:41 -> index (projectOr404)
            'engine.example.com/api/projects/site1/deploys' => Http::response(['message' => 'Project not found'], 404),
        ]);
        $this->fakeEngine();

        $this->follow($application);

        // The sync removes the row; nothing is reported or sent meanwhile.
        Notification::assertNothingSent();
        $this->assertSame(self::OLD, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_the_job_follows_one_application_with_a_bounded_timeout(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        $this->fakeEngine();
        Notification::fake();
        $this->deploys = [$this->hookDeploy(self::HOOK)];

        $job = new FollowProjectHookDeploysJob($application->id);
        // Two Engine reads plus at most one provider re-registration.
        $this->assertSame(60, $job->timeout);
        $this->assertSame('sync', $job->queue);
        $this->assertSame('user-application:follow-hook-deploys:'.$application->id, $job->uniqueId());

        $job->handle(app(HookDeployFollower::class), app(EngineHealth::class));

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        $this->assertSame(self::HOOK, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_the_job_reports_an_engine_hiccup_and_ends(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        $application->forceFill(['git_hook_deploy_id' => self::OLD])->save();
        Exceptions::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's 5xx body)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'boom'], 500),
        ]);

        (new FollowProjectHookDeploysJob($application->id))->handle(app(HookDeployFollower::class), app(EngineHealth::class));

        // Reported for the operators; the next scheduled run retries.
        Exceptions::assertReported(EngineRequestException::class);
        $this->assertSame(self::OLD, $application->fresh()?->git_hook_deploy_id);
    }

    public function test_the_job_releases_while_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        // The project sync queued type probes; isolate the follow job.
        DB::table('jobs')->delete();
        app(EngineHealth::class)->open($application->engine_id);
        Http::fake();

        FollowProjectHookDeploysJob::dispatch($application->id)->onConnection('database');

        // First worker run: the breaker is open, so the job releases itself
        // instead of calling the known-down Engine.
        $this->workOnce();
        $this->assertSame(0, DB::table('failed_jobs')->count());
        Http::assertNothingSent();

        // Second run after the delay: the released job runs again, not
        // MaxAttemptsExceeded.
        Carbon::setTestNow(now()->addSeconds(FollowProjectHookDeploysJob::DOWN_RETRY_SECONDS + 1));
        $this->workOnce();

        $this->assertSame(0, DB::table('failed_jobs')->count());
        $this->assertSame(2, (int) DB::table('jobs')->value('attempts'));
        Http::assertNothingSent();

        Carbon::setTestNow();
    }

    public function test_the_job_returns_silently_when_the_retry_window_ends(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        DB::table('jobs')->delete();
        app(EngineHealth::class)->open($application->engine_id);
        Http::fake();

        // A window that already ended while the breaker is open: the job ends
        // without a release, so it never lands in failed_jobs and the scheduler
        // fans out again.
        FollowProjectHookDeploysJob::dispatch($application->id, retryDeadline: now()->getTimestamp() - 1)->onConnection('database');
        $this->workOnce();

        $this->assertSame(0, DB::table('failed_jobs')->count());
        $this->assertSame(0, DB::table('jobs')->count());
        Http::assertNothingSent();
    }

    public function test_the_retry_window_is_pinned(): void
    {
        $this->assertSame(60, FollowProjectHookDeploysJob::DOWN_RETRY_SECONDS);
        $this->assertSame(600, FollowProjectHookDeploysJob::RETRY_WINDOW_SECONDS);
        $this->assertSame(660, (new FollowProjectHookDeploysJob(1))->uniqueFor);
    }

    public function test_the_job_notifies_when_the_worker_gives_up(): void
    {
        $user = User::factory()->create();
        $application = $this->hookedApplication($user);
        Notification::fake();

        // The worker timed out or threw past `handle()`.
        (new FollowProjectHookDeploysJob($application->id))->failed();

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => $n->type === 'user.instance.git_auto_deploy_failed'
            && ($n->payload['message'] ?? null) === 'The auto-deploy import stopped.'
            && $n->isError);
    }

    private function workOnce(): void
    {
        $this->artisan('queue:work', [
            'connection' => 'database',
            '--once' => true,
            '--queue' => 'sync',
        ])->run();
    }

    public function test_the_marker_migration_is_idempotent(): void
    {
        /** @var Migration $migration */
        $migration = require base_path('../packages/client-area/database/migrations/2026_10_13_000002_add_git_hook_deploy_id_to_applications_table.php');

        $this->assertTrue(Schema::hasColumn('applications', 'git_hook_deploy_id'));
        $migration->up();
        $this->assertTrue(Schema::hasColumn('applications', 'git_hook_deploy_id'));

        $migration->down();
        $this->assertFalse(Schema::hasColumn('applications', 'git_hook_deploy_id'));
        $migration->down();
        $migration->up();
        $this->assertTrue(Schema::hasColumn('applications', 'git_hook_deploy_id'));
    }
}
