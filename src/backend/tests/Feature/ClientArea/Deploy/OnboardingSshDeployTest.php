<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Deploy-key (SSH) onboarding (git-deploy-keys, phase 2): the wizard creates
 * the container project without a repository (or reuses the domain step's) and
 * shows its deploy key, then the project's own `git/env-example` and
 * `git/deploy` finish the onboarding.
 *
 * Contract:
 *  - CA `Generate key`: `Api.post('/instances/deploy-key', {service_id,
 *    domain_id, shared_access, repo_url})`, reads `data.project` and
 *    `data.deploy_key.{public_key, fingerprint}` (no CA call site yet, phase 3).
 *  - Engine `POST /projects` (`template: dind`, no `git_repo`; 202 + Task) and
 *    `POST /projects/{u}/git/deploy-key` (201/200 `{created, public_key,
 *    fingerprint, hosts}`, `GitController::deployKey`).
 *  - CA env step: `GET /instances/{id}/git/env-example` → `{has_example,
 *    variables:[{key, value}]}`, read from the checkout `project/.env.example`.
 *  - CA deploy: `POST /instances/{id}/git/deploy {branch, env_vars}` → the
 *    Engine `PUT env-vars` (`apply: none`), then `PUT git/change-branch` (another
 *    branch) or `POST rebuild`, followed as an installation (`installation_*`).
 */
class OnboardingSshDeployTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const KEY = 'ssh-ed25519 AAAA panelalpha-site1';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // The repository host runs through the HostGuard; the fake keeps the
        // tests off DNS.
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)], 'git.example.org' => [TestNetwork::routable(36)]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function deployKeyBody(?int $domainId = null, string $repoUrl = 'git@github.com:acme/site.git'): array
    {
        return array_filter([
            'service_id' => VirtualService::ID,
            'domain_id' => $domainId,
            'shared_access' => [],
            'repo_url' => $repoUrl,
        ], static fn ($v) => $v !== null);
    }

    /**
     * @return array<string, mixed>
     */
    private function engineKey(): array
    {
        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (201 new / 200 existing)
        return ['data' => [
            'created' => true,
            'public_key' => self::KEY,
            'fingerprint' => 'SHA256:abc',
            'hosts' => [['host' => 'github.com', 'pinned' => 'published']],
        ]];
    }

    /**
     * A container project connected over SSH on branch `main`.
     */
    private function connectedApplication(User $user): Application
    {
        $application = $this->syncedApplication($user, 'site1', ['details' => [
            'template' => 'dind',
            'git_repo' => 'ssh://git@github.com/acme/site.git',
            'git_branch' => 'main',
        ]]);

        return $application;
    }

    public function test_generate_key_without_a_domain_creates_the_project_without_a_repo_and_returns_its_key(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->fakeEngineDeploys('sitex');

        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 55,
                'username' => 'sitex',
                'details' => ['username' => 'sitex', 'domain' => 'sitex.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
            'engine.example.com/api/projects/sitex/git/deploy-key' => Http::response($this->engineKey(), 201),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (Generate key; phase 3; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (data.project, data.deploy_key.public_key / fingerprint)
        $this->actingAs($user)
            ->postJson('/api/instances/deploy-key', $this->deployKeyBody())
            ->assertOk()
            ->assertJsonPath('data.project.id', Application::query()->where('engine_username', 'sitex')->value('id'))
            ->assertJsonPath('data.deploy_key.public_key', self::KEY)
            ->assertJsonPath('data.deploy_key.fingerprint', 'SHA256:abc')
            ->assertJsonPath('data.deploy_key.created', true);

        // One create call: the container template and no git fields at all.
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['template'] === 'dind'
            && ! array_key_exists('git_repo', $request->data())
            && ! array_key_exists('git_branch', $request->data())
            && ! array_key_exists('git_token', $request->data()));
        // github.com is a known forge: no `host` is pinned.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/sitex/git/deploy-key')
            && ! array_key_exists('host', $request->data()));
    }

    public function test_generate_key_with_a_domain_reuses_the_domain_step_project(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $this->fakeEngineDeploys('site1');

        // Engine: core/app/Http/Controllers/User/GitController.php:445 -> GitController::deployKey (200 for an existing key)
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response($this->engineKey(), 200),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (Generate key with the domain step's project; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson('/api/projects/deploy-key', $this->deployKeyBody($application->id, 'ssh://git@git.example.org:2222/acme/site.git'))
            ->assertOk()
            ->assertJsonPath('data.project.id', $application->id)
            ->assertJsonPath('data.deploy_key.public_key', self::KEY);

        // No second project; the self-hosted forge is pinned with its port.
        Http::assertNotSent(fn ($request) => $request->method() === 'POST' && str_ends_with($request->url(), '/api/projects'));
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/site1/git/deploy-key')
            && ($request['host'] ?? null) === 'git.example.org:2222');
        $this->assertSame(1, Application::query()->count());
    }

    public function test_generate_key_refuses_an_https_url_before_creating_anything(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();

        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (an HTTPS URL never reaches Generate key; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson('/api/projects/deploy-key', $this->deployKeyBody(null, 'https://github.com/acme/site.git'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['repo_url']);

        Http::assertNothingSent();
    }

    public function test_generate_key_refuses_a_project_that_already_has_a_git_source(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        $this->fakeEngineDeploys('site1');

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (a project that already has a repository; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson('/api/projects/deploy-key', $this->deployKeyBody($application->id))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain_id']);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/git/deploy-key'));
    }

    public function test_generate_key_refuses_a_project_with_a_git_install(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['source' => 'git', 'status' => 'success'])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (a project that already deployed from git; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson('/api/projects/deploy-key', $this->deployKeyBody($application->id))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain_id']);
    }

    public function test_env_example_is_read_from_the_checkout(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:708 -> files/download (the checkout root is `project/`)
        Http::fake([
            'engine.example.com/api/projects/site1/files/download*' => Http::response("# app\nAPP_ENV=production\nDB_HOST=\nexport API_KEY=\"abc\"\nnot a variable\n", 200),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (GET /instances/{id}/git/env-example; phase 3; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:211-294 (data.has_example, data.variables[].key / value; the shape of preview-env-example)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/env-example")
            ->assertOk()
            ->assertExactJson(['data' => [
                'has_example' => true,
                'variables' => [
                    ['key' => 'APP_ENV', 'value' => ''],
                    ['key' => 'DB_HOST', 'value' => ''],
                    ['key' => 'API_KEY', 'value' => ''],
                ],
            ]]);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'files/download')
            && ($request->data()['path'] ?? null) === 'project/.env.example'
            || str_contains($request->url(), 'path=project%2F.env.example'));
    }

    public function test_env_example_reports_a_missing_file_as_no_example(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:708 -> files/download (404 for a missing file)
        Http::fake([
            'engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'File not found.'], 404),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:145-159 (the env step tolerates has_example:false; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:145-159 (the response keys the step reads)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/env-example")
            ->assertOk()
            ->assertExactJson(['data' => ['has_example' => false, 'variables' => []]]);
    }

    public function test_deploy_on_the_connected_branch_rebuilds_and_follows_it_as_an_installation(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        $this->fakeEngineDeploys('site1');
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => [
                'template' => 'dind',
                'git_repo' => 'ssh://git@github.com/acme/site.git',
                'git_branch' => 'main',
            ]])]),
            // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild (202 + Task)
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 71, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (POST /instances/{id}/git/deploy; phase 3; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (data, then the progress modal waits for installation_*)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'main'])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        Http::assertSent(fn ($request) => $request->method() === 'POST' && str_ends_with($request->url(), '/site1/rebuild'));
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/git/change-branch'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 71
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_deploy_on_another_branch_changes_the_branch_and_follows_it_as_an_installation(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        $this->fakeEngineDeploys('site1');
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => [
                'template' => 'dind',
                'git_repo' => 'ssh://git@github.com/acme/site.git',
                'git_branch' => 'main',
            ]])]),
            // Engine: core/app/Http/Controllers/UserController.php -> rebuild (202 + Task); the welcome files must be excluded before change-branch
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 71, 'status' => 'queued']], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show
            'engine.example.com/api/tasks/71*' => Http::response(['data' => ['id' => 71, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/User/GitController.php:252 -> GitController::changeBranch (202 + Task on a deploy-managed checkout)
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['id' => 72, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (the env step's branch choice after branch_missing; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'master'])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/site1/git/change-branch')
            && $request['branch'] === 'master');
        // The rebuild runs and finishes before the branch switch (the Engine refuses change-branch on a dirty checkout).
        $urls = Http::recorded()->map(fn ($pair) => $pair[0]->url())->values()->all();
        $order = array_values(array_filter($urls, fn (string $u): bool => str_ends_with($u, '/site1/rebuild')
            || str_contains($u, '/tasks/71')
            || str_ends_with($u, '/git/change-branch')));
        $this->assertTrue(str_ends_with($order[0], '/site1/rebuild'));
        $this->assertTrue(str_ends_with((string) end($order), '/git/change-branch'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->taskId === 72
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_a_retry_with_another_branch_switches_it_even_when_a_git_deploy_is_recorded(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        // The settle rebuild of an earlier attempt is recorded as a successful git deploy.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy()]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1245-1250 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => [
                'template' => 'dind',
                'git_repo' => 'ssh://git@github.com/acme/site.git',
                'git_branch' => 'main',
            ]])]),
            // Engine: core/app/Http/Controllers/User/GitController.php:252-257 -> GitController::changeBranch (202 + TaskResource, queuedOrDone :492)
            'engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['id' => 73, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:671-677 (`Api.post('/instances/{id}/git/deploy', {branch, env_vars})`; a retry re-sends it through progressTryAgain :656-658)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'master'])
            ->assertOk();

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/site1/git/change-branch') && $request['branch'] === 'master');
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/site1/rebuild'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->taskId === 73);
    }

    public function test_deploy_stores_the_env_vars_merged_with_the_existing_ones_before_the_task(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        $this->fakeEngineDeploys('site1');
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => [
                'template' => 'dind',
                'git_repo' => 'ssh://git@github.com/acme/site.git',
                'git_branch' => 'main',
            ]])]),
            // Engine: core/app/Http/Controllers/User/EnvVarsController.php:49 -> index (reveal=1)
            'engine.example.com/api/projects/site1/env-vars*' => Http::sequence()
                ->push(['data' => ['vars' => [['key' => 'KEEP', 'value' => 'me', 'masked' => false]], 'applied_keys' => []]])
                // Engine: core/app/Http/Controllers/User/EnvVarsController.php:122 -> update (apply none: 200)
                ->push(['data' => ['vars' => []]]),
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 73, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:145-159 (`{env_vars, branch}` of the env step; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:145-159 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", [
                'branch' => 'main',
                'env_vars' => ['APP_ENV' => 'production'],
            ])
            ->assertOk();

        $urls = [];
        foreach (Http::recorded() as [$request]) {
            $urls[] = $request->method().' '.parse_url($request->url(), PHP_URL_PATH);
        }
        $put = array_search('PUT /api/projects/site1/env-vars', $urls, true);
        $rebuild = array_search('POST /api/projects/site1/rebuild', $urls, true);
        $this->assertNotFalse($put);
        $this->assertNotFalse($rebuild);
        $this->assertLessThan($rebuild, $put, 'The env vars must be stored before the task starts.');

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/site1/env-vars')
            && $request['env_vars'] === ['KEEP' => 'me', 'APP_ENV' => 'production']
            && $request['apply'] === 'none');
    }

    public function test_a_repeated_deploy_returns_the_project_without_starting_another_task(): void
    {
        $user = User::factory()->create();
        $application = $this->connectedApplication($user);
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index (a git install is running)
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['source' => 'git', 'status' => 'running'])]);
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => [
                'template' => 'dind',
                'git_repo' => 'ssh://git@github.com/acme/site.git',
                'git_branch' => 'main',
            ]])]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (a double click on the deploy button; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'main', 'env_vars' => ['A' => 'b']])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        Http::assertNotSent(fn ($request) => $request->method() !== 'GET');
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_deploy_refuses_a_project_that_is_not_connected(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $this->fakeEngineDeploys('site1');
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']])]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (deploy before the connect succeeded; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'main'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['deploy']);

        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_deploy_refuses_a_classic_project(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');
        Queue::fake();

        // Engine: core/app/Http/Controllers/UserController.php:1302 -> show (the mirror sync before the checks)
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1')]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (a classic project has no container deploy; the SSH call is added in phase 3)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1967-2031 (the response keys the step reads)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/deploy", ['branch' => 'main'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['deploy']);
    }
}
