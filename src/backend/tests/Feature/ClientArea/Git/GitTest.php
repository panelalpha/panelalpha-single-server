<?php

namespace Tests\Feature\ClientArea\Git;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Jobs\Git\WatchGitOperationJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\ClientArea\Projects\WorkingTreeDirtyException;
use PanelAlpha\ClientArea\Support\EngineText;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The Git page, backed by the Engine E:/git/* endpoints.
 * The HostGuard is injected/faked so a connect test never resolves a name.
 *
 * Contract:
 *  - CA call sites / bodies: `GET /instances/{id}/git` (GitActionsMixin.js:8), branches :205,
 *    commits (GitRedeployModal.vue:551), connect (Git.vue:1199 -> buildConnectPayload Git.vue:1142-1148:
 *    `{repo_url, auth_type, token}` or `{git_repository_id}`), disconnect :529, repair :22,
 *    pull :294 (`{strategy}`), push :351, revert :387, credentials :464 (`{token, auth_type}`),
 *    auto-deploy :495 (`{auto_deploy_enabled}`), change-branch :264 (`{branch}`).
 *  - Keys the CA reads: git status `connected`, `repo_url`, `branch`, `local_repository_exists`,
 *    `commits_ahead|behind`, `async_status.git_auto_deploy`, `connection_health` (Git.vue:752-916);
 *    push `nothing_to_push` (GitActionsMixin.js:354); branches `data` string[] (:206); commits
 *    `data.commits|from|to|total` (GitRedeployModal.vue:557-561); credentials/auto-deploy `data`
 *    (GitActionsMixin.js:468,498).
 *  - Old routes `PUT /instances/{id}/auto-deploy` and `PUT /instances/{id}/git/credentials`
 *    (packages/api/routes/api.php:267,281), privilege `general.manage_git`; connect and credentials carry
 *    `throttle:outbound` (v1 routes/git.php).
 *  - Engine: core/routes/api.php:246-261 (git/*), envelope `{data: ...}`; a GitException error body on
 *    failure. `show` reads git/status and, when connected, git/deploy-hook.
 * @see packages/client-area/src/views/instance/advanced/Git.vue:1199, mixins/GitActionsMixin.js:205,351,464,495
 * @see Engine core/routes/api.php:246-261 (git/*)
 */
class GitTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->fakeHostGuard();
    }

    private function fakeHostGuard(): void
    {
        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void
            {
                if (! $this->allows($host)) {
                    throw ValidationException::withMessages(['host' => ['blocked']]);
                }
            }

            public function allows(string $host): bool
            {
                return $host !== TestNetwork::private(5);
            }

            public function validatedAddresses(string $host): array
            {
                if (! $this->allows($host)) {
                    throw ValidationException::withMessages(['host' => ['blocked']]);
                }

                return [$host];
            }
        });
    }

    private function application(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']]),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        // CA reads: packages/client-area/src/apis/Instances.js:79 (`response.data.data`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    public function test_show_returns_the_ca_git_payload(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status; deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true,
                'repository_exists' => true,
                'remote_url' => 'https://github.com/acme/site',
                'branch' => 'main',
                'dirty' => false,
                'tracking' => 'origin/main',
                'commits_ahead' => 0,
                'commits_behind' => 2,
                'managed_by' => 'deploy',
            ]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:752,797,806,831,913,916 (`connected`, `local_repository_exists`, `async_status.git_auto_deploy`, `drift_status`, `connection_health`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.branch', 'main')
            ->assertJsonPath('data.repo_url', 'https://github.com/acme/site')
            ->assertJsonPath('data.commits_behind', 2)
            // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:797 (`local_repository_exists`)
            ->assertJsonPath('data.local_repository_exists', true)
            // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:831 (`gitStatus.drift_status === "dirty"`)
            ->assertJsonPath('data.drift_status', 'clean')
            ->assertJsonPath('data.commits_ahead', 0)
            // Passed through for a client to hide disconnect/push (the Engine refuses them for `deploy`).
            ->assertJsonPath('data.managed_by', 'deploy')
            // No provider token is saved: the CA asks for one.
            // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:9 (`response.data.data`; `auth_type` is read only by client-area-next)
            ->assertJsonPath('data.auth_type', null)
            ->assertJsonStructure(['data' => ['async_status' => ['git_attach', 'git_pull', 'git_auto_deploy']]]);
    }

    /**
     * The old `auth_type` was the repository's
     * connect-time choice; v1 says whether the panel holds a readable token,
     * and the CA shows the token field while it is null (auto-deploy needs it).
     */
    public function test_show_reports_whether_a_provider_token_is_saved(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_saved'])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status; deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:9 (`response.data.data`; `auth_type` is read only by client-area-next's `hasAccessToken`)
            ->assertJsonPath('data.auth_type', 'pat')
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:9 (the git payload never carries the token)
            ->assertDontSee('ghp_saved');

        // A token the current APP_KEY cannot decrypt counts as none.
        DB::table('applications')->where('id', $application->id)->update(['git_token' => 'not-a-ciphertext']);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:9 (`response.data.data`; `auth_type` is read only by client-area-next)
            ->assertJsonPath('data.auth_type', null);
    }

    public function test_show_reports_a_dirty_working_tree_as_drift(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status; deploy-hook GET DeployHookController.php:158 -> DeployHookController::show
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true,
                'repository_exists' => true,
                'remote_url' => 'https://github.com/acme/site',
                'branch' => 'main',
                'dirty' => true,
                'commits_ahead' => 1,
                'commits_behind' => 0,
            ]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:831 (`gitStatus.drift_status === "dirty"`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
            ->assertJsonPath('data.drift_status', 'dirty')
            ->assertJsonPath('data.commits_ahead', 1);
    }

    public function test_show_reports_no_drift_when_the_repository_is_absent(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine's absent-repository status: `repository_exists=false`
        // with `dirty=false` (WorkTree::status), so the panel must not read the
        // false `dirty` as "clean".
        Http::fake([
            // Engine: core/app/System/Project/Git/WorkTree.php:358 -> status() (repositoryExistsLenient() branch)
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true,
                'repository_exists' => false,
                'remote_url' => null,
                'branch' => null,
                'dirty' => false,
                'tracking' => null,
                'commits_ahead' => null,
                'commits_behind' => null,
                'connecting' => false,
                'connecting_since' => null,
            ]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status; deploy-hook GET DeployHookController.php:158 -> DeployHookController::show
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:797 (`local_repository_exists`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
            ->assertJsonPath('data.local_repository_exists', false)
            // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:831 (`gitStatus.drift_status`)
            ->assertJsonPath('data.drift_status', null);
    }

    public function test_show_surfaces_the_hook_tls_warning(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status; deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true,
                'branch' => 'main',
                'repository_exists' => true,
            ]]),
            // Engine DeployHookController::show carries `tls` with a warning for a
            // self-signed certificate (core/app/Http/Controllers/User/DeployHookController.php:120-150).
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/abc',
                'tls' => ['state' => 'self_signed', 'warning' => 'The Engine certificate is self-signed'],
            ]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:752,797,806,831,913,916 (`connected`, `local_repository_exists`, `async_status.git_auto_deploy`, `drift_status`, `connection_health`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertOk()
            ->assertJsonPath('data.connection_health.status', 'warning')
            ->assertJsonPath('data.connection_health.reason', 'The Engine certificate is self-signed');
    }

    public function test_connect_stores_the_repo_and_returns_the_payload(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'develop']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'auth_type' => null,
                'token' => null,
            ])
            ->assertOk();

        $this->assertSame('https://github.com/acme/other', $application->fresh()->git_source);

        // A public connect without a token has nothing to check at the provider.
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com'));
    }

    /** A slow first clone is not a failed connect: the Engine may spend its whole clone budget. */
    public function test_a_connect_that_clones_past_the_default_budget_gets_the_long_engine_timeout(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $spy = $this->spyEngineTimeout($application);
        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'auth_type' => null,
                'token' => null,
            ])
            ->assertOk();

        $this->assertSame(EngineClient::LONG_TIMEOUT_SECONDS, $spy->requestedTimeout);
        $this->assertSame(1700, EngineClient::LONG_TIMEOUT_SECONDS);
    }

    public function test_connect_keeps_the_provider_token_encrypted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:246 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (200 for a token GitHub knows)
            'api.github.com/*' => Http::response(['full_name' => 'acme/site']),
        ]);

        $response = $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/site',
                'auth_type' => 'pat',
                'token' => 'ghp_secret',
            ])
            ->assertOk();

        // The token never reaches the CA.
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (the CA renders only the git payload, never the token)
        $response->assertDontSee('ghp_secret');

        $fresh = $application->fresh();
        $this->assertSame('github', $fresh->git_provider);
        $this->assertSame('ghp_secret', $fresh->git_token);

        // Encrypted at rest.
        $raw = DB::table('applications')->where('id', $application->id)->value('git_token');
        $this->assertIsString($raw);
        $this->assertStringNotContainsString('ghp_secret', $raw);
    }

    public function test_a_connect_with_a_token_the_provider_does_not_know_connects_nothing(): void
    {
        $user = User::factory()->create();
        // A project without a repository: nothing is connected yet.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:246 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (401 Bad credentials for a token GitHub does not have)
            'api.github.com/*' => Http::response(['message' => 'Bad credentials'], 401),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast; the v1 SPA's `connectFieldRefusal` puts `errors.token` under the Access token field)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'branch' => 'main',
                'auth_type' => 'pat',
                'token' => 'not-a-real-token',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', GitService::TOKEN_REFUSED_MESSAGE);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && $r->url() === 'https://api.github.com/repos/acme/other'
            && $r->hasHeader('Authorization', 'Bearer not-a-real-token'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/git/connect'));

        $fresh = $application->fresh();
        $this->assertNull($fresh->git_source);
        $this->assertNull($fresh->git_token);
        $this->assertSame(0, GitOperation::query()->where('application_id', $application->id)->count());
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function blankPatTokens(): array
    {
        return [
            'whitespace only' => [['token' => '   ']],
            'null' => [['token' => null]],
            'absent' => [[]],
        ];
    }

    /** A `pat` connect without a token is refused, not run as the anonymous clone the form never asked for. */
    #[DataProvider('blankPatTokens')]
    public function test_a_pat_connect_with_a_blank_token_connects_nothing(array $credentials): void
    {
        $user = User::factory()->create();
        // A project without a repository: nothing is connected yet.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:116 -> SourceInspectionController::inspect (the branch default)
            'engine.example.com/api/source/inspect' => Http::response(['data' => ['source' => ['git' => ['branch' => 'main']]]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:246 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository
            'api.github.com/*' => Http::response(['full_name' => 'acme/other']),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`connectFieldRefusal` puts `errors.token` under the Access token field)
            ->postJson("/api/projects/{$application->id}/git/connect", array_merge([
                'repo_url' => 'https://github.com/acme/other',
                'auth_type' => 'pat',
            ], $credentials))
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', GitService::ACCESS_TOKEN_REQUIRED_MESSAGE);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/git/connect')
            || str_contains($r->url(), '/source/refs')
            || str_contains($r->url(), 'api.github.com'));

        $fresh = $application->fresh();
        $this->assertNull($fresh->git_source);
        $this->assertNull($fresh->git_token);
        $this->assertSame(0, GitOperation::query()->where('application_id', $application->id)->count());
    }

    /** The token dialog always says `pat`; a cleared field must not wipe the stored token instead. */
    #[DataProvider('blankPatTokens')]
    public function test_a_pat_credentials_update_with_a_blank_token_is_refused(array $credentials): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/GitController.php:246 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:476 (`Api.getErrorMessage(error)` on the failed update)
            ->putJson("/api/projects/{$application->id}/git/credentials", array_merge(['auth_type' => 'pat'], $credentials))
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', GitService::ACCESS_TOKEN_REQUIRED_MESSAGE);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/git/update-credentials')
            || str_contains($r->url(), '/source/refs'));
        $this->assertSame('ghp_old', $application->fresh()->git_token);
    }

    /** A provider that cannot answer did not refuse the token: the connect goes on and the token is kept. */
    public function test_a_connect_whose_provider_cannot_be_asked_still_connects(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:246 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: an unreachable provider API.
            'api.github.com/*' => Http::response(['message' => 'Server Error'], 500),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'branch' => 'main',
                'auth_type' => 'pat',
                'token' => 'ghp_secret',
            ])
            ->assertOk();

        $this->assertSame('ghp_secret', $application->fresh()->git_token);
    }

    public function test_credentials_update_keeps_the_new_provider_token(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (the provider knows the token)
            'api.github.com/*' => Http::response(['full_name' => 'acme/site']),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            ->assertOk()
            // The returned status hides the CA's token field again.
            // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data`; `auth_type` is read only by client-area-next)
            ->assertJsonPath('data.auth_type', 'pat');

        $this->assertSame('ghp_new', $application->fresh()->git_token);
    }

    /**
     * Unlike the old panel, the Engine reads the connected repository
     * with the new token before anything is stored. The old panel saved the
     * token, then ran `testRemoteAccess` (GitController.php:751-786), so a
     * refused token stayed stored behind its error.
     */
    public function test_a_credentials_update_checks_the_token_against_the_repository_first(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (the provider knows the token)
            'api.github.com/*' => Http::response(['full_name' => 'acme/site']),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_new', 'auth_type' => 'pat'])
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data`)
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/api/source/refs')
            && $r['repository'] === 'https://github.com/acme/site'
            && $r['git_token'] === 'ghp_new');
    }

    /**
     * The repository read cannot refuse a token on a public repository: git
     * never sends credentials to one. The provider's API is asked for the
     * repository with the token as well, and a provider that does not know the
     * token refuses it there (401), so it is not saved.
     */
    public function test_a_token_the_provider_does_not_know_is_refused_on_a_public_repository(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (a public repository is read anonymously)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (401 Bad credentials for a token GitHub does not have)
            'api.github.com/*' => Http::response(['message' => 'Bad credentials'], 401),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:476 (`Api.getErrorMessage(error)` on the failed update)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'not-a-real-token', 'auth_type' => 'pat'])
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', GitService::TOKEN_REFUSED_MESSAGE);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && $r->url() === 'https://api.github.com/repos/acme/site'
            && $r->hasHeader('Authorization', 'Bearer not-a-real-token'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/git/update-credentials'));
        $this->assertSame('ghp_old', $application->fresh()->git_token);
    }

    /**
     * A provider that does not answer at all did not refuse the token, and the
     * repository read already passed: the token is saved rather than lost to an
     * outage.
     */
    public function test_a_provider_outage_does_not_refuse_a_token_the_repository_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: an unreachable provider API.
            'api.github.com/*' => Http::response(['message' => 'Server Error'], 500),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_new', 'auth_type' => 'pat'])
            ->assertOk();

        $this->assertSame('ghp_new', $application->fresh()->git_token);
    }

    /**
     * @return array<string, array{\Closure(): \GuzzleHttp\Promise\PromiseInterface, string}>
     */
    public static function refusedTokenChecks(): array
    {
        return [
            // Engine: core/app/Http/Controllers/SourceRefsController.php:111-113 -> refsFailure() (AUTHENTICATION_FAILED: 422 on git_token, the probe's `git_token_rejected` message)
            'the repository refuses the token' => [
                fn () => Http::response([
                    'message' => 'The token was refused by github.com. Check it has not expired and that it grants read access to this repository.',
                    'errors' => ['git_token' => ['The token was refused by github.com. Check it has not expired and that it grants read access to this repository.']],
                    'problems' => [['field' => 'git_token', 'code' => 'authentication_failed', 'message' => 'The token was refused by github.com.']],
                ], 422),
                GitService::TOKEN_REFUSED_MESSAGE,
            ],
            // Engine: core/app/Http/Controllers/SourceRefsController.php:109 -> refsFailure() (NOT_FOUND: 422 repository_not_found, the probe's `repository_not_found` message)
            'the repository is not found with this token' => [
                fn () => Http::response([
                    'message' => 'No such repository on github.com, or the token cannot see it.',
                    'errors' => ['repository' => ['No such repository on github.com, or the token cannot see it.']],
                    'problems' => [['field' => 'repository', 'code' => 'repository_not_found', 'message' => 'No such repository on github.com, or the token cannot see it.']],
                ], 422),
                GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE,
            ],
            // Engine: core/app/Lib/Deploy/Source/RepositoryAddress.php:34 + SourceRefsController.php:96-101 (host_refused: 422 on repository, before any token is used)
            'the address is not fetched from' => [
                fn () => Http::response([
                    'message' => 'github.internal resolves to '.TestNetwork::private(5).', which this engine does not fetch from.',
                    'errors' => ['repository' => ['github.internal resolves to '.TestNetwork::private(5).', which this engine does not fetch from.']],
                    'problems' => [[
                        'field' => 'repository',
                        'code' => 'host_refused',
                        'message' => 'github.internal resolves to '.TestNetwork::private(5).', which this engine does not fetch from.',
                    ]],
                ], 422),
                GitService::TOKEN_ADDRESS_REFUSED_MESSAGE,
            ],
            // Engine: core/app/Lib/Deploy/Source/GitTokenInput.php:143-148 (git_token_has_auth_prefix: 422 from GitAccessToken, no code we map)
            'any other refusal keeps the Engine sentence' => [
                fn () => Http::response([
                    'message' => 'Send the token itself, not a whole Authorization header: drop everything before the credential.',
                    'errors' => ['git_token' => ['Send the token itself, not a whole Authorization header: drop everything before the credential.']],
                    'problems' => [[
                        'field' => 'git_token',
                        'code' => 'git_token_has_auth_prefix',
                        'message' => 'Send the token itself, not a whole Authorization header: drop everything before the credential.',
                    ]],
                ], 422),
                'Send the token itself, not a whole Authorization header: drop everything before the credential.',
            ],
            // Engine: core/app/Http/Controllers/SourceRefsController.php:115-118 -> refsFailure() (UNREACHABLE: 502)
            'the repository cannot be reached' => [
                fn () => Http::response(['message' => 'The remote could not be reached.', 'code' => 'unreachable'], 502),
                GitService::TOKEN_UNCHECKED_MESSAGE,
            ],
        ];
    }

    /**
     * A token the check does not pass is a 422 on
     * `token`, and neither the Engine nor the panel stores it.
     *
     * @param  \Closure(): \GuzzleHttp\Promise\PromiseInterface  $refsAnswer
     */
    #[DataProvider('refusedTokenChecks')]
    public function test_a_token_the_check_does_not_pass_is_not_stored(\Closure $refsAnswer, string $message): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => $refsAnswer(),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_typo', 'auth_type' => 'pat'])
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:476 (`Api.getErrorMessage(error)` on the failed update)
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', $message);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/git/update-credentials'));
        $this->assertSame('ghp_old', $application->fresh()->git_token);
    }

    /**
     * The Engine mirror can report a repository URL
     * the panel's parser refuses – the Engine's own `GitRepoInput` takes an scp
     * remote whose host holds a `_` or an IPv6 literal
     * (`GitRepoInput.php:14-16`), the panel's `RepositoryUrl::normalizeHost()`
     * only `[a-z0-9.-]`. Such a URL is never sent to the Engine, and the token
     * is not stored unchecked.
     */
    public function test_an_unparsable_recorded_repository_refuses_the_token_unchecked(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $payload = $application->engine_payload ?? [];
        $payload['details'] = array_merge($payload['details'] ?? [], ['git_repo' => 'git@git_server.example:acme/site.git']);
        $application->forceFill(['engine_payload' => $payload, 'git_token' => 'ghp_old'])->save();

        // No Engine stub beyond the projects list: a token check that reached
        // the Engine would fail through Http::preventStrayRequests().

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_new', 'auth_type' => 'pat'])
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:476 (`Api.getErrorMessage(error)` on the failed update)
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', GitService::TOKEN_ADDRESS_UNREADABLE_MESSAGE);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/source/refs')
            || str_contains($r->url(), '/git/update-credentials'));
        $this->assertSame('ghp_old', $application->fresh()->git_token);
    }

    /**
     * An SSH repository is reached with the project's deploy key, so the token
     * check is skipped and the credentials write goes ahead.
     */
    public function test_an_ssh_repository_skips_the_token_check(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_new', 'auth_type' => 'pat'])
            ->assertOk();

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/api/source/refs'));
        $this->assertSame('ghp_new', $application->fresh()->git_token);
    }

    /**
     * The URL the check sends is host-guarded here too: the
     * Engine mirror's repository was never checked by the panel when it was
     * recorded, so a repository on a host the panel must not contact is refused
     * before the Engine sees it.
     */
    public function test_a_recorded_repository_on_a_blocked_host_is_never_sent_to_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $payload = $application->engine_payload ?? [];
        $payload['details'] = array_merge($payload['details'] ?? [], ['git_repo' => 'https://'.TestNetwork::private(5).'/acme/site.git']);
        $application->forceFill(['engine_payload' => $payload, 'git_token' => 'ghp_old'])->save();

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => 'ghp_new', 'auth_type' => 'pat'])
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:476 (`Api.getErrorMessage(error)` on the failed update)
            ->assertStatus(422)
            ->assertJsonPath('errors.host.0', 'blocked');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/source/refs')
            || str_contains($r->url(), '/git/update-credentials'));
        $this->assertSame('ghp_old', $application->fresh()->git_token);
    }

    /** Clearing the token sends nothing to check. */
    public function test_clearing_the_token_is_not_checked(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
            ->putJson("/api/projects/{$application->id}/git/credentials", ['token' => null])
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data`)
            ->assertOk()
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data`; `auth_type` is read only by client-area-next)
            ->assertJsonPath('data.auth_type', null);

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/api/source/refs'));
        $this->assertNull($application->fresh()->git_token);
    }

    public function test_a_credentials_update_with_the_engine_down_keeps_the_provider_hook(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_old',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine down: the credentials write bubbles a 503 before the token is
        // stored or the Engine hook is rotated, so the provider webhook is not
        // touched.
        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            'engine.example.com/api/projects/site1/git/update-credentials' => fn () => throw new ConnectionException('down'),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            ->assertStatus(503);

        $fresh = $application->fresh();
        $this->assertSame('555', $fresh->git_webhook_id);
        $this->assertSame('ghp_old', $fresh->git_token);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com'));
    }

    public function test_credentials_update_rotates_the_engine_hook_and_the_provider_webhook(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_old',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        $rotated = '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90';
        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68), POST :258/rotate :260)
        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/new',
                'secret' => $rotated,
                'tls' => ['state' => 'valid'],
            ]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['id' => 999]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            ->assertOk();

        // A new credential invalidates the Engine hook, so it is rotated and
        // the provider webhook re-registered at the new URL and secret.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://engine.example.com/api/projects/site1/git/deploy-hook/rotate');
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks'
            && $r['config']['secret'] === $rotated);
        $this->assertSame('999', $application->fresh()->git_webhook_id);
    }

    public function test_a_failed_rotate_answers_422_and_disables_auto_deploy(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_old',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68), POST :258/rotate :260)
        Http::fake([
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/new',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'valid'],
            ]]),
            // The provider refuses the re-registration.
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['message' => 'nope'], 500),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            ->assertStatus(422)
            // Old api/messages.git_webhook_registration_failed text, key 0.
            ->assertJsonPath('errors.0.0', 'Could not register a webhook with the Git provider. Check that your token can manage webhooks for this repository.');

        // Auto-deploy is left off rather than pointing at a hook that does not
        // exist at the provider.
        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_a_failed_rotate_keeps_the_stored_hook_when_the_engine_delete_also_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_old',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68), POST :258/rotate :260)
        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:287 (respond -> {data})
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // The rotate fails at the Engine, so no provider hook is re-registered ...
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198 (a 500 body is any Engine failure)
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['message' => 'Engine is down'], 500),
            // ... and the fallback teardown cannot drop the Engine hook either.
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 (respond -> GitException body)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'Engine is down'], 500),
            // External: GitHub API (only the token check's repository read; no webhook call, which an Engine failure precedes)
            'api.github.com/*' => Http::response(['id' => 999]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            // The Engine error reaches the CA, not the old registration text.
            ->assertStatus(502)
            ->assertJsonPath('message', 'Engine is down')
            ->assertJsonMissingPath('errors.0.0');

        // Both hooks are still live: the marker stays and the provider webhook
        // is not touched, or the panel would lose track of a hook the host
        // still calls.
        $this->assertSame('555', $application->fresh()->git_webhook_id);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com') && str_contains($r->url(), '/hooks'));
    }

    public function test_a_credentials_update_with_the_engine_down_keeps_the_stored_hook(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_old',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // The credentials write answers 200, then both the rotate and the
        // fallback teardown lose the Engine. Nothing may be cleared and the
        // provider webhook must not be touched: the Engine still serves the
        // hook, so the CA must see the Engine error (503), not the
        // registration-failed 422 after a local clear.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:287 -> GitController::updateCredentials
            // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs (the token check)
            'engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main']]]),
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:198 -> DeployHookController::rotate
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => fn () => throw new ConnectionException('down'),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 -> DeployHookController::destroy
            'engine.example.com/api/projects/site1/git/deploy-hook' => fn () => throw new ConnectionException('down'),
            // External: GitHub API (only the token check's repository read; no webhook call, which the Engine failure precedes)
            'api.github.com/*' => Http::response(['id' => 999]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`Api.put('/instances/{id}/git/credentials', {token, auth_type})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:468 (`response.data.data` – the git payload, never the token)
            ->putJson("/api/projects/{$application->id}/git/credentials", [
                // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (body {token, auth_type})
                'token' => 'ghp_new',
                'auth_type' => 'pat',
            ])
            ->assertStatus(503);

        // The panel forwards the CA's token to the Engine before rotating the
        // hook; the CA-only `auth_type` is dropped, not sent on.
        // Engine: core/app/Http/Requests/Git/GitUpdateCredentialsRequest.php:26 -> `token` is the Engine field
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && $r->url() === 'https://engine.example.com/api/projects/site1/git/update-credentials'
            && ($r['token'] ?? null) === 'ghp_new');

        $fresh = $application->fresh();
        $this->assertSame('555', $fresh->git_webhook_id);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com') && str_contains($r->url(), '/hooks'));
    }

    public function test_disconnect_removes_the_provider_webhook_and_clears_the_mirror(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
            'git_source' => 'https://github.com/acme/site',
            'git_last_commit_hash' => str_repeat('a', 40),
            'git_last_commit_message' => 'Deployed',
            'git_last_commit_at' => now(),
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:209 -> GitController::disconnect (+status :246, deploy-hook DELETE :261)
        Http::fake([
            'engine.example.com/api/projects/site1/git/disconnect' => Http::response(['data' => ['connected' => false]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => false]]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:223
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:529 (`Api.post('/instances/{id}/git/disconnect')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:9 (the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/disconnect")
            ->assertOk();

        // The provider webhook is ours to remove; the Engine hook goes with
        // the Engine disconnect.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');

        $fresh = $application->fresh();
        $this->assertNull($fresh->git_source);
        $this->assertNull($fresh->git_token);
        $this->assertNull($fresh->git_webhook_id);
        $this->assertNull($fresh->git_last_commit_hash);
        $this->assertNull($fresh->git_last_commit_message);
        $this->assertNull($fresh->git_last_commit_at);
    }

    public function test_connect_without_a_repository_is_rejected(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['repo_url', 'git_repository_id']);
    }

    public function test_connect_reuses_the_recorded_repository(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_last_commit_hash' => str_repeat('a', 40),
            'git_last_commit_message' => 'Deployed',
            'git_last_commit_at' => now(),
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        // The CA sends only the pair's `git_repository_id` (Git.vue:1142-1147).
        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", ['git_repository_id' => 5])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/connect')
            && $r['repo_url'] === 'https://github.com/acme/site'
            && $r['branch'] === 'main');

        // A fresh connect starts the deploy record over: no old message or date.
        $fresh = $application->fresh();
        $this->assertNull($fresh->git_last_commit_hash);
        $this->assertNull($fresh->git_last_commit_message);
        $this->assertNull($fresh->git_last_commit_at);
    }

    public function test_repair_re_adopts_the_recorded_repository(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_last_commit_hash' => str_repeat('a', 40),
            'git_last_commit_message' => 'Deployed',
            'git_last_commit_at' => now(),
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:22 (`Api.post('/instances/{id}/git/repair')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:24 (`refreshGitStatus`)
            ->postJson("/api/projects/{$application->id}/git/repair")
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/connect')
            && $r['repair'] === true
            && $r['repo_url'] === 'https://github.com/acme/site');

        // A repair keeps the deploy record it re-adopts.
        $fresh = $application->fresh();
        $this->assertSame(str_repeat('a', 40), $fresh->git_last_commit_hash);
        $this->assertSame('Deployed', $fresh->git_last_commit_message);
        $this->assertNotNull($fresh->git_last_commit_at);
    }

    public function test_show_surfaces_an_unreachable_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // An unreachable Engine must not look like "not connected".
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:752,797,806,831,913,916 (`connected`, `local_repository_exists`, `async_status.git_auto_deploy`, `drift_status`, `connection_health`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertStatus(503);
    }

    public function test_pull_push_and_revert_reach_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull (200 from a site_git checkout); :367 push; :413 revert
        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (the pull asks for the tree before it pulls)
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/push' => Http::response(['data' => ['nothing_to_push' => true]]),
            'engine.example.com/api/projects/site1/git/revert' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits (the HEAD the CA commit column shows)
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [[
                'hash' => str_repeat('b', 40),
                'short_hash' => 'bbbbbbb',
                'subject' => 'Deploy the site',
                'author' => 'Dev',
                'date' => '2026-10-11T10:00:00+00:00',
            ]]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:296 (`refreshGitStatus`, no body read)
            ->postJson("/api/projects/{$application->id}/git/pull", ['strategy' => 'ff'])
            ->assertOk();

        // The CA reads the top-level `nothing_to_push` flag (GitActionsMixin.js:354).
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:351 (`Api.post('/instances/{id}/git/push')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:354 (`response.data.nothing_to_push`)
            ->postJson("/api/projects/{$application->id}/git/push")
            ->assertOk()
            ->assertJsonPath('nothing_to_push', true);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:387 (`Api.post('/instances/{id}/git/revert')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:388 (`refreshGitStatus`)
            ->postJson("/api/projects/{$application->id}/git/revert")
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/pull') && $r['strategy'] === 'ff');
        Http::assertSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/git/revert'));

        // Every operation lands in the panel-owned log the CA's table reads,
        // with the HEAD commit the commit column shows (GitLogsTable.vue:72-83).
        $pull = GitOperation::query()->where('application_id', $application->id)->where('action', GitOperation::ACTION_PULL)->firstOrFail();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $pull->status);
        $this->assertSame(str_repeat('b', 40), $pull->commit_hash);
        $this->assertSame('Deploy the site', $pull->commit_message);
        $this->assertNotNull($pull->commit_at);

        $push = GitOperation::query()->where('application_id', $application->id)->where('action', GitOperation::ACTION_PUSH)->firstOrFail();
        $this->assertSame(GitOperation::STATUS_SKIPPED, $push->status);
        // The old `api/messages.git_nothing_to_push` text.
        $this->assertSame(GitService::PUSH_NOTHING_MESSAGE, $push->error_message);

        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_REVERT,
            'status' => GitOperation::STATUS_SUCCESS,
            'commit_hash' => str_repeat('b', 40),
        ]);

        // The synchronous pull moved the last deployed commit to the pulled head.
        // The revert after it does not touch the deployed commit.
        $fresh = $application->fresh();
        $this->assertSame(str_repeat('b', 40), $fresh?->git_last_commit_hash);
        $this->assertSame('Deploy the site', $fresh?->git_last_commit_message);
        $this->assertSame('2026-10-11T10:00:00.000000Z', $fresh?->git_last_commit_at?->toJSON());
    }

    public function test_a_plain_pull_of_a_dirty_tree_asks_before_discarding(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (`dirty` is the checkout's `git status --porcelain`)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => true,
            ]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['connected' => true]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:312 (`error_code === 'git_working_tree_dirty'` opens the pull dirty dialog),
        // packages/client-area/src/apis/Api.js:79-85 (`error_code`, the `errors` groups and `message` of the error body)
            ->postJson("/api/projects/{$application->id}/git/pull")
            ->assertStatus(422)
            ->assertJsonPath('error_code', WorkingTreeDirtyException::ERROR_CODE)
            ->assertJsonPath('message', WorkingTreeDirtyException::MESSAGE)
            ->assertJsonPath('errors.git.0', WorkingTreeDirtyException::MESSAGE);

        // Nothing was pulled, so nothing may be listed as pulled.
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/pull'));
        $this->assertDatabaseMissing('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
        ]);
    }

    public function test_a_strategy_pull_of_a_dirty_tree_reaches_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The read is faked too, so the strategy's own path is what answers: no status is asked for it.
        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (`dirty` is the checkout's `git status --porcelain`)
        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => true,
            ]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits (the HEAD the CA commit column shows)
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [[
                'hash' => str_repeat('c', 40), 'short_hash' => 'ccccccc', 'subject' => 'Force pull',
                'author' => 'Dev', 'date' => '2026-10-11T10:00:00+00:00',
            ]]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', strategy ? { strategy } : {})`)
            ->postJson("/api/projects/{$application->id}/git/pull", ['strategy' => 'force'])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/pull') && $r['strategy'] === 'force');
        // A strategy answers the question the read would ask, so it is not read.
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/status'));
        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);
    }

    public function test_changing_the_branch_of_a_dirty_tree_answers_the_discard_code(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineDeploys('site1', [$this->engineDeploy()]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (`dirty` is the checkout's `git status --porcelain`)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => true,
            ]]),
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['status' => 'done']], 200),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:312 (a dirty tree is `git_working_tree_dirty`, never a plain toast)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop'])
            ->assertStatus(422)
            ->assertJsonPath('error_code', WorkingTreeDirtyException::ERROR_CODE)
            ->assertJsonPath('errors.git.0', WorkingTreeDirtyException::MESSAGE);

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/change-branch'));
        $this->assertDatabaseMissing('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_BRANCH_CHANGE,
        ]);
    }

    public function test_the_engines_own_dirty_refusal_answers_the_discard_code(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineDeploys('site1', [$this->engineDeploy()]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/User/GitController.php:256 -> GitController::changeBranch (the Engine's queuedOrDone answers the 422)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
                'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false,
            ]]),
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response([
                'message' => 'Working tree is dirty.',
                'errors' => ['git' => ['Working tree is dirty.']],
            ], 422),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:312 (`error_code === 'git_working_tree_dirty'` is the dialog, not the message)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop'])
            ->assertStatus(422)
            ->assertJsonPath('error_code', WorkingTreeDirtyException::ERROR_CODE)
            ->assertJsonPath('message', WorkingTreeDirtyException::MESSAGE);

        Queue::assertNotPushed(WatchDeployJob::class);
    }

    /**
     * A pull the Engine could not run answers the panel's own sentence, not the
     * raw `git` stderr (`fatal: repository … not found`, an askpass prompt) it
     * sends; the failed row the Deployment log reads carries the same sentence
     * and the detail goes to the server log.
     */
    public function test_a_failed_pull_answers_the_guides_sentence_not_the_git_stderr(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $stderr = "fatal: repository 'https://example.com/acme/site.git/' not found\n";
        Log::spy();

        // Engine: core/app/System/Project/Git/WorkTree.php:989 -> pull -> fetchBranch (a GitException 400 whose message is the git stderr)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['message' => $stderr], 400),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:302 (`getErrorMessage(error)` -> the error toast)
            ->postJson("/api/projects/{$application->id}/git/pull")
            ->assertStatus(502)
            ->assertJsonPath('message', GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE);

        $row = GitOperation::query()->where('application_id', $application->id)->where('action', GitOperation::ACTION_PULL)->firstOrFail();
        $this->assertSame(GitOperation::STATUS_FAILED, $row->status);
        $this->assertSame(GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE, $row->error_message);

        Log::shouldHaveReceived('warning')->with('Git operation failed.', Mockery::on(
            static fn (array $context): bool => $context['operation'] === 'pull' && str_contains((string) $context['message'], 'not found'),
        ))->once();
    }

    /**
     * The branch list reads the remote, the checkout fetches one branch only:
     * `git log` of another branch fails with "unknown revision". The answer is
     * an empty list marked unfetched (the redeploy then switches and fetches),
     * never the raw stderr.
     */
    public function test_commits_of_a_branch_the_checkout_has_not_fetched_are_marked_unfetched(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $stderr = "fatal: ambiguous argument 'workflow-permissions': unknown revision or path not in the working tree.\n";
        Log::spy();

        // Engine: core/app/System/Project/Git/WorkTree.php:606 -> commits -> readCommits (a GitException 400 with the git stderr)
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::response(['message' => $stderr], 400)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.commits|from|to|total`, `data.branch_fetched`)
            ->getJson("/api/projects/{$application->id}/git/commits?branch=workflow-permissions")
            ->assertOk()
            ->assertJsonPath('data.commits', [])
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('data.to', null)
            ->assertJsonPath('data.branch_fetched', false);

        Log::shouldHaveReceived('warning')->with('Git commits: the branch is not in the checkout yet.', Mockery::any())->once();
    }

    public function test_any_other_commits_failure_still_bubbles(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:606 -> commits (a checkout that cannot be read at all)
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::response(['message' => 'fatal: not a git repository\n'], 400)]);

        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:563-569 (`applyCommitsError` -> the fetch error line)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/commits?branch=main")
            ->assertStatus(502);
    }

    public function test_a_202_pull_is_recorded_in_progress_with_its_task_id(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:496 -> queuedOrDone (202 + TaskResource, `data.id`)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['id' => 4242, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/pull", [])
            ->assertOk();

        $operation = GitOperation::query()->where('application_id', $application->id)->where('action', GitOperation::ACTION_PULL)->firstOrFail();
        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, $operation->status);
        $this->assertSame(4242, $operation->engine_task_id);
        Queue::assertPushed(WatchGitOperationJob::class);
    }

    public function test_the_watcher_settles_a_completed_pull_and_records_the_head_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [[
                'hash' => str_repeat('c', 40),
                'short_hash' => 'ccccccc',
                'subject' => 'Pulled',
                'author' => 'Dev',
                'date' => '2026-10-11T11:00:00+00:00',
            ]]]),
        ]);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $operation->status);
        $this->assertSame(str_repeat('c', 40), $operation->commit_hash);
        $this->assertSame('Pulled', $operation->commit_message);

        // A settled pull records the same head as the last deployed commit.
        $fresh = $application->fresh();
        $this->assertSame(str_repeat('c', 40), $fresh?->git_last_commit_hash);
        $this->assertSame('Pulled', $fresh?->git_last_commit_message);
        $this->assertSame('2026-10-11T11:00:00.000000Z', $fresh?->git_last_commit_at?->toJSON());
    }

    public function test_the_watcher_settles_a_completed_revert_without_moving_the_deployed_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_last_commit_hash' => str_repeat('a', 40), 'git_last_commit_message' => 'Deployed'])->save();

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_REVERT,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'completed']]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [[
                'hash' => str_repeat('c', 40),
                'short_hash' => 'ccccccc',
                'subject' => 'Reverted',
                'author' => 'Dev',
                'date' => '2026-10-11T11:00:00+00:00',
            ]]]),
        ]);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $operation->status);
        $this->assertSame(str_repeat('c', 40), $operation->commit_hash);

        $fresh = $application->fresh();
        $this->assertSame(str_repeat('a', 40), $fresh?->git_last_commit_hash);
        $this->assertSame('Deployed', $fresh?->git_last_commit_message);
    }

    public function test_the_watcher_settles_a_failed_pull_with_the_engine_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_REVERT,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a failed task carries details.error)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => [
            'id' => 4242,
            'status' => 'failed',
            'details' => ['error' => 'Checkout is dirty.'],
        ]])]);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertSame('Checkout is dirty.', $operation->error_message);
    }

    public function test_the_watcher_fails_the_row_when_the_task_is_gone(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the task is gone)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['message' => 'Not found.'], 404)]);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->handle(app(EngineResolver::class));

        // A 404 task is terminal: the row ends failed and is not polled again.
        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertNull($operation->error_message);
        Queue::assertNotPushed(WatchGitOperationJob::class);
    }

    public function test_the_watcher_redispatches_a_running_pull(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a queued/running task is not terminal)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'running']])]);

        // One second before the 1 h cap the row stays open and the next poll is queued.
        (new WatchGitOperationJob(
            $application->id,
            $operation->id,
            4242,
            now()->getTimestamp() - (WatchGitOperationJob::WALL_CLOCK_SECONDS - 1),
        ))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, $operation->status);
        Queue::assertPushed(WatchGitOperationJob::class, fn (WatchGitOperationJob $job): bool => $job->applicationId === $application->id
            && $job->operationId === $operation->id
            && $job->taskId === 4242
            && $job->startedAt > 0);
    }

    public function test_the_watcher_redispatches_on_an_engine_hiccup(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the Engine is unreachable)
        Http::fake(['engine.example.com/api/tasks/4242*' => fn () => throw new ConnectionException('Engine down')]);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, $operation->status);
        Queue::assertPushed(WatchGitOperationJob::class, fn (WatchGitOperationJob $job): bool => $job->operationId === $operation->id
            && $job->hiccupAttempt === 1);
    }

    public function test_the_watcher_fails_the_row_when_the_wall_clock_cap_is_reached(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (never terminal)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'running']])]);

        // At the cap the row ends failed instead of polling forever.
        $this->assertSame(3600, WatchGitOperationJob::WALL_CLOCK_SECONDS);
        (new WatchGitOperationJob(
            $application->id,
            $operation->id,
            4242,
            now()->getTimestamp() - WatchGitOperationJob::WALL_CLOCK_SECONDS,
        ))->handle(app(EngineResolver::class));

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        Queue::assertNotPushed(WatchGitOperationJob::class);
    }

    public function test_connect_logs_a_clone_only_on_the_first_connect(): void
    {
        $user = User::factory()->create();
        // A project without a git checkout: connecting performs the initial clone.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :86, deploy-hook GET DeployHookController.php:158)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []], 404),
            // The repair has no branch in the body: the panel inspects the remote (Engine: core/app/Http/Controllers/User/SourceInspectionController.php:116)
            'engine.example.com/api/source/inspect' => Http::response(['data' => ['source' => ['git' => ['branch' => 'main']]]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (connect)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/site.git', 'branch' => 'main'])
            ->assertOk();

        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_CLONE,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);

        // A repair re-adopts the checkout and must not log a second clone.
        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:22 (`Api.post('/instances/{id}/git/repair')`)
            ->postJson("/api/projects/{$application->id}/git/repair")
            ->assertOk();

        $this->assertSame(1, GitOperation::query()->where('application_id', $application->id)->where('action', GitOperation::ACTION_CLONE)->count());
    }

    public function test_git_logs_sorts_ascending_when_asked(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_SUCCESS,
            'created_at' => now()->subHour(),
        ]);
        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PUSH,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1042 (`sort_dir=desc`); the API accepts asc
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1044 (`response.data.data`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/logs?sort_by=date&sort_dir=asc")
            ->assertOk();

        $this->assertSame(GitOperation::ACTION_PULL, $response->json('data.0.action'));
        $this->assertSame(GitOperation::ACTION_PUSH, $response->json('data.1.action'));
    }

    public function test_git_logs_defaults_to_ten_rows_per_page(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        for ($i = 0; $i < 12; $i++) {
            GitOperation::query()->create([
                'application_id' => $application->id,
                'action' => GitOperation::ACTION_PULL,
                'status' => GitOperation::STATUS_SUCCESS,
            ]);
        }

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1039 (`?page=&per_page=&sort_by=date&sort_dir=desc`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1045 (`meta.last_page`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/logs")
            ->assertOk()
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.total', 12)
            ->assertJsonPath('meta.last_page', 2);

        $this->assertCount(10, $response->json('data'));
    }

    public function test_git_logs_lists_the_recorded_operations(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_SUCCESS,
            'commit_hash' => str_repeat('a', 40),
            'commit_message' => 'Fix the thing',
            'commit_at' => now()->subMinute(),
            'created_at' => now()->subMinute(),
        ]);
        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PUSH,
            'status' => GitOperation::STATUS_FAILED,
            'error_message' => 'build broke',
            'created_at' => now(),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1042 (`Api.get('/instances/${id}/git/logs?page=&per_page=&sort_by=date&sort_dir=desc')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1044-1047 (`response.data.data`, `meta.total`, `meta.last_page`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/logs?page=1&per_page=5&sort_by=date&sort_dir=desc")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.per_page', 5);

        // CA reads: packages/client-area/src/components/dataIterator/tables/GitLogsTable.vue:70,79-81,106,60,347 (`item.action`, `item.commit_hash`/`item.commit_message`, `item.status`, `item.created_at`, `item.error_message`)
        $this->assertSame(GitOperation::ACTION_PUSH, $response->json('data.0.action'));
        $this->assertSame(GitOperation::STATUS_FAILED, $response->json('data.0.status'));
        $this->assertSame('build broke', $response->json('data.0.error_message'));
        $this->assertNotNull($response->json('data.0.created_at'));
        $this->assertSame('Fix the thing', $response->json('data.1.commit_message'));
        $this->assertSame(str_repeat('a', 40), $response->json('data.1.commit_hash'));
    }

    public function test_a_failed_git_operation_is_recorded_with_its_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => fn () => throw new ConnectionException('Engine down'),
        ]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/pull", [])
            ->assertStatus(503);

        $operation = GitOperation::query()
            ->where('application_id', $application->id)
            ->where('action', GitOperation::ACTION_PULL)
            ->firstOrFail();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertNotNull($operation->error_message);
    }

    public function test_branches_and_commits(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::branches/commits (:247-248)
        Http::fake([
            'engine.example.com/api/projects/site1/git/branches' => Http::response(['data' => [
                ['name' => 'main', 'current' => true, 'tracking' => 'origin/main'],
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => 'abc', 'short_hash' => 'abc', 'subject' => 'Initial', 'author' => 'A', 'date' => '2026-01-01'],
            ]]),
        ]);

        // Branches are a sorted `string[]`.
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:205 (`Api.get('/instances/{id}/git/branches')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:206 (`response.data.data` string[])
            ->getJson("/api/projects/{$application->id}/git/branches")
            ->assertOk()
            ->assertJsonPath('data.0', 'main');

        // Commits are `{commits, from, to, total}`: `to` is the branch tip,
        // `from` the commit the panel last deployed.
        $application->forceFill(['git_last_commit_hash' => 'aaa'])->save();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.commits`, `data.from`, `data.to`, `data.total`)
            ->getJson("/api/projects/{$application->id}/git/commits?limit=10")
            ->assertOk()
            ->assertJsonPath('data.commits.0.subject', 'Initial')
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.from', 'aaa')
            ->assertJsonPath('data.to', 'abc')
            ->assertJsonPath('data.branch_fetched', true);
    }

    public function test_commits_are_only_those_newer_than_the_deployed_one(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $log = static fn (string ...$hashes): array => ['data' => array_map(
            static fn (string $h): array => ['hash' => $h, 'short_hash' => $h, 'subject' => "Commit {$h}", 'author' => 'A', 'date' => '2026-01-01'],
            $hashes,
        )];

        // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (newest first)
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::sequence()
            ->push($log('c3', 'c2', 'c1'))
            ->push($log('c3', 'c2', 'c1'))
            ->push($log('c3', 'c2', 'c1'))]);
        $url = "/api/projects/{$application->id}/git/commits?limit=10";

        // The deployed commit is in the middle: only the two newer ones.
        $application->forceFill(['git_last_commit_hash' => 'c1'])->save();
        $this->actingAs($user)
        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.commits`, `data.from`, `data.to`, `data.total`)
            ->getJson($url)->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.commits.0.hash', 'c3')
            ->assertJsonPath('data.commits.1.hash', 'c2')
            ->assertJsonPath('data.from', 'c1')
            ->assertJsonPath('data.to', 'c3');

        // The deployed commit is the tip: nothing new, `to` stays the tip.
        $application->forceFill(['git_last_commit_hash' => 'c3'])->save();
        $this->actingAs($user)
        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.commits`, `data.from`, `data.to`, `data.total`)
            ->getJson($url)->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('data.commits', [])
            ->assertJsonPath('data.to', 'c3');

        // Nothing deployed from git yet: the whole log.
        $application->forceFill(['git_last_commit_hash' => null])->save();
        $this->actingAs($user)
        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.commits`, `data.from`, `data.to`, `data.total`)
            ->getJson($url)->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.from', null);
    }

    public function test_the_redeploy_dialog_counts_no_new_commits_after_a_pull(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_last_commit_hash' => 'c1'])->save();
        $log = static fn (string ...$hashes): array => ['data' => array_map(
            static fn (string $h): array => ['hash' => $h, 'short_hash' => $h, 'subject' => "Commit {$h}", 'author' => 'A', 'date' => '2026-01-01'],
            $hashes,
        )];

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (a clean tree)
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:247-248 -> commits (newest first; the pull lands on c3)
            'engine.example.com/api/projects/site1/git/commits*' => Http::response($log('c3', 'c2', 'c1')),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
            ->postJson("/api/projects/{$application->id}/git/pull", ['strategy' => 'ff'])
            ->assertOk();

        // CA: packages/client-area/src/components/modal/GitRedeployModal.vue:551 (`Api.get('/instances/{id}/git/commits')`)
        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:557-561 (`data.total`, `data.from`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/commits?limit=10")
            ->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('data.from', 'c3');
    }

    public function test_branches_accept_string_rows(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine answers `data` as `{name: …}` rows today, and bare
        // branch names reached the panel before; both must reach the CA as the
        // sorted string[] it reads.
        Http::fake([
            // Defensive (not an Engine shape): the Engine never returns bare
            // branch names; the old v1 parser did.
            'engine.example.com/api/projects/site1/git/branches' => Http::response(['data' => ['main', 'develop']]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:205 (`Api.get('/instances/{id}/git/branches')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:206 (`response.data.data` string[])
            ->getJson("/api/projects/{$application->id}/git/branches")
            ->assertOk()
            ->assertJsonPath('data.0', 'develop')
            ->assertJsonPath('data.1', 'main');
    }

    public function test_change_branch_records_a_deploy_log_and_watches_it(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineDeploys('site1', [$this->engineDeploy()]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/User/GitController.php:256 -> GitController::changeBranch;
        // 202 TaskResource (core/app/Http/Resources/TaskResource.php:41) -> data.id is the task id.
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => [
                'id' => 48, 'status' => 'queued', 'details' => ['action' => 'change_branch'],
            ]], 202),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:264 (`success`)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop'])
            ->assertOk()
            ->assertJson(['success' => true]);

        // The Engine started a rebuild; the panel follows it with the redeploy
        // notifications, and the Engine's history lists it in GET deploy-logs
        // and the live log.
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job) => $job->applicationId === $application->id
            && $job->taskId === 48
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.redeploy_finished');

        // The switch is also a git operation of the Deployment log the page lists
        // (GitLogsTable.vue: the `branch_change` row), settled by the watcher.
        $operation = GitOperation::query()
            ->where('application_id', $application->id)
            ->where('action', GitOperation::ACTION_BRANCH_CHANGE)
            ->firstOrFail();
        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, $operation->status);
        $this->assertSame(48, $operation->engine_task_id);
        // The row names the pair it switched between: the checkout holds only the new branch.
        $this->assertSame('main', $operation->branch_from);
        $this->assertSame('develop', $operation->branch_to);
        Queue::assertPushed(WatchGitOperationJob::class, fn (WatchGitOperationJob $job) => $job->operationId === $operation->id);
    }

    /**
     * A `site_git` checkout changes the branch
     * synchronously and answers 200 (no rebuild), so the panel must not invent
     * a deploy log or a watcher for it.
     */
    public function test_change_branch_on_a_never_deployed_checkout_rebuilds_first(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Sleep::fake();
        $this->fakeEngineDeploys('site1');

        // Engine: core/app/Http/Controllers/UserController.php:738 -> UserController::rebuild (202 + TaskResource :813); the welcome files are excluded only after it
        Http::fake([
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 47, 'status' => 'queued']], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show
            'engine.example.com/api/tasks/47*' => Http::response(['data' => ['id' => 47, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1245-1250 -> show
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1')]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (the dirty check runs after the rebuild)
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'develop', 'repository_exists' => true, 'dirty' => false]]),
            // Engine: core/app/Http/Controllers/User/GitController.php:252-257 -> GitController::changeBranch (202 + TaskResource, queuedOrDone :492)
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['id' => 48, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop'])
            ->assertOk();

        $urls = Http::recorded()->map(fn ($pair) => $pair[0]->url())->values()->all();
        $order = array_values(array_filter($urls, fn (string $u): bool => str_ends_with($u, '/site1/rebuild')
            || str_contains($u, '/tasks/47')
            || str_ends_with($u, '/git/change-branch')));
        $this->assertTrue(str_ends_with($order[0], '/site1/rebuild'));
        $this->assertTrue(str_ends_with((string) end($order), '/git/change-branch'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job) => $job->taskId === 48);
    }

    public function test_change_branch_without_a_rebuild_records_the_switch_in_the_git_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineDeploys('site1', [$this->engineDeploy()]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/User/GitController.php:256 -> GitController::changeBranch
        // answers 200 for a plain `site_git` checkout (`queuedOrDone`), not 202.
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['status' => 'done']], 200),
            // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits (the HEAD the CA commit column shows)
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [[
                'hash' => str_repeat('d', 40),
                'short_hash' => 'ddddddd',
                'subject' => 'Branch develop',
                'author' => 'Dev',
                'date' => '2026-10-11T10:00:00+00:00',
            ]]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:264 (`success`)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop'])
            ->assertOk()
            ->assertJson(['success' => true]);

        Queue::assertNotPushed(WatchDeployJob::class);
        Queue::assertNotPushed(WatchGitOperationJob::class);

        $operation = GitOperation::query()
            ->where('application_id', $application->id)
            ->where('action', GitOperation::ACTION_BRANCH_CHANGE)
            ->firstOrFail();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $operation->status);
        $this->assertSame(str_repeat('d', 40), $operation->commit_hash);
        $this->assertSame('Branch develop', $operation->commit_message);
        $this->assertSame('main', $operation->branch_from);
        $this->assertSame('develop', $operation->branch_to);
    }

    public function test_git_logs_returns_the_branches_of_a_switch(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_BRANCH_CHANGE,
            'status' => GitOperation::STATUS_SUCCESS,
            'branch_from' => 'main',
            'branch_to' => 'develop',
        ]);
        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1042 (`Api.get('/instances/${id}/git/logs?page=&per_page=&sort_by=date&sort_dir=desc')`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/logs")
            ->assertOk();

        $this->assertSame(GitOperation::ACTION_PULL, $response->json('data.0.action'));
        $this->assertNull($response->json('data.0.branch_to'));
        $this->assertSame(GitOperation::ACTION_BRANCH_CHANGE, $response->json('data.1.action'));
        $this->assertSame('main', $response->json('data.1.branch_from'));
        $this->assertSame('develop', $response->json('data.1.branch_to'));
    }

    public function test_auto_deploy_registers_and_removes_the_provider_webhook(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_token', 'git_provider' => 'github'])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create (+github POST, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/abc',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'path' => 'project',
                'tls' => ['state' => 'valid', 'warning' => null],
            ]], 201),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['id' => 555]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.auto_deploy_enabled', true)
            ->assertJsonPath('data.webhook_registered', true);

        $this->assertSame('555', $application->fresh()->git_webhook_id);
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks'
            && $r['config']['url'] === 'https://engine.test/hooks/abc'
            && $r['config']['secret'] === '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90');

        // Disable removes the provider webhook and the Engine hook.
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.auto_deploy_enabled', false);

        $this->assertNull($application->fresh()->git_webhook_id);
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');
    }

    public function test_disabling_auto_deploy_deletes_the_engine_hook_first(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 -> DeployHookController::destroy (+github DELETE, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(null, 204),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertOk();

        // Engine hook first: the provider webhook must never be removed while
        // the Engine still serves its hook.
        $recorded = Http::recorded();
        $engineDelete = $recorded->search(fn ($pair) => $pair[0]->method() === 'DELETE'
            && str_contains($pair[0]->url(), '/api/projects/site1/git/deploy-hook'));
        $providerDelete = $recorded->search(fn ($pair) => $pair[0]->method() === 'DELETE'
            && str_contains($pair[0]->url(), 'api.github.com'));
        $this->assertNotFalse($engineDelete, 'The Engine hook delete was not sent.');
        $this->assertNotFalse($providerDelete, 'The provider webhook delete was not sent.');
        $this->assertLessThan($providerDelete, $engineDelete, 'The provider webhook was deleted before the Engine hook.');
        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_disabling_auto_deploy_keeps_the_provider_webhook_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // External: https://docs.github.com/en/rest/repos/webhooks (delete a repository webhook)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => fn () => throw new ConnectionException('down'),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertStatus(503);

        // The Engine still serves the hook, so nothing is cleared: the provider
        // keeps calling it and the user can retry the disable.
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com'));
        $this->assertSame('555', $application->fresh()->git_webhook_id);
    }

    public function test_disabling_auto_deploy_clears_the_marker_when_only_the_provider_delete_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 -> DeployHookController::destroy (+github DELETE, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(null, 204),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['message' => 'boom'], 500),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
        ]);

        // The Engine hook is gone, so the disable succeeded as far as the CA is
        // concerned; the provider refusal is reported and the local marker is
        // still cleared, as the old toggleAutoDeploy ignored it.
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertOk();

        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_disabling_auto_deploy_rethrows_an_engine_500_on_the_hook_delete(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 (respond -> GitException body)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'boom'], 500),
            // External: GitHub webhooks API (not called; the Engine hook delete precedes it)
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertStatus(502)
            ->assertJsonPath('message', 'boom');

        // Only 2xx/404 mean the Engine hook is gone; a 500 must leave both
        // sides alone.
        $this->assertSame('555', $application->fresh()->git_webhook_id);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com'));
    }

    public function test_disabling_auto_deploy_treats_a_422_hook_as_gone(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Defensive (not an Engine shape): a DELETE without `path` cannot answer
        // 422 – the Engine's show/delete skip the connection check
        // (`DeployHooks.php:83-98`); that 422 comes only from create. The catch
        // in GitService::deleteEngineHook is kept anyway, so the shape is still
        // exercised.
        // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 -> DeployHookController::destroy
        Http::fake([
            // Defensive (not an Engine shape): the Engine's DELETE never answers
            // 422 for a request without `path`.
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'The checkout is not connected to git.'], 422),
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => false]]),
            // External: https://docs.github.com/en/rest/repos/webhooks (delete a repository webhook)
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertOk();

        // The defensive 422 is treated as gone: the Engine never answers it for
        // a DELETE without `path`, so the provider webhook
        // is still ours to remove and the local marker is cleared, exactly as
        // for a 404.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');
        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_a_422_from_the_git_status_is_not_treated_as_absence(): void
    {
        // Engine 422 always arrives as EngineValidationException
        // (EngineClient::assertSuccessful), so it must bubble instead of the
        // panel reading the status as "not connected" (this replaces
        // the former grep test).
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (a 422 carries the Engine's validation-error body)
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['message' => 'The repository is not readable.'], 422),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:752,797,806,831,913,916 (`connected`, `local_repository_exists`, `async_status.git_auto_deploy`, `drift_status`, `connection_health`)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertStatus(422);
    }

    public function test_a_deploy_hook_get_422_bubbles_instead_of_reading_no_hook(): void
    {
        // The deploy-hook GET is read only when git is connected; a 422 arrives
        // as EngineValidationException and must bubble instead of degrading to
        // "no hook".
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'The path is not valid.'], 422),
        ]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git")
            ->assertStatus(422);
    }

    public function test_disabling_auto_deploy_treats_a_gone_engine_hook_as_deleted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:223 -> DeployHookController::destroy (+github DELETE, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'no hook'], 404),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => false])
            ->assertOk();

        // The Engine already dropped its hook (404), so the provider webhook is
        // still ours to remove and the local marker is cleared.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');
        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_auto_deploy_removes_a_stale_provider_hook_before_re_registering(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create, :158 -> DeployHookController::show
        Http::fake([
            // The Engine hook is gone; a create answers a fresh hook.
            'engine.example.com/api/projects/site1/git/deploy-hook' => function ($request) {
                if ($request->method() === 'GET') {
                    // Engine: core/app/Http/Controllers/User/GitController.php:86
                    return Http::response(['message' => 'no hook'], 404);
                }

                // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create
                return Http::response(['data' => [
                    'url' => 'https://engine.test/hooks/new',
                    'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                    'tls' => ['state' => 'valid'],
                ]], 201);
            },
            // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook)
            'api.github.com/*' => Http::response(['id' => 777]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertOk();

        // The provider's old hook is removed before the new one is created.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/555');
        $this->assertSame('777', $application->fresh()->git_webhook_id);
    }

    public function test_auto_deploy_registers_a_self_signed_hook_with_verification_off(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_token', 'git_provider' => 'github'])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create (+github POST, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://'.TestNetwork::public2(10).'/hooks/abc',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'self_signed', 'warning' => 'The Engine certificate is self-signed'],
            ]], 201),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['id' => 321]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertOk();

        // A self-signed Engine hook makes the git host skip verification
        // (also pinned at the route level).
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks'
            && $r['config']['insecure_ssl'] === '1');
    }

    public function test_auto_deploy_registers_a_gitlab_hook_with_the_engine_token(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A self-hosted GitLab repository: gitTarget() reads details.git_repo.
        $payload = $application->engine_payload;
        $payload['details']['git_repo'] = 'https://gitlab.example.com/acme/site';
        $application->forceFill([
            'git_token' => 'glpat-token',
            'git_provider' => 'gitlab',
            'engine_payload' => $payload,
        ])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create (+gitlab POST, status :246)
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create,
            // 201 {data:{url,secret,path,tls}}; the secret is 48 hex chars
            // (core/app/Models/DeployHook.php:50-53 bin2hex(random_bytes(24))).
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:158
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/abc',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'path' => 'project',
                'tls' => ['state' => 'valid', 'warning' => null],
            ]], 201),
            // External: https://docs.gitlab.com/ee/api/projects.html#add-project-webhook
            'gitlab.example.com/*' => Http::response(['id' => 77]),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
        ]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495
        // PUT /instances/{id}/auto-deploy {auto_deploy_enabled: true}.
        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.auto_deploy_enabled', true)
            ->assertJsonPath('data.webhook_registered', true);

        $this->assertSame('77', $application->fresh()->git_webhook_id);

        // GitLab sends the hook's `token` back as X-Gitlab-Token, so the Engine
        // secret must land in `token` - never in `signing_token`, which the
        // Engine ignores (core/app/Lib/DeployHook/GitlabProvider.php:36-47).
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_contains($r->url(), 'gitlab.example.com/api/v4/projects/acme%2Fsite/hooks')
            && $r['token'] === '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90'
            && ! isset($r['signing_token']));
    }

    public function test_auto_deploy_rolls_back_when_the_provider_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_token', 'git_provider' => 'github'])->save();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:87 -> DeployHookController::create (+github POST, status :246)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/abc',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'valid'],
            ]], 201),
            // External: https://docs.github.com/en/rest/repos/webhooks
            'api.github.com/*' => Http::response(['message' => 'nope'], 500),
            // Engine: core/app/Http/Controllers/User/GitController.php:86
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertStatus(422)
            // Old api/messages.git_webhook_registration_failed text, key 0.
            ->assertJsonPath('errors.0.0', 'Could not register a webhook with the Git provider. Check that your token can manage webhooks for this repository.');

        $this->assertNull($application->fresh()->git_webhook_id);
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_contains($r->url(), '/api/projects/site1/git/deploy-hook'));
    }

    public function test_an_unreadable_stored_token_is_treated_as_absent(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // A changed APP_KEY leaves the encrypted column unreadable; the panel
        // must treat it as "no token", not blow up with a 500.
        DB::table('applications')->where('id', $application->id)->update(['git_token' => 'not-a-valid-ciphertext']);

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:158 -> DeployHookController::show (+status :246)
        Http::fake([
            // The Engine hook is gone, so the enable path reads the stored token.
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'no hook'], 404),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.auto_deploy_enabled.0', 'The repository credentials are missing; update the git credentials first.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com'));
    }

    public function test_the_provider_token_is_read_from_the_current_attribute(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The encrypted cast encrypts on set, so the current attributes hold
        // the ciphertext of an in-memory change; gitToken() must read that
        // rather than only the original row.
        $application->setAttribute('git_token', 'ghp_in_memory');

        $this->assertSame('ghp_in_memory', $application->gitToken());
    }

    public function test_auto_deploy_requires_credentials(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`Api.put('/instances/{id}/auto-deploy', {auto_deploy_enabled})`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:498 (`response.data.data`)
            ->putJson("/api/projects/{$application->id}/auto-deploy", ['auto_deploy_enabled' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['auto_deploy_enabled']);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'deploy-hook'));
    }

    public function test_connect_rejects_a_private_host_and_sends_the_canonical_url(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A private host is refused before the Engine is asked.
        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@'.TestNetwork::private(5).':acme/site.git'])
            ->assertStatus(422);
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/connect'));

        // A valid repo is sent as a URL rebuilt from parsed parts.
        // Engine: core/app/Http/Controllers/User/GitController.php:181 -> GitController::connect (+status :246, deploy-hook GET DeployHookController.php:158 -> DeployHookController::show (DeployHookActions.php:54-68))
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git'])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/connect') && $r['repo_url'] === 'ssh://git@github.com/acme/site.git');
    }

    public function test_deploy_key_is_shown_or_generated_without_a_host_for_a_known_forge(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (201 new / 200 existing; DeployKey.php:96)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['data' => [
                'created' => true,
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'hosts' => [['host' => 'github.com', 'pinned' => 'published']],
            ]], 201),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key", ['repo_url' => 'git@github.com:acme/site.git'])
            ->assertOk()
            ->assertJsonPath('data.public_key', 'ssh-ed25519 AAAA panelalpha-site1')
            ->assertJsonPath('data.fingerprint', 'SHA256:abc')
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.hosts.0.host', 'github.com')
            ->assertJsonPath('data.hosts.0.pinned', 'published');

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/deploy-key') && ! array_key_exists('host', $r->data()));

        // No repo_url at all (the wizard shows the key before the URL is final).
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk();
    }

    public function test_deploy_key_sends_the_host_only_for_a_self_hosted_forge(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (`host` scanned once with ssh-keyscan; DeployKey.php:246-264)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['data' => [
                'created' => false,
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'hosts' => [['host' => 'git.example.org:2222', 'pinned' => 'scanned']],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key", ['repo_url' => 'ssh://git@git.example.org:2222/acme/site.git'])
            ->assertOk()
            ->assertJsonPath('data.created', false)
            ->assertJsonPath('data.hosts.0.pinned', 'scanned');

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/deploy-key') && ($r->data()['host'] ?? null) === 'git.example.org:2222');
    }

    public function test_deploy_key_rejects_a_non_ssh_url_and_a_blocked_host(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key", ['repo_url' => 'https://github.com/acme/site.git'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['repo_url']);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key", ['repo_url' => 'git@'.TestNetwork::private(5).':acme/site.git'])
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/deploy-key'));
    }

    public function test_deploy_key_renders_an_unreachable_host_on_repo_url(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Lib/Git/DeployKey.php:256 (422 problems[] host_unreachable)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response([
                'message' => 'Could not reach the host.',
                'errors' => ['host' => ['Could not reach the host.']],
                'problems' => [['field' => 'host', 'code' => 'host_unreachable', 'message' => 'Could not reach the host.']],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy-key", ['repo_url' => 'ssh://git@git.example.org/acme/site.git'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['repo_url']);
    }

    private function connectViaSsh(Application $application): void
    {
        $payload = $application->engine_payload ?? [];
        $payload['details'] = array_merge($payload['details'] ?? [], ['git_repo' => 'git@github.com:o/r.git']);
        $application->forceFill(['engine_payload' => $payload, 'git_source' => 'git@github.com:o/r.git'])->save();
    }

    public function test_the_current_deploy_key_is_read_without_creating_one(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (GET /projects/{u}/git/deploy-key is engine-handoff ask 6: 200 {public_key, fingerprint, hosts})
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['data' => [
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'hosts' => [['host' => 'github.com', 'pinned' => 'published']],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (the rotation flow already calls deploy-key; the connected card reads the key through this GET, added in phase 2)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data.public_key`, `data.fingerprint`; the connected card, phase 2)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data.public_key', 'ssh-ed25519 AAAA panelalpha-site1')
            ->assertJsonPath('data.fingerprint', 'SHA256:abc')
            ->assertJsonPath('data.created', false);

        Http::assertSentCount(1);

        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_is_null_when_the_engine_has_none(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);

        // Engine: core/app/Http/Controllers/User/GitController.php:466 -> GitController::deleteDeployKey (404 when there is no key; the same answer is asked of the GET, engine-handoff ask 6)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'No deploy key.'], 404),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (the rotation flow already calls deploy-key; the connected card reads the key through this GET, added in phase 2)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data` null shows the empty state; the connected card, phase 2)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data', null);

        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_of_an_ssh_project_comes_from_the_create_on_an_old_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (POST only today; Laravel answers 405 to the GET until engine-handoff ask 6 lands)
        Http::fake(function ($request) {
            if ($request->method() === 'GET') {
                // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey
                return Http::response(['message' => 'Method not allowed.'], 405);
            }

            // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey
            return Http::response(['data' => [
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'created' => false,
                'hosts' => [['host' => 'github.com', 'pinned' => 'published']],
            ]]);
        });

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1517 (`Api.get('/instances/{id}/git/deploy-key')`, loadConnectedKey)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data.public_key`, `data.fingerprint`; the connected card)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data.public_key', 'ssh-ed25519 AAAA panelalpha-site1')
            ->assertJsonPath('data.fingerprint', 'SHA256:abc')
            ->assertJsonPath('data.created', false);

        // An Engine without the read exposes an SSH project's key through the idempotent create only.
        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/git/deploy-key')
            && ! array_key_exists('host', $r->data()));
    }

    public function test_the_current_deploy_key_of_an_ssh_project_comes_from_the_create_on_a_body_less_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);

        // Engine 2.1.2 has no GET route and answers a body-less 404, not a 405.
        Http::fake(function ($request) {
            if ($request->method() === 'GET') {
                // Defensive (not an Engine shape): a proxy in front of the Engine answers 404 without a body.
                return Http::response(null, 404);
            }

            // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey
            return Http::response(['data' => [
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'created' => false,
            ]]);
        });

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1517 (`Api.get('/instances/{id}/git/deploy-key')`, loadConnectedKey)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data.public_key`; the connected card)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data.public_key', 'ssh-ed25519 AAAA panelalpha-site1');

        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_of_an_ssh_project_comes_from_the_create_on_laravels_not_found(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);

        Http::fake(function ($request) {
            if ($request->method() === 'GET') {
                // Defensive (not an Engine shape): the Engine's fallback route answers the string `Not Found` for a URI it has no route for.
                return Http::response('Not Found', 404);
            }

            // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey
            return Http::response(['data' => [
                'public_key' => 'ssh-ed25519 AAAA panelalpha-site1',
                'fingerprint' => 'SHA256:abc',
                'created' => false,
            ]]);
        });

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1517 (`Api.get('/instances/{id}/git/deploy-key')`, loadConnectedKey)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data.public_key`; the connected card)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data.public_key', 'ssh-ed25519 AAAA panelalpha-site1');

        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_is_null_when_the_engine_answers_404_with_a_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->connectViaSsh($application);

        // Engine: core/app/Http/Controllers/User/GitController.php:468-472 -> GitController::deleteDeployKey (404 {message} when there is no key; the same answer is asked of the GET, engine-handoff ask 6)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'No deploy key.'], 404),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1517 (`Api.get('/instances/{id}/git/deploy-key')`, loadConnectedKey)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1518 (`response.data.data || null`: null shows the missing-key state)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data', null);

        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_is_null_on_an_old_engine_for_an_https_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (POST only today; Laravel answers 405 to the GET until engine-handoff ask 6 lands)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'Method not allowed.'], 405),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (the rotation flow already calls deploy-key; the connected card reads the key through this GET, added in phase 2)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data` null; the connected card, phase 2)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data', null);

        // Only an SSH repository is reached with a deploy key: no create to look at it.
        Http::assertSentCount(1);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_the_current_deploy_key_is_null_on_an_old_engine_for_a_project_without_a_repository(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill([
            'engine_payload' => array_merge($application->engine_payload ?? [], ['details' => []]),
            'git_source' => null,
        ])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (POST only today; Laravel answers 405 to the GET until engine-handoff ask 6 lands)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'Method not allowed.'], 405),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (the rotation flow already calls deploy-key; the connected card reads the key through this GET, added in phase 2)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`data` null; the connected card, phase 2)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertOk()
            ->assertJsonPath('data', null);

        // A project that is not SSH-connected never gets a key created just to look.
        Http::assertSentCount(1);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_deleting_the_deploy_key_answers_204_and_a_missing_key_is_not_an_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:466 -> GitController::deleteDeployKey (204 / 404 when there is no key)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::sequence()
                ->push(null, 204)
                ->push(['message' => 'No deploy key.'], 404),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertNoContent();

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1142-1148 (the connect form's payload; the deploy-key panel is added in phase 4)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the CA reads `response.data.data` and refetches the status)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/git/deploy-key")
            ->assertNoContent();
    }

    public function test_an_ssh_connect_without_a_branch_is_rejected_on_branch(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The mirror knows no branch either.
        $application->forceFill(['engine_payload' => array_merge($application->engine_payload ?? [], ['details' => []])])->save();

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['branch']);

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/connect'));
    }

    public function test_an_ssh_connect_sends_the_branch_and_no_token(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:182 -> GitController::connect
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'git@github.com:acme/site.git',
                'branch' => 'main',
                'token' => 'ghp_ignored',
                'auth_type' => 'pat',
            ])
            ->assertOk()
            ->assertJsonMissingPath('data.branch_missing');

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/connect')
            && $r['repo_url'] === 'ssh://git@github.com/acme/site.git'
            && $r['branch'] === 'main'
            && ! isset($r['token'])
            && ! isset($r['auth_type']));
        $this->assertSame('ssh://git@github.com/acme/site.git', $application->fresh()->git_source);
        $this->assertNull($application->fresh()->git_token);
    }

    public function test_an_ssh_connect_waits_for_the_create_task_on_a_busy_409(): void
    {
        Sleep::fake();
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['status' => 'pending'])->save();

        // Engine: core/app/Http/Controllers/User/GitController.php:506-514 (409 {message, task_id} while the create task runs)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::sequence()
                ->push(['message' => 'The project is being created.', 'task_id' => 77], 409)
                ->push(['data' => ['connected' => true]]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['status' => 'active'])]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main'])
            ->assertOk();

        Http::assertSentCount(6);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/tasks/77'));
        $fresh = $application->fresh();
        $this->assertSame('ssh://git@github.com/acme/site.git', $fresh->git_source);
        // The wait is not the files step: it does not stamp onboarding.
        $this->assertNull($fresh->onboarding_files_at);
    }

    public function test_a_busy_409_on_a_non_pending_project_passes_through(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:506-514 (409 {message, task_id} while the create task runs)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['message' => 'The project is busy.', 'task_id' => 77], 409),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main'])
            ->assertStatus(409);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/tasks/'));
    }

    public function test_an_ssh_connect_with_a_sync_error_reports_a_missing_branch(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:784-794 (200 + sync_error after a good probe and a failed fetch)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => [
                'connected' => true,
                'sync_error' => 'fatal: couldn\'t find remote ref nope',
            ]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'nope']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'nope'])
            ->assertOk()
            ->assertJsonPath('data.branch_missing', true);

        $this->assertSame('ssh://git@github.com/acme/site.git', $application->fresh()->git_source);
    }

    public function test_an_https_connect_that_could_not_be_fetched_is_refused_and_disconnected(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:1013-1040 (`withSyncError()`; a fresh init whose fetch failed) + GitController.php:231 -> GitController::disconnect
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => [
                'connected' => true,
                'repository_exists' => true,
                'sync_error' => 'Connected, but fetching main failed, so the work tree has none of the repository\'s files yet. Pull to fetch them. git said: could not read Username for \'https://github.com\'',
            ]]),
            'engine.example.com/api/projects/site1/git/disconnect' => Http::response(['data' => ['connected' => false]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/other', 'branch' => 'main'])
            ->assertStatus(422)
            ->assertJsonPath('errors.repo_url.0', GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE)
            ->assertJsonPath('message', GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE);

        // Nothing stays connected: the Engine connection the failed fetch stored is disconnected again.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/projects/site1/git/disconnect'));
        $this->assertNull($application->fresh()->git_source);
    }

    public function test_a_connect_that_fetched_nothing_is_refused_even_when_the_undo_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Log::spy();

        // Engine: core/app/System/Project/Git/WorkTree.php:1013-1040 (`withSyncError()`) + GitController.php:231 -> GitController::disconnect
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => [
                'connected' => true,
                'sync_error' => 'fatal: couldn\'t find remote ref nope',
            ]]),
            'engine.example.com/api/projects/site1/git/disconnect' => Http::response(['message' => 'The Engine is unavailable.'], 503),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/other', 'branch' => 'main'])
            ->assertStatus(422)
            ->assertJsonPath('errors.repo_url.0', GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE);

        $this->assertNull($application->fresh()->git_source);

        // git's own reason stays in the log; the customer reads the panel's own sentence.
        Log::shouldHaveReceived('warning')->with('Git connect left the checkout empty.', Mockery::on(
            static fn (array $context): bool => $context['project'] === 'site1'
                && str_contains((string) $context['message'], "couldn't find remote ref"),
        ))->once();
        Log::shouldHaveReceived('warning')->with('Undoing a Git connect that fetched nothing failed.', Mockery::on(
            static fn (array $context): bool => $context['project'] === 'site1',
        ))->once();
    }

    public function test_a_refused_ssh_key_reads_one_user_safe_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:1799 (422 git_ssh_key_refused; text names an Engine route)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response([
                'message' => 'Permission denied (publickey). Add the key from POST /projects/site1/git/deploy-key.',
                'code' => 'git_ssh_key_refused',
                'errors' => ['repo_url' => ['Permission denied (publickey).']],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main'])
            ->assertStatus(422)
            ->assertJsonPath('errors.repo_url.0', EngineText::SSH_KEY_REFUSED);

        $this->assertNull($application->fresh()->git_source);
    }

    /**
     * A pull the repository refuses for the deploy key answers the key sentence:
     * the Engine's 422 carries the ssh stderr and an Engine route, and neither
     * reaches the toast.
     */
    public function test_a_pull_refused_by_the_ssh_key_reads_the_key_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:1894-1910 (422 git_ssh_key_refused; the ssh stderr and an Engine route in the text)
        $engineText = "git@github.com: Permission denied (publickey).\r\nfatal: Could not read from remote repository. The repository does not accept this project's deploy key: add its public half (POST /projects/site1/git/deploy-key).";
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'repository_exists' => true, 'dirty' => false]]),
            'engine.example.com/api/projects/site1/git/pull' => Http::response([
                'message' => $engineText,
                'errors' => ['git' => [$engineText]],
            ], 422),
        ]);

        $response = $this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
            ->postJson("/api/projects/{$application->id}/git/pull")
            ->assertStatus(422)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:302 (`getErrorMessage(error)` -> the error toast)
            ->assertJsonPath('message', EngineText::SSH_KEY_REFUSED);

        $this->assertStringNotContainsString('Permission denied', $response->getContent());
    }

    public function test_every_other_ssh_connect_failure_reads_the_connect_failed_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $cases = [
            // Engine: core/app/System/Project/Git/WorkTree.php:1789 (422 git_ssh_needs_deploy_key)
            [422, ['message' => 'Needs a key.', 'code' => 'git_ssh_needs_deploy_key']],
            // Engine: core/app/Lib/Git/GitActions.php:196-216 (422 problems[] repo_url_ssh_needs_deploy_key)
            [422, ['message' => 'No key.', 'problems' => [['field' => 'repo_url', 'code' => 'repo_url_ssh_needs_deploy_key', 'message' => 'No key.']]]],
            // Engine: core/app/Lib/Git/GitActions.php:196-216 (422 problems[] repo_url_ssh_host_not_pinned)
            [422, ['message' => 'Not pinned.', 'problems' => [['field' => 'repo_url', 'code' => 'repo_url_ssh_host_not_pinned', 'message' => 'Not pinned.']]]],
            // GitHub's "Repository not found": no Engine code at all.
            [422, ['message' => 'ERROR: Repository not found.']],
            // Engine: core/app/System/Project/Git/WorkTree.php:1774-1800 (400 for a changed host key)
            [400, ['message' => 'Host key verification failed.']],
        ];

        foreach ($cases as [$status, $body]) {
            // Engine: core/app/System/Project/Git/WorkTree.php:1774-1800 (the failure body of the case above)
            Http::fake([
                'engine.example.com/api/projects/site1/git/connect' => Http::response($body, $status),
            ]);

            // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
            $this->actingAs($user)
                ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main'])
                ->assertStatus(422)
                ->assertJsonPath('errors.repo_url.0', EngineText::SSH_CONNECT_FAILED);
        }
    }

    public function test_an_https_connect_error_is_unchanged(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:182 -> GitController::connect (422 with errors.token)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response([
                'message' => 'Authentication failed.',
                'errors' => ['token' => ['Authentication failed.']],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`response.data.data`; the CA refetches the status)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/other', 'token' => 'bad'])
            ->assertStatus(422)
            ->assertJsonPath('errors.token.0', 'Authentication failed.')
            ->assertJsonMissingValidationErrors(['repo_url']);
    }

    /**
     * @return array<string, array{array<string, mixed>, string, string}>
     */
    public static function unreadableConnectRefusals(): array
    {
        return [
            // Engine: core/app/System/Project/Git/WorkTree.php:928 (git_token_refused on a 422, from a refused credential)
            'the repository refuses the token' => [
                [
                    'message' => 'The repository could not be read: github.com refused the token, or it cannot see this repository. Nothing was connected.',
                    'errors' => ['git' => ['The repository could not be read: github.com refused the token, or it cannot see this repository. Nothing was connected.']],
                    'problems' => [['field' => 'git', 'code' => 'git_token_refused', 'message' => 'The repository could not be read.']],
                ],
                'token',
                GitService::TOKEN_REFUSED_MESSAGE,
            ],
            // Engine: core/app/System/Project/Git/WorkTree.php:924-926 (git_repository_not_found, no token to ask)
            'the repository is not there' => [
                [
                    'message' => 'The repository could not be read: github.com has no repository at this address, or it is private and needs a read token. Nothing was connected.',
                    'problems' => [['field' => 'git', 'code' => 'git_repository_not_found', 'message' => 'The repository could not be read.']],
                ],
                'repo_url',
                GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE,
            ],
        ];
    }

    /**
     * A repository the Engine cannot read is refused 422 with the CA's own
     * sentence, the same one the token check answers, not the Engine's sentence
     * about the host or git's stderr.
     *
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('unreadableConnectRefusals')]
    public function test_a_connect_the_engine_cannot_read_reads_the_token_check_sentence(array $body, string $field, string $message): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:182 -> GitController::connect (the answer of the case above)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response($body, 422)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'auth_type' => 'pat',
                'token' => 'ghp_refused',
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast)
            ->assertJsonPath("errors.{$field}.0", $message)
            ->assertJsonMissingPath('errors.git');

        $this->assertNull($application->fresh()->git_source);
    }

    /**
     * The branch read that comes before an HTTPS connect (`source/inspect`)
     * answers the same sentence, so the customer never reads the Engine's
     * instruction to the API caller.
     */
    public function test_the_branch_read_of_a_repository_the_engine_cannot_read_answers_the_panels_sentence(): void
    {
        $user = User::factory()->create();
        // A project with no recorded branch: the panel reads one before the connect.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        $cases = [
            // Engine: core/app/Lib/Deploy/Inspect/SourceResolver.php:744-747 (InspectException::toProblem -> source_unreadable)
            ['token' => 'ghp_refused', 'auth_type' => 'pat', 'field' => 'token', 'message' => GitService::TOKEN_REFUSED_MESSAGE],
            ['token' => null, 'auth_type' => null, 'field' => 'repo_url', 'message' => GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE],
        ];

        foreach ($cases as $case) {
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:116 -> SourceInspectionController::inspect (a source it cannot read)
            Http::fake([
                'engine.example.com/api/source/inspect' => Http::response([
                    'message' => 'Could not clone the repository: the repository is private or does not exist. Pass git_token to read a private HTTPS repository.',
                    'errors' => ['source' => ['Could not clone the repository: the repository is private or does not exist. Pass git_token to read a private HTTPS repository.']],
                    'problems' => [['field' => 'source', 'code' => 'source_unreadable', 'message' => 'Could not clone the repository: the repository is private or does not exist. Pass git_token to read a private HTTPS repository.']],
                ], 422),
            ]);

            $this->actingAs($user)
            // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
                ->postJson("/api/projects/{$application->id}/git/connect", [
                    'repo_url' => 'https://github.com/acme/other',
                    'auth_type' => $case['auth_type'],
                    'token' => $case['token'],
                ])
                ->assertStatus(422)
            // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast)
                ->assertJsonPath("errors.{$case['field']}.0", $case['message']);

            Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/git/connect'));
            $this->assertNull($application->fresh()->git_source);
        }
    }

    /**
     * A branch read the Engine never answers (an address whose port drops the
     * packets keeps the Engine's clone past the panel's budget) answers the
     * guide's unreachable sentence on `repo_url`: the connect is not sent, as
     * the Engine would refuse it for the branch the panel could not read.
     */
    public function test_a_branch_read_the_engine_never_answers_answers_the_unreachable_sentence(): void
    {
        $user = User::factory()->create();
        // A project with no recorded branch: the panel reads one before the connect.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        Log::spy();
        Http::fake([
            // Engine: core/app/Lib/Deploy/Inspect/SourceResolver.php:78 (the clone budget) - the panel waits its own 30s and gives up
            'engine.example.com/api/source/inspect' => fn () => throw new ConnectionException('cURL error 28: Operation timed out after 30001 milliseconds'),
            // Engine: core/app/Http/Requests/Git/GitConnectRequest.php:33 (`branch` is required unless `repair`)
            'engine.example.com/api/projects/site1/git/connect' => Http::response([
                'message' => 'The branch field is required unless repair is in true.',
                'errors' => ['branch' => ['The branch field is required unless repair is in true.']],
            ], 422),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://example.com:9999/x/x.git'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the corner alert; the field message under Repository URL)
            ->assertJsonPath('errors.repo_url.0', sprintf(GitService::REPOSITORY_UNREACHABLE_MESSAGE, 'example.com'))
            ->assertJsonMissingPath('errors.branch');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/git/connect'));
        $this->assertNull($application->fresh()->git_source);

        Log::shouldHaveReceived('warning')->with('Git source read failed.', Mockery::on(
            static fn (array $context): bool => str_contains((string) $context['message'], 'timed out'),
        ))->once();
    }

    /** A repository with no branch answers the panel's sentence under Repository URL and sends no connect. */
    public function test_a_repository_with_no_branch_answers_the_panels_sentence(): void
    {
        $user = User::factory()->create();
        // A project with no recorded branch: the panel reads one before the connect.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        Http::fake([
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:116 -> inspect (a repository with no commit clones, names no branch)
            'engine.example.com/api/source/inspect' => Http::response(['data' => ['source' => ['type' => 'git', 'git' => ['branch' => null]]]]),
            // Engine: core/app/Http/Requests/Git/GitConnectRequest.php:33 (`branch` is required unless `repair`) - what the branch-less connect used to answer
            'engine.example.com/api/projects/site1/git/connect' => Http::response([
                'message' => 'The branch field is required unless repair is in true.',
                'errors' => ['branch' => ['The branch field is required unless repair is in true.']],
            ], 422),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/empty.git'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (the error under the field the `errors` bag names)
            ->assertJsonPath('errors.repo_url.0', GitService::REPOSITORY_EMPTY_MESSAGE)
            ->assertJsonMissingPath('errors.branch');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/git/connect'));
        $this->assertNull($application->fresh()->git_source);
    }

    /**
     * An Engine that names only git's stderr for a connect it cannot read (a
     * 400, before `problems[].code`) answers the same CA sentences, and the
     * stderr stays in the server log.
     */
    public function test_an_old_engine_connect_stderr_is_read_as_the_cas_sentences(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Log::spy();

        $stderr = "remote: Invalid username or token. Password authentication is not supported for Git operations.\n"
            ."fatal: Authentication failed for 'https://github.com/acme/other/'\n";

        // Engine: core/app/System/Project/Git/WorkTree.php:1900-1922 (a GitException 400 whose message is the git stderr)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response(['message' => $stderr], 400)]);

        $response = $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'auth_type' => 'pat',
                'token' => 'ghp_refused',
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast)
            ->assertJsonPath('errors.token.0', GitService::TOKEN_REFUSED_MESSAGE)
            ->assertJsonMissingValidationErrors(['repo_url']);

        $this->assertStringNotContainsString('fatal:', (string) $response->json('message'));
        $this->assertNull($application->fresh()->git_source);

        Log::shouldHaveReceived('warning')->with('Git connect failed.', Mockery::on(
            static fn (array $context): bool => $context['engine_status'] === 400
                && str_contains((string) $context['message'], 'Authentication failed'),
        ))->once();
    }

    public function test_an_old_engine_connect_stderr_without_authentication_reads_the_not_found_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:1900-1922 (the 400 of a repository git cannot read)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response([
            'message' => "fatal: repository 'https://github.com/acme/other/' not found\n",
        ], 400)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", [
                'repo_url' => 'https://github.com/acme/other',
                'branch' => 'main',
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast)
            ->assertJsonPath('errors.repo_url.0', GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE);

        $this->assertNull($application->fresh()->git_source);
    }

    /**
     * The Engine's other connect codes name what to change (the host it could
     * not reach, git's reason), so they pass through as they are.
     */
    public function test_an_unreachable_connect_keeps_the_engines_own_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Git/WorkTree.php:919-922 (git_repository_unreachable)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response([
            'message' => 'Could not reach github.com, so the repository cannot be read and nothing was connected. Check the address, and that this server can reach it.',
            'errors' => ['git' => ['Could not reach github.com, so the repository cannot be read and nothing was connected. Check the address, and that this server can reach it.']],
            'problems' => [['field' => 'git', 'code' => 'git_repository_unreachable', 'message' => 'Could not reach github.com.']],
        ], 422)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1199 (`Api.post('/instances/{id}/git/connect', buildConnectPayload())`; body Git.vue:1142-1148)
            ->postJson("/api/projects/{$application->id}/git/connect", ['repo_url' => 'https://github.com/acme/other', 'branch' => 'main'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1201 (`getErrorMessage(error)` -> the error toast)
            ->assertJsonPath('errors.git.0', 'Could not reach github.com, so the repository cannot be read and nothing was connected. Check the address, and that this server can reach it.');

        $this->assertNull($application->fresh()->git_source);
    }

    public function test_git_requires_authentication(): void
    {
    // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (`Api.get('/instances/{id}/git')`)
    // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:752,797,806,831,913,916 (`connected`, `local_repository_exists`, `async_status.git_auto_deploy`, `drift_status`, `connection_health`)
        $this->getJson('/api/projects/1/git')->assertUnauthorized();
    }
}
