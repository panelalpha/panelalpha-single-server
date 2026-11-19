<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Projects\OnboardingDeployService;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Files-source onboarding: the domain step created a DinD
 * project, then the CA uploads its archive and starts the install deploy.
 *
 * Contract:
 *  - CA `uploadFiles`: `Api.post('/instances/upload-files', file, {headers:
 *    {'Content-Type': <file type>}, params: {service_id, domain_id, filename}})`
 *    and reads `response.data.remote_filepath`
 *    (`OnboardingModalWrapper.vue:905-916`).
 *  - CA `installFromFiles`: `Api.post('/instances/deploy', {service_id,
 *    domain_id, shared_access, source_type, remote_filepath, env_vars})` and
 *    reads `response.data.data` (`OnboardingModalWrapper.vue:924-932`).
 *  - Engine `POST /projects/{u}/files/upload` (multipart `file` + `path`,
 *    `FileController::upload`) and `POST /projects/{u}/deploy-archive`
 *    (`zip_path` + `env_vars`, 202 + Task, `UserController::deployArchive`).
 *  - CA `deployFromGit`: `Api.post('/instances/deploy', {service_id, domain_id,
 *    shared_access, source_type, repo_url, token, branch, env_vars})` and reads
 *    `response.data.data` (`OnboardingModalWrapper.vue:612-624`). Engine
 *    `POST /projects/{u}/source` (`git_repo` + `git_branch` + `git_token` +
 *    `env_vars`, 202 + Task, `UserController::attachSource`) attaches the
 *    repository to the container project the git domain step created when the
 *    CA sends a `domain_id`; the CA's default git path has no domain step
 *    (`OnboardingModalWrapper.vue:533`), so without a `domain_id` the route
 *    creates the container project with the repository in one `POST /projects`
 *    (`template: dind` + the git fields, `UserController::storeAsync`, 202 +
 *    Task) and follows its create task with `WatchDeployJob`
 *    (`installation_*`).
 */
class OnboardingFilesDeployTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * A files-onboarding DinD project: the mirror row plus the marker the real
     * domain step sets after the Engine create task. The
     * end-to-end chain builds the marker by running the real step.
     */
    private function dindApplication(User $user): Application
    {
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $application->forceFill(['onboarding_files_at' => now()])->save();

        return $application;
    }

    /**
     * The row the plain (classic) domain step leaves, built directly so a test
     * can control the `/projects/all` stub (an earlier `syncedApplication` stub
     * would win over the empty list a swap test needs).
     */
    private function domainStepApplication(User $user): Application
    {
        $this->configureEngine();
        // A `pending` row reads its install state from the Engine's deploys
        //Nothing is deployed yet.
        $this->fakeEngineDeploys('shop');

        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'shop',
            'domain' => 'shop.example.com',
            'status' => 'pending',
            'type' => Application::TYPE_CUSTOM,
            'onboarding_at' => now(),
        ]);
    }

    public function test_upload_files_stores_the_raw_body_and_returns_the_remote_path(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir; :581 -> files/upload
        // The multipart body is read inside the fake: the request stream is
        // closed once the upload handler returns.
        $sentBody = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
        Http::fake([
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => function ($request) use (&$sentBody) {
                $sentBody = $request->body();

                // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
                return Http::response(['success' => true]);
            },
        ]);

        $payload = 'ZIP-BYTES';
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:916
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                $payload,
            )
            ->assertOk()
            ->assertJsonPath('remote_filepath', 'project/.panelalpha-upload/site.zip');

        // The raw body reaches the Engine; the path is the project home folder
        // the deploy later requires.
        $this->assertIsString($sentBody);
        $this->assertStringContainsString($payload, $sentBody);
        $this->assertStringContainsString('site.zip', $sentBody);
        $this->assertStringContainsString('name="path"', $sentBody);
        $this->assertStringContainsString('project/.panelalpha-upload', $sentBody);
        $this->assertStringContainsString('name="file"', $sentBody);
    }

    public function test_upload_files_alias_instances_is_registered(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:916
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/instances/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertOk()
            ->assertJsonPath('remote_filepath', 'project/.panelalpha-upload/site.zip');
    }

    public function test_upload_files_is_404_for_a_project_the_user_cannot_see(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                '/api/projects/upload-files?service_id='.VirtualService::ID.'&domain_id=999&filename=site.zip',
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertNotFound();
    }

    public function test_upload_files_rejects_a_foreign_service(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                '/api/projects/upload-files?service_id=2&domain_id='.$application->id.'&filename=site.zip',
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertNotFound();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    public function test_upload_files_requires_authentication(): void
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->postJson('/api/projects/upload-files')->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->postJson('/api/instances/upload-files')->assertUnauthorized();
    }

    public function test_deploy_from_files_starts_an_install_deploy_and_watches_it(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive ($rebuild->assertArchive then startRedeploy -> {data:{id}} 202)
        $existsUrl = null;
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => function ($request) use (&$existsUrl) {
                $existsUrl = $request->url();

                // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
                return Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']);
            },
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                'env_vars' => ['APP_ENV' => 'production'],
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        // The 202 body reaches the Engine with the archive and env vars.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/deploy-archive')
            && $request['zip_path'] === 'project/.panelalpha-upload/site.zip'
            && $request['env_vars'] === ['APP_ENV' => 'production']);

        // The existence pre-check asks for the exact home-relative archive.
        $this->assertIsString($existsUrl);
        $this->assertStringContainsString('path=project%2F.panelalpha-upload%2Fsite.zip', $existsUrl);

        // The install deploy is followed (no panel row).
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 7
            && $job->sourceType === 'files'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed'
            // The watcher can only delete the archive it was told about
            //So the service must pass the path.
            && $job->archivePath === 'project/.panelalpha-upload/site.zip');
    }

    public function test_deploy_alias_instances_is_registered(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/instances/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);
    }

    public function test_deploy_git_without_a_repo_url_is_422(): void
    {
        // Git onboarding is implemented: the source
        // attach needs a repository, so a git deploy without one is refused
        // before any Engine call.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:630
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('repo_url');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));
    }

    /**
     * A git-onboarding DinD project: the domain step created a container
     * project and did not set the files marker.
     */
    /**
     * The container project the git domain step created. The onboarding check
     * reads the Engine's deploys: none is listed, unless the test
     * faked its own answer first (the first matching fake answers).
     */
    private function gitApplication(User $user): Application
    {
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $this->fakeEngineDeploys('site1');

        return $application;
    }

    public function test_deploy_from_git_attaches_the_source_and_watches_it(): void
    {
        $user = User::factory()->create();
        $application = $this->gitApplication($user);

        // The repository host runs through the HostGuard; the fake keeps the
        // test off DNS.
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
        // (202 + TaskResource; core/app/Lib/Project/SourceAttacher.php:35).
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
                'branch' => 'main',
                'token' => 'ghp_secret',
                'env_vars' => ['APP_ENV' => 'production'],
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        // The CA field names are mapped to the Engine's (the CA sends `token`,
        // the Engine wants `git_token`); the URL is the canonical form.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/projects/site1/source')
            && $request['git_repo'] === 'https://github.com/example/site.git'
            && $request['git_branch'] === 'main'
            && $request['git_token'] === 'ghp_secret'
            && $request['env_vars'] === ['APP_ENV' => 'production']);

        $application->refresh();
        $this->assertSame('ghp_secret', $application->gitToken());
        $this->assertSame('https://github.com/example/site.git', $application->git_source);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 9
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_deploy_from_git_with_a_public_repository_stores_the_source_without_a_token(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        $this->fakeEngineDeploys('sitey');

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 56,
                'username' => 'sitey',
                'details' => ['username' => 'sitey', 'domain' => 'sitey.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/public-site.git',
                'branch' => 'main',
            ])
            ->assertOk();

        $application = Application::query()->where('engine_username', 'sitey')->sole();
        $this->assertSame('https://github.com/example/public-site.git', $application->git_source);
        $this->assertSame('github', $application->git_provider);
        $this->assertNull($application->gitToken());
        $this->assertNull($application->getRawOriginal('git_token'));
    }

    public function test_deploy_from_git_without_a_domain_creates_the_container_project_with_the_source(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // The new `pending` row reads its install state from the Engine's
        // deploys: the create has not started its deploy yet.
        $this->fakeEngineDeploys('sitex');

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 55,
                'username' => 'sitex',
                'details' => ['username' => 'sitex', 'domain' => 'sitex.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
        ]);

        // The CA's default git path has no domain step (OnboardingModalWrapper.vue:533),
        // so the project and the repository are created in one call.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
                'branch' => 'main',
                'token' => 'ghp_secret',
                'env_vars' => ['APP_ENV' => 'production'],
            ])
            ->assertOk()
            ->assertJsonPath('data.id', Application::query()->where('engine_username', 'sitex')->value('id'));

        // One create call with the container template and the git source; the
        // CA fields map to the Engine's.
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['template'] === 'dind'
            && $request['git_repo'] === 'https://github.com/example/site.git'
            && $request['git_branch'] === 'main'
            && $request['git_token'] === 'ghp_secret'
            && $request['env_vars'] === ['APP_ENV' => 'production']);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));

        $application = Application::query()->where('engine_username', 'sitex')->sole();
        // The no-domain onboarding create stores
        // the kind it asked for at creation, so a kind-gated action on the new
        // project does not wait for the hourly WordPress probe.
        $this->assertSame(Application::TYPE_CUSTOM, $application->type);
        // The wizard token is kept on the row like the Git card keeps it, so
        // "No token saved" does not show and auto-deploy has its credentials.
        $this->assertSame('ghp_secret', $application->gitToken());
        $this->assertSame('https://github.com/example/site.git', $application->git_source);
        $this->assertSame('github', $application->git_provider);
        $this->assertNotSame('ghp_secret', $application->getRawOriginal('git_token'), 'the token is encrypted at rest');
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 55
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_deploy_from_git_waits_in_the_background_when_the_project_is_still_preparing(): void
    {
        $user = User::factory()->create();
        $application = $this->gitApplication($user);
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Queue::fake();
        // Engine: core/app/Exceptions/DeployBusyException.php:19 -> whileIdle's busy 409
        // (no `problems` code: the create task is still running).
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => 'A deploy of this project is already queued or running: task 91.',
            ], 409),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
                'branch' => 'main',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        // The CA never reads the Engine's busy 409: the attach waits in a job.
        Queue::assertPushed(AttachGitSourceJob::class, fn (AttachGitSourceJob $job): bool => $job->applicationId === $application->id
            && $job->source['git_repo'] === 'https://github.com/example/site.git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_deploy_from_git_answers_the_accepted_state_when_a_source_is_already_attached(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->gitApplication($user);
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Notification::fake();
        // Engine: core/app/Lib/Project/SourceAttacher.php:82 -> source_already_attached
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => "Project 'site1' already deploys from git.",
                'problems' => [['field' => 'git_repo', 'code' => 'source_already_attached']],
            ], 409),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        // The accepted state, never a watcher or an
        // `installation_failed`.
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertNothingSent();
    }

    /**
     * The CA's createDomain body has no
     * `source_type` (`OnboardingModalWrapper.vue:1561-1572`), so the domain step
     * creates a classic project; a git deploy must then replace it in the
     * background instead of attaching (the Engine refuses a classic project).
     */
    public function test_the_ca_domain_step_then_a_git_deploy_dispatches_the_classic_replacement(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // The `pending` row reads its install state and the onboarding check
        // its git install from the Engine's deploys: none yet.
        $this->fakeEngineDeploys('shop');

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 55,
                'username' => 'shop',
                'details' => ['username' => 'shop', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575
        $this->actingAs($user)->postJson('/api/services/'.VirtualService::ID.'/domains', [
            'domain' => 'shop.example.com',
            'name' => 'shop',
            'delegated_user_email' => 'owner@example.com',
            'user_configurable_options' => [],
        ])->assertStatus(202)->assertJsonPath('data.domain', 'shop.example.com');

        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertNotNull($application->onboarding_at);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
            'branch' => 'main',
            'token' => 'ghp_secret',
        ])->assertOk()->assertJsonPath('data.id', $application->id);

        // The CA never reads the Engine's attach refusal: the replacement runs
        // in the background job.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));
        // The swap is marked before the job runs, so a repeated deploy answers
        // the accepted state instead of a second replacement.
        $this->assertNotNull($application->fresh()->replacing_at);
        Queue::assertPushed(ReplaceClassicOnboardingProjectJob::class, fn (ReplaceClassicOnboardingProjectJob $job): bool => $job->applicationId === $application->id
            && $job->source['git_repo'] === 'https://github.com/example/site.git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_the_replace_job_deletes_the_classic_project_and_creates_the_container(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'shop', ['domain' => 'shop.example.com', 'details' => []]);
        $application->forceFill(['onboarding_at' => now()])->save();

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> destroy (DELETE /projects/{u}); :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 60,
                'username' => 'shop',
                'details' => ['username' => 'shop', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);

        (new ReplaceClassicOnboardingProjectJob(
            $application->id,
            [
                'git_repo' => 'https://github.com/example/site.git',
                'git_branch' => 'main',
                'git_token' => 'ghp_secret',
                'env_vars' => [],
            ],
            'user.instance.installation_finished',
            'user.instance.installation_failed',
        ))->handle(app(ApplicationProvisioner::class), app(AccessResolver::class));

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/projects/shop'));
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['domain'] === 'shop.example.com'
            && $request['username'] === 'shop'
            && $request['template'] === 'dind'
            && $request['git_repo'] === 'https://github.com/example/site.git'
            && $request['git_branch'] === 'main'
            && $request['git_token'] === 'ghp_secret');

        $this->assertNull($application->fresh()->onboarding_at);
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 60
            && $job->sourceType === 'git');
    }

    /**
     * The CA keeps polling the id the domain step
     * gave it, so that id must answer 200 through the whole Engine swap – even
     * when a sync runs while the Engine lists neither the deleted classic
     * project nor (yet) the container one.
     */
    public function test_the_domain_step_id_answers_200_while_the_engine_swap_is_in_progress(): void
    {
        $user = User::factory()->create();
        $application = $this->domainStepApplication($user);
        $application->forceFill(['replacing_at' => now()])->save();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll; the replace job already deleted the classic project.
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575 (createDomain stores response.data.data as newDomain)
        // CA reads: packages/client-area/src/apis/Instances.js:17 (the project payload)
        $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);
    }

    /**
     * The replacement follows the create task as a
     * normal git onboarding – the watcher ends the row, records the deployed
     * commit and sends exactly one `installation_finished`.
     */
    public function test_the_replacement_install_notifies_once_and_records_the_deployed_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->domainStepApplication($user);
        $commit = str_repeat('a', 40);
        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the classic project is still there)
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync (202 + TaskResource)
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show; the create task never writes deploy_id, it ends from deployment_status
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the container project carries the deployed commit)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(60, 'shop', [
                // The create's clean deploy outcome (Models/User.php:1346-1358).
                'details' => ['template' => 'dind', 'git_repo' => 'https://github.com/example/site.git', 'git_commit' => $commit, 'deployment_status' => 'success'],
            ])]]),
            'engine.example.com/api/projects/shop/git/commits*' => Http::response(['data' => [[
                'hash' => $commit, 'short_hash' => substr($commit, 0, 7), 'subject' => 'First', 'author' => 'Dev', 'date' => '2026-10-12T09:00:00+00:00',
            ]]]),
            'engine.example.com/api/tasks/60*' => Http::response(['data' => [
                'id' => 60, 'status' => 'completed', 'details' => ['deployment_status' => 'success'], 'logs' => [], 'next_after_id' => 0,
            ]]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 60, 'username' => 'shop', 'details' => ['username' => 'shop', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);

        $source = [
            'git_repo' => 'https://github.com/example/site.git',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => [],
        ];
        $finishedType = 'user.instance.installation_finished';
        $failedType = 'user.instance.installation_failed';

        Queue::fake();
        (new ReplaceClassicOnboardingProjectJob($application->id, $source, $finishedType, $failedType))
            ->handle(app(ApplicationProvisioner::class), app(AccessResolver::class));
        $watcher = null;
        Queue::assertPushed(WatchDeployJob::class, function (WatchDeployJob $job) use (&$watcher): bool {
            $watcher = $job;

            return $job->taskId === 60;
        });
        $this->assertInstanceOf(WatchDeployJob::class, $watcher);
        $this->assertNull($application->fresh()->onboarding_at, 'the replaced row leaves classic onboarding');
        $this->assertNull($application->fresh()->replacing_at, 'the marker is cleared when the job ends');

        $watcher->handle(app(ApplicationSynchronizer::class));

        $this->assertSame($commit, $application->fresh()->git_last_commit_hash);
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => $n->broadcastType() === $finishedType && $n->isError === false);

        // Review-fix: the CA's own project read must report the finished
        // install, not only the panel log/notification.
        // CA: packages/client-area/src/apis/Instances.js:17 (the project page re-reads the instance)
        // CA reads: packages/client-area/src/apis/Instances.js:202 (async_status.installation)
        $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
            ->assertJsonPath('data.async_status.installation', 'finished');
    }

    /**
     * @return array<string, array{0: bool, 1: bool}>
     */
    public static function classicRefusals(): array
    {
        return [
            'classic non-onboarding' => [false, false],
            // An accepted install row no longer marks a touched
            // onboarding project; the files marker does (`ClassicOnboardingState`).
            'files onboarding' => [true, true],
        ];
    }

    #[DataProvider('classicRefusals')]
    public function test_a_git_deploy_on_a_classic_project_is_refused_with_422(bool $onboarding, bool $deployed): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => []]);
        // No git install is listed (the onboarding check reads the Engine).
        $this->fakeEngineDeploys('site1');
        if ($onboarding) {
            $application->forceFill(['onboarding_at' => now()])->save();
        }
        if ($deployed) {
            $application->forceFill(['onboarding_files_at' => now()])->save();
        }
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        // Engine: core/app/Lib/Project/SourceAttacher.php:91 -> project_not_eligible
        $message = "Project 'site1' is classic shared hosting, so a git source cannot be attached to it. Create the project with `template: dind` to deploy it from git.";
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => $message,
                'problems' => [['field' => 'git_repo', 'code' => 'project_not_eligible', 'message' => $message]],
            ], 409),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:630
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
        ])->assertStatus(422)->assertJsonValidationErrors('git_repo');

        Queue::assertNotPushed(ReplaceClassicOnboardingProjectJob::class);
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_a_double_git_deploy_answers_the_same_accepted_state_and_one_install_row(): void
    {
        $user = User::factory()->create();
        // The first submit finds no git install on the Engine; by
        // the second the Engine lists the attach's install deploy running.
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        Http::fake(['engine.example.com/api/projects/site1/deploys' => Http::sequence()
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index (nothing deployed yet)
            ->push(['data' => []])
            // Engine: core/app/Lib/Deploy/DeployLog/DeployStartLine.php:75-82 -> a start line naming the repo is kind install
            ->push(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'git', 'action' => 'attach_source', 'task_id' => 9])]])
            ->whenEmpty(Http::response(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'git', 'action' => 'attach_source', 'task_id' => 9])]]))]);
        $application = $this->gitApplication($user);
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Queue::fake();
        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        $body = [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
            'branch' => 'main',
        ];

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertOk()->assertJsonPath('data.id', $application->id);
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertOk()->assertJsonPath('data.id', $application->id);

        // The second submit answers the accepted state without another Engine
        // attach or a second watcher.
        Queue::assertPushed(WatchDeployJob::class, 1);
        $attaches = collect(Http::recorded())
            ->map(fn ($pair) => $pair[0])
            ->filter(fn ($request) => str_ends_with($request->url(), '/api/projects/site1/source'))
            ->values();
        $this->assertCount(1, $attaches);
        // The repeat sends no `installation_failed`.
        Notification::assertNothingSent();
    }

    public function test_a_running_install_that_is_not_git_does_not_count_as_the_git_onboarding(): void
    {
        $user = User::factory()->create();
        // The domain step's own create deploy (a template install) runs on
        // the Engine; it is not the git onboarding, so the attach goes ahead.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'template', 'action' => 'deploy'])]);
        $application = $this->gitApplication($user);
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
        ])->assertOk()->assertJsonPath('data.id', $application->id);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/projects/site1/source'));
    }

    public function test_a_git_deploy_after_success_answers_accepted_without_an_attach(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // The Engine lists the git install that succeeded (the panel's own
        // row for it is gone).
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'success', 'kind' => 'install', 'source' => 'git', 'action' => 'attach_source', 'task_id' => 9])]);
        $application = $this->gitApplication($user);
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Notification::fake();
        // Only the deploy list may be read: any other request is stray and
        // fails this test.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
        ])->assertOk()->assertJsonPath('data.id', $application->id);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertNothingSent();
    }

    /**
     * An "already accepted" answer changes no state, so the token a repeated
     * deploy sends does not replace the saved one.
     */
    public function test_a_repeated_git_deploy_keeps_the_saved_token(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'success', 'kind' => 'install', 'source' => 'git', 'action' => 'attach_source', 'task_id' => 9])]);
        $application = $this->gitApplication($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Notification::fake();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
            'token' => 'ghp_new',
        ])->assertOk()->assertJsonPath('data.id', $application->id);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));
        $this->assertSame('ghp_old', $application->refresh()->gitToken());
    }

    /**
     * The service's `source_already_attached` answer is "accepted" and stores
     * nothing, so the saved token stays.
     */
    public function test_a_duplicate_git_attach_keeps_the_saved_token(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->gitApplication($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);

        Notification::fake();
        // Engine: core/app/Lib/Project/SourceAttacher.php:82 -> source_already_attached
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => "Project 'site1' already deploys from git.",
                'problems' => [['field' => 'git_repo', 'code' => 'source_already_attached']],
            ], 409),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
            'token' => 'ghp_new',
        ])->assertOk()->assertJsonPath('data.id', $application->id);

        Queue::assertNotPushed(WatchDeployJob::class);
        $this->assertSame('ghp_old', $application->refresh()->gitToken());
        $this->assertNull($application->git_source);
    }

    public function test_deploy_from_git_rejects_a_blocked_repository_host(): void
    {
        $user = User::factory()->create();
        $application = $this->gitApplication($user);

        // The host resolves to a private address; the guard refuses before any
        // Engine call.
        $this->fakeHostResolver([TestNetwork::private(5) => [TestNetwork::private(5)]]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:630
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'git',
                'repo_url' => 'http://'.TestNetwork::private(5).'/repo.git',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('host');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/source'));
    }

    /**
     * @param  list<string>  $remoteFilepaths
     */
    #[DataProvider('rejectedRemoteFilepaths')]
    public function test_deploy_rejects_a_file_the_project_did_not_receive(array $remoteFilepaths, bool $exists): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => $exists, 'path' => '/project/.panelalpha-upload/site.zip']),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => $remoteFilepaths,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('remote_filepath');

        Queue::assertNotPushed(WatchDeployJob::class);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    /**
     * @return array<string, array{0: list<string>, 1: bool}>
     */
    public static function rejectedRemoteFilepaths(): array
    {
        return [
            'missing' => [[], true],
            'two archives' => [['project/.panelalpha-upload/a.zip', 'project/.panelalpha-upload/b.zip'], true],
            'outside the upload folder' => [['public_html/site.zip'], true],
            'path traversal' => [['project/.panelalpha-upload/../site.zip'], true],
            'not uploaded' => [['project/.panelalpha-upload/site.zip'], false],
            'not an archive' => [['project/.panelalpha-upload/dump.sql'], true],
        ];
    }

    public function test_deploy_answers_an_engine_error_when_the_exists_check_body_is_malformed(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // A 200 without a boolean `exists` is malformed: the panel must answer
        // the Engine error, never read it as "not uploaded".
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        Http::fake(['engine.example.com/api/projects/site1/files/exists*' => Http::response(['path' => '/project/.panelalpha-upload/site.zip'])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(502)
            ->assertJsonPath('message', 'The Engine did not answer whether the file exists.');

        Queue::assertNotPushed(WatchDeployJob::class);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_deploy_requires_the_create_instance_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        $this->denyPrivilege('service.create_instance');

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertForbidden();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_deploy_is_404_for_a_project_the_user_cannot_see(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => 999,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertNotFound();
    }

    public function test_deploy_bubbles_an_engine_hiccup(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            'engine.example.com/api/projects/site1/deploy-archive' => Http::failedConnection(),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(503);

        // Nothing persisted when the Engine did not accept the deploy.
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_deploy_bubbles_an_engine_500(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(502);

        // Nothing persisted when the Engine did not accept the deploy.
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_upload_files_bubbles_a_connection_error(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => Http::failedConnection(),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertStatus(503);
    }

    public function test_upload_files_bubbles_an_engine_500(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [],
                [],
                [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertStatus(502);
    }

    /**
     * The recorded live answer: the Engine denies the upload
     * with a mkdir error. The panel must answer the `{message}` envelope the CA
     * reads (`Api.getErrorMessage` reads `error.response.data.message`,
     * `packages/client-area/src/apis/Api.js:67-92`), not an HTML error page, and
     * the absolute home path in the Engine text must be hidden.
     */
    public function test_a_failed_upload_answers_the_ca_error_envelope(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Log::spy();

        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
        // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response([
                'message' => "mkdir: cannot create directory '/home/eefiles1zip/deploy-archives': Permission denied\n (exit code 1)",
            ], 500),
            'engine.example.com/api/projects/site1/files/upload' => Http::response([
                'message' => "mkdir: cannot create directory '/home/eefiles1zip/deploy-archives': Permission denied\n (exit code 1)",
            ], 500),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $response = $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertStatus(502)
            // CA reads: packages/client-area/src/apis/Api.js:67
            ->assertJsonPath('message', "mkdir: cannot create directory '".EngineText::REDACTED_PATH."': Permission denied\n (exit code 1)");

        $this->assertStringNotContainsString('/home/', (string) $response->json('message'));
        Log::shouldHaveReceived('warning')
            ->with('Engine text hidden from the Client Area.', \Mockery::on(
                fn (array $context): bool => str_contains((string) ($context['message'] ?? ''), '/home/eefiles1zip')
            ))
            ->atLeast()->once();

        // The upload still targets the account-owned directory.
        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/mkdir')
            && $request['path'] === 'project/.panelalpha-upload');
    }

    public function test_a_refused_deploy_deletes_the_staged_archive_and_hides_the_home_path(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response([
                'message' => 'Archive not found: /home/eefiles1zip/project/.panelalpha-upload/site.zip',
                'errors' => ['zip_path' => ['Archive not found: /home/eefiles1zip/project/.panelalpha-upload/site.zip']],
            ], 422),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $response = $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(422);

        // CA reads: packages/client-area/src/apis/Api.js:67 (errors are read before message)
        $this->assertStringNotContainsString('/home/', (string) $response->json('errors.zip_path.0'));

        // The refused deploy left no task, so the panel deletes the archive it
        // staged.
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');

        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_deploy_requires_authentication(): void
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->postJson('/api/projects/deploy')->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->postJson('/api/instances/deploy')->assertUnauthorized();
    }

    public function test_upload_files_passes_the_long_engine_timeout(): void
    {
        // The CA may post a large archive and the upload is a synchronous Engine
        // call on the request path, so it carries
        // EngineClient::LONG_TIMEOUT_SECONDS.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        $spy = $this->spyEngineTimeout($application);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertOk();

        $this->assertSame(EngineClient::LONG_TIMEOUT_SECONDS, $spy->requestedTimeout);
        // Pin the literal too, so changing the constant fails here.
        $this->assertSame(1700, EngineClient::LONG_TIMEOUT_SECONDS);
    }

    #[DataProvider('rejectedFilenames')]
    public function test_upload_files_rejects_a_filename_outside_the_whitelist(string $filename): void
    {
        // Only `[A-Za-z0-9._-]+` with a non-empty stem may become
        // the `project/.panelalpha-upload/<name>` path the Engine writes.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:916
        $this->actingAs($user)
            ->call(
                'POST',
                '/api/projects/upload-files?service_id='.VirtualService::ID."&domain_id={$application->id}&filename=".rawurlencode($filename),
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertStatus(422)
            ->assertJsonValidationErrors('filename');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function rejectedFilenames(): array
    {
        return [
            'bare .zip' => ['.zip'],
            'NUL byte' => ["site\0.zip"],
            'path separator' => ['dir/site.zip'],
            'backslash' => ['dir\\site.zip'],
            'spaces' => ['my site.zip'],
        ];
    }

    public function test_upload_files_refuses_a_live_git_dind_project_with_a_finished_redeploy(): void
    {
        // Only files onboarding carries the marker, so a
        // live git DinD project that finished a redeploy must use the project
        // upload route. The old "no install row" test matched this project and
        // let onboarding flip its installation state.
        $user = User::factory()->create();
        $application = $this->liveGitDindApplication($user);
        $this->assertNull($application->onboarding_files_at);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:916
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain_id');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    public function test_deploy_refuses_a_live_git_dind_project_with_a_finished_redeploy(): void
    {
        // The deploy shares the marker gate with the upload.
        $user = User::factory()->create();
        $application = $this->liveGitDindApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain_id');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_the_first_accepted_deploy_clears_the_files_onboarding_marker(): void
    {
        // The marker lives until the Engine accepts the first deploy; a failed
        // Engine call keeps it so the CA can retry.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertOk();

        $this->assertNull($application->fresh()->onboarding_files_at);

        // A second onboarding deploy is refused: the project has left onboarding.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain_id');
    }

    public function test_a_failed_deploy_keeps_the_files_onboarding_marker(): void
    {
        // Persist-after-accept: the marker is cleared only
        // once the Engine accepted the deploy. A failed
        // Engine call keeps it, so the retry the CA offers still passes the gate.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        $attempts = 0;
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => function () use (&$attempts) {
                $attempts++;

                if ($attempts === 1) {
                    throw new ConnectionException('engine down');
                }

                // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
                return Http::response(['data' => ['id' => 7]], 202);
            },
        ]);

        $body = [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'files',
            'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
        ];

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertStatus(503);
        $this->assertNotNull($application->fresh()->onboarding_files_at);
        Queue::assertNotPushed(WatchDeployJob::class);

        // The Engine recovers: the retry is accepted and only now is the marker
        // cleared (the CA retries the same body after the lost response).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertOk();
        $this->assertNull($application->fresh()->onboarding_files_at);
    }

    public function test_a_failed_deploy_with_a_5xx_keeps_the_files_onboarding_marker(): void
    {
        // The failed-deploy coverage includes an Engine 5xx as well
        // as a connection error. Persist-after-accept keeps the marker, so the
        // CA's retry still passes the gate.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        $attempts = 0;
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => function () use (&$attempts) {
                $attempts++;
                if ($attempts === 1) {
                    // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
                    return Http::response(['message' => 'boom'], 500);
                }

                // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
                return Http::response(['data' => ['id' => 7]], 202);
            },
        ]);

        $body = [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'source_type' => 'files',
            'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
        ];

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertStatus(502);
        $this->assertNotNull($application->fresh()->onboarding_files_at);
        Queue::assertNotPushed(WatchDeployJob::class);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)->postJson('/api/projects/deploy', $body)->assertOk();
        $this->assertNull($application->fresh()->onboarding_files_at);
    }

    public function test_the_deploy_lock_outlasts_two_engine_timeouts(): void
    {
        // The lock covers the `files/exists` check and the
        // `deploy-archive` call, each bounded by `engine_timeout`; it must
        // outlast both with a margin or it could expire mid-call and let a
        // second deploy in. Both the relation and the margin literal are pinned.
        $this->assertSame(
            2 * (int) config('client-area.engine_timeout') + 30,
            OnboardingDeployService::deployLockSeconds(),
        );
        $this->assertSame(30, OnboardingDeployService::DEPLOY_LOCK_MARGIN_SECONDS);
    }

    public function test_the_deploy_holds_the_lock_while_it_calls_the_engine(): void
    {
        // The lock must cover the whole Engine sequence
        // (`files/exists` and `deploy-archive`), not be released between them.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();

        $key = OnboardingDeployService::deployLockKey($application->id);
        $heldDuring = [];
        $lockIsHeld = function () use ($key, &$heldDuring): void {
            // A second get() on a held lock answers false (same store/owner).
            $heldDuring[] = ! Cache::lock($key, OnboardingDeployService::deployLockSeconds())->get();
        };

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => function () use ($lockIsHeld) {
                $lockIsHeld();

                // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
                return Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']);
            },
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => function () use ($lockIsHeld) {
                $lockIsHeld();

                // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
                return Http::response(['data' => ['id' => 7]], 202);
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertOk();

        $this->assertSame([true, true], $heldDuring, 'The per-application deploy lock must be held across both Engine calls.');
    }

    public function test_deploy_re_reads_the_onboarding_marker_after_taking_the_lock(): void
    {
        // A deploy that held the lock just before this request may
        // have cleared the marker, so the pre-lock row is stale. The step must
        // re-read after the lock and refuse, not start a second Engine rebuild.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        $this->app->instance(ApplicationRepository::class, new class($application) implements ApplicationRepository
        {
            public function __construct(private Application $application) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->application]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                // The returned row still carries the marker, but the DB row
                // leaves onboarding before the service takes the lock.
                $stale = clone $this->application;
                $this->application->forceFill(['onboarding_files_at' => null])->save();

                return $stale;
            }

            public function domainsInUse(): array
            {
                return [];
            }
        });

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain_id');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_a_failed_marker_clear_keeps_onboarding_and_still_follows_the_deploy(): void
    {
        // The marker clear and the watcher are one transaction, so
        // a failed clear leaves the project in onboarding (the CA can retry) –
        // and the deploy the Engine accepted is still followed so the CA spinner
        // ends (there is no deploy row any more).
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        Exceptions::fake();

        Application::saving(static function (Application $saving): void {
            if ($saving->isDirty('onboarding_files_at') && $saving->onboarding_files_at === null) {
                throw new \RuntimeException('marker clear failed');
            }
        });

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertOk();

        Exceptions::assertReported(\RuntimeException::class);

        $this->assertNotNull($application->fresh()->onboarding_files_at);
        // One watcher: the transaction's was discarded, the fallback's runs.
        Queue::assertPushed(WatchDeployJob::class, 1);
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 7
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed'
            && $job->archivePath === 'project/.panelalpha-upload/site.zip');
    }

    public function test_a_concurrent_onboarding_deploy_is_refused_by_the_per_application_lock(): void
    {
        // Two concurrent deploys must not start two Engine rebuilds and two
        // watchers. The lock is per application.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        $lock = Cache::lock(OnboardingDeployService::deployLockKey($application->id), 30);
        $this->assertTrue($lock->get());

        try {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
            $this->actingAs($user)
                ->postJson('/api/projects/deploy', [
                    'service_id' => VirtualService::ID,
                    'domain_id' => $application->id,
                    'source_type' => 'files',
                    'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('domain_id');

            Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
        } finally {
            $lock->release();
        }

        // The held lock was the only reason for the refusal: once it is free the
        // deploy starts normally.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertOk();
    }

    public function test_upload_files_is_404_for_a_project_hidden_by_the_repository(): void
    {
        // The row exists but the repository does not hand it to this user – the
        // Pro/Multi ownership the old route checked with `service->domains->contains()`.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);
        $this->hideProject();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/projects/upload-files?service_id=".VirtualService::ID."&domain_id={$application->id}&filename=site.zip",
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertNotFound();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    public function test_deploy_is_404_for_a_project_hidden_by_the_repository(): void
    {
        $user = User::factory()->create();
        $application = $this->dindApplication($user);
        $this->hideProject();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
            ])
            ->assertNotFound();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_deploy_checks_the_create_instance_privilege_before_validation(): void
    {
        // The old privilege middleware ran before the FormRequest; the empty
        // body would be a 422, so a 403 here proves the order.
        $user = User::factory()->create();
        $this->dindApplication($user);
        $this->denyPrivilege('service.create_instance');

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [])
            ->assertForbidden();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    public function test_files_onboarding_runs_the_real_domain_step_then_upload_then_deploy(): void
    {
        // One end-to-end chain with the CA's request shapes
        // (OnboardingModalWrapper.vue:754, 805-813, 924); the project comes from
        // the real domain step, never `syncedApplication()`.
        $this->configureEngine();
        Queue::fake();
        // Every read re-syncs, so the post-create domain read really exercises the
        // sync against the Engine list.
        config(['client-area.sync_ttl' => 0]);
        Http::fake([
            // The list is a sequence: empty while the project does not exist
            // yet, then the created project – matching the real Engine, whose
            // `listAll` has no filter and lists a project as soon as its create
            // account exists.
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::sequence()
                ->push(['data' => []])
                // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
                ->push(['data' => [
                    $this->engineProject(10, 'site1', [
                        'domain' => 'site1.panelalpha.online',
                        'details' => ['template' => 'dind', 'domain' => 'site1.panelalpha.online'],
                    ]),
                ]]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'site1',
                'details' => ['username' => 'site1', 'domain' => 'site1.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show
            'engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', [
                'domain' => 'site1.panelalpha.online',
                'details' => ['template' => 'dind', 'domain' => 'site1.panelalpha.online'],
            ])]),
            // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
        ]);

        $user = User::factory()->create();

        // 1. The CA's files-source domain step first reads the existing service
        // domains (OnboardingModalWrapper.vue:753-760 ensureFilesDeployDomain ->
        // listServiceDomains at :692-696), then POSTs the create. The Engine list
        // is still empty here, so the read consumes the first, empty response.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:694
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:701
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains?per_page=50&sort_by=id&sort_dir=desc')
            ->assertOk()
            ->assertExactJson(['data' => []]);

        // The CA's files-source create (OnboardingModalWrapper.vue:754).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $domain = $this->actingAs($user)
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => 'site1'])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'site1.panelalpha.online')
            ->json('data');

        $this->assertIsArray($domain);
        $id = (int) $domain['id'];

        // The Engine now lists the created project: the
        // next synced read keeps the just-mirrored row because the Engine list
        // contains it, not because the sync exempts the onboarding marker.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:694
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:701
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains?per_page=50&sort_by=id&sort_dir=desc')
            ->assertOk()
            ->assertJsonFragment(['id' => $id, 'domain' => 'site1.panelalpha.online']);

        // 2. The archive upload the CA makes next (OnboardingModalWrapper.vue:805-813).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:905
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:916
        $this->actingAs($user)
            ->call(
                'POST',
                "/api/instances/upload-files?service_id=".VirtualService::ID."&domain_id={$id}&filename=site.zip",
                [], [], [],
                ['CONTENT_TYPE' => 'application/zip'],
                'ZIP-BYTES',
            )
            ->assertOk()
            ->assertJsonPath('remote_filepath', 'project/.panelalpha-upload/site.zip');

        // 3. The deploy the CA starts after the upload (OnboardingModalWrapper.vue:924).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/instances/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $id,
                'shared_access' => [],
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                'env_vars' => [],
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $id);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $id
            && $job->taskId === 7
            && $job->sourceType === 'files'
            && $job->finishedType === 'user.instance.installation_finished');
    }

    public function test_deploy_validates_and_drops_shared_access(): void
    {
        // Community is single-user, so the CA's `shared_access` emails are
        // validated (strings) and dropped; nothing is shared.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/project/.panelalpha-upload/site.zip']),
            // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive
            'engine.example.com/api/projects/site1/deploy-archive' => Http::response(['data' => ['id' => 7]], 202),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                'shared_access' => ['someone@example.com'],
            ])
            ->assertOk();

        // Inspect the Engine request body: the URL-only check could never see
        // whether `shared_access` leaked into the deploy payload.
        Http::assertNotSent(function ($request) {
            foreach (array_keys($request->data()) as $key) {
                if (str_contains((string) $key, 'shared')) {
                    return true;
                }
            }

            return false;
        });

        // A non-string entry fails the old `shared_access.*` rule, so the whole
        // body is validated before anything is deployed.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                'shared_access' => [123],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('shared_access.0');

        // The refused deploy left the uploaded archive staged; v1's own
        // validation deletes it.
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');
    }

    public function test_a_v1_validation_refusal_deletes_the_staged_archive(): void
    {
        // More than 200 env vars is v1's own 422 (the Engine's
        // deploy-archive would accept it), so no watcher would ever clean up.
        $user = User::factory()->create();
        $application = $this->dindApplication($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        $envVars = [];
        for ($i = 0; $i <= 200; $i++) {
            $envVars['VAR_'.$i] = 'v';
        }

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'source_type' => 'files',
                'remote_filepath' => ['project/.panelalpha-upload/site.zip'],
                'env_vars' => $envVars,
            ])
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:932
            ->assertStatus(422)
            ->assertJsonValidationErrors('env_vars');

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/deploy-archive'));
    }

    /**
     * A live git DinD project: the Engine deploys every git repo into DinD
     *And its deploy is a redeploy, not an install.
     */
    private function liveGitDindApplication(User $user): Application
    {
        // Its last deploy succeeded (`details.deployment_status`; the
        // panel's redeploy row used to say so).
        $application = $this->syncedApplication($user, 'site1', [
            'details' => ['template' => 'dind', 'git_repo' => 'https://github.com/example/site.git', 'deployment_status' => 'success'],
        ]);

        return $application->refresh();
    }

    /**
     * Bind a repository that knows no projects, so an existing row is 404 for
     * the asking user (the Pro/Multi ownership shape).
     */
    private function hideProject(): void
    {
        $this->app->instance(ApplicationRepository::class, new class implements ApplicationRepository
        {
            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection();
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                throw (new ModelNotFoundException())->setModel(Application::class, [$id]);
            }

            public function domainsInUse(): array
            {
                return [];
            }
        });
    }
}
