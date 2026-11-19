<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Http\Controllers\Project\AppHealthController;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;
use PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Redeploy, retry-install, upload and deploy-cancel for custom
 * projects. The deploy-log history, live view and download moved to
 * {@see DeployHistoryTest} with the routes.
 * @see packages/client-area/src/apis/Instances.js:24-42, components/deploy/DeployLogsViewer.vue
 * @see Engine core/routes/api.php:114-117 (tasks), 354 (deploy-log)
 */
class DeployLogTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * Sync one project; $details lands in the mirror so the source type can be
     * inferred (git_repo => git project, else files).
     *
     * @param  array<string, mixed>  $details
     */
    private function application(User $user, array $details = ['template' => 'dind'], array $project = []): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', array_merge($project, ['details' => $details])),
        ]])]);

        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // The deploy guard reads the Engine's newest deploy:
        // nothing runs, unless a test faked its own answer first (the first
        // matching fake answers).
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        Http::fake(['engine.example.com/api/projects/*/deploys' => Http::response(['data' => []])]);

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    public function test_git_redeploy_pulls_and_dispatches_the_watcher(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);

        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['status' => 'running']], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main'])
            ->assertStatus(202)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonStructure(['deploy_log_id', 'target_id']);

        // The redeploy is followed with the redeploy notifications; the panel
        // writes no deploy row (the history is the Engine's).
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/git/pull'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->finishedType === 'user.instance.redeploy_finished'
            && $job->failedType === 'user.instance.redeploy_failed'
            && $job->sourceType === 'git'
            && $job->archivePath === null);
    }

    public function test_an_accepted_redeploy_forgets_the_cached_source_and_health_of_the_target(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        Cache::put(ProjectSourceReport::cacheKey($application->id), ['available' => true], 60);
        Cache::put(AppHealthController::cacheKey($application->id), ['available' => true], 60);
        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['status' => 'running']], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main'])
            ->assertStatus(202);

        $this->assertFalse(Cache::has(ProjectSourceReport::cacheKey($application->id)));
        $this->assertFalse(Cache::has(AppHealthController::cacheKey($application->id)));
    }

    public function test_a_refused_redeploy_keeps_the_cached_source(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        Cache::put(ProjectSourceReport::cacheKey($application->id), ['available' => true], 60);
        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['message' => 'boom'], 500)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main'])
            ->assertStatus(502);

        $this->assertTrue(Cache::has(ProjectSourceReport::cacheKey($application->id)));
    }

    public function test_git_redeploy_switches_branch_when_it_differs(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);

        // Engine: core/app/Http/Controllers/User/GitController.php:256 -> GitController::changeBranch
        Http::fake(['engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['status' => 'queued']], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'develop'])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1/git/change-branch')
            && $request['branch'] === 'develop');
    }

    public function test_files_redeploy_rebuilds_with_the_archive_path(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
        Http::fake(['engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['status' => 'queued']], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'overwrite',
            ])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/rebuild')
            && $request['zip_path'] === 'project/.panelalpha-upload/site.zip');

        // The watcher deletes the archive it is told about: the redeploy must
        // hand it the same home-relative path.
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->archivePath === 'project/.panelalpha-upload/site.zip');
    }

    public function test_files_redeploy_refuses_a_file_that_is_not_an_archive(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/dump.sql',
                'mode' => 'overwrite',
            ])
            ->assertStatus(422)
        // CA reads: src/components/modal/FilesUploadVersionModal.vue:518
            ->assertJsonValidationErrors(['remote_filepath' => 'Only .zip and .tar.gz archives are supported.']);

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_files_redeploy_deploy_staging_targets_the_staging(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $live = $this->application($user);

        $staging = Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1stg',
            'domain' => 'stg.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $live->id,
            'engine_payload' => $this->engineProject(11, 'site1stg', ['details' => ['template' => 'dind']]),
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
        Http::fake(['engine.example.com/api/projects/site1stg/rebuild' => Http::response(['data' => ['id' => 7]], 202)]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:522 (`deploy_staging: deployStaging`)
        // CA reads: src/components/modal/FilesUploadVersionModal.vue:523-524 (`target_id`, `deploy_log_id`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$live->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'deploy_staging' => true,
            ])
            ->assertStatus(202)
            ->assertJsonPath('target_id', $staging->id);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $staging->id && $job->taskId === 7);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1stg/rebuild'));
    }

    public function test_files_redeploy_deploy_staging_targets_the_newest_staging(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $live = $this->application($user);

        // The old RedeployStoreRequest picked the highest-id staging
        // (`sortByDesc('id')->first()`, RedeployStoreRequest.php:68).
        Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1old',
            'domain' => 'old.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $live->id,
            'engine_payload' => $this->engineProject(9, 'site1old', ['details' => ['template' => 'dind']]),
        ]);
        $newest = Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1new',
            'domain' => 'new.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $live->id,
            'engine_payload' => $this->engineProject(11, 'site1new', ['details' => ['template' => 'dind']]),
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
        Http::fake(['engine.example.com/api/projects/site1new/rebuild' => Http::response(['data' => ['id' => 7]], 202)]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:522 (`deploy_staging: deployStaging`)
        // CA reads: src/components/modal/FilesUploadVersionModal.vue:523-524 (`target_id`, `deploy_log_id`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$live->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'deploy_staging' => true,
            ])
            ->assertStatus(202)
            ->assertJsonPath('target_id', $newest->id);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1new/rebuild'));
    }

    public function test_a_second_redeploy_while_one_runs_is_409(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // The Engine runs a deploy of the project – started by the panel, MCP or
        // `pae` alike.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'trigger' => 'mcp'])]);
        $application = $this->application($user);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'overwrite',
            ])
            ->assertStatus(409);

        Queue::assertNotPushed(WatchDeployJob::class);
        Http::assertNotSent(static fn ($request): bool => str_ends_with($request->url(), '/rebuild'));
    }

    /**
     * ASSUMED Engine contract (engine-handoff.md items 1-2): inspect announces
     * `application.skippable` with Engine step names.
     *
     * @param  list<string>  $announced
     */
    private function fakeInspectSkippable(array $announced): void
    {
        // Engine: core/app/Http/Controllers/SourceInspectionController.php:190 -> project (`application.*`)
        Http::fake(['engine.example.com/api/projects/site1/inspect*' => Http::response(['data' => [
            'application' => [
                'commands' => ['install' => 'npm ci', 'build' => 'npm run build'],
                'stages' => ['upgrade' => [['id' => 'migrate', 'run' => 'php artisan migrate', 'optional' => false]]],
                'skippable' => $announced,
            ],
        ]])]);
    }

    public function test_git_pull_passes_the_mapped_skip_list(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        $this->fakeInspectSkippable(['dependencies', 'assets', 'upgrade']);
        // Engine: core/app/Http/Controllers/User/GitController.php:496 -> queuedOrDone (202 + TaskResource, `data.id`)
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['id' => 3]], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:710-714 (POST /instances/{id}/redeploy: `branch`, `skip`)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main', 'skip' => ['migrations', 'build']])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1/git/pull')
            && $request['skip'] === ['assets', 'upgrade']);
    }

    public function test_git_change_branch_passes_the_skip_list(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        $this->fakeInspectSkippable(['dependencies', 'assets', 'upgrade']);
        // Engine: core/app/Http/Controllers/User/GitController.php:252 -> GitController::changeBranch (202 + Task)
        Http::fake(['engine.example.com/api/projects/site1/git/change-branch' => Http::response(['data' => ['id' => 3]], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:710-714 (POST /instances/{id}/redeploy: `branch`, `skip`)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'develop', 'skip' => ['dependencies']])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1/git/change-branch')
            && $request['skip'] === ['dependencies']);
    }

    public function test_files_redeploy_passes_the_skip_list_to_rebuild(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeInspectSkippable(['upgrade']);
        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild (202 + Task)
        Http::fake(['engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 3]], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:530-534 (POST /instances/{id}/redeploy: `remote_filepath`, `skip`)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'skip' => ['migrations'],
            ])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1/rebuild')
            && $request['zip_path'] === 'project/.panelalpha-upload/site.zip'
            && $request['skip'] === ['upgrade']);
    }

    public function test_a_redeploy_without_skip_sends_no_skip_field(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        // Engine: core/app/Http/Controllers/User/GitController.php:496 -> queuedOrDone (202 + TaskResource, `data.id`)
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['id' => 3]], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:710-714 (POST /instances/{id}/redeploy: `branch`, `skip`)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main', 'skip' => []])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1/git/pull')
            && ! array_key_exists('skip', $request->data()));
    }

    public function test_skip_is_422_when_the_engine_does_not_announce_the_category(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        // Today's Engine: inspect announces nothing.
        $this->fakeInspectSkippable([]);

        $this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:710-714 (POST /instances/{id}/redeploy: `branch`, `skip`)
        // CA reads: src/apis/Api.js:99-101 (`error.response.data.error_code`)
        // CA reads: src/components/modal/GitRedeployModal.vue:710-714 (the 422 `errors.skip` shown as the alert message)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main', 'skip' => ['migrations']])
            ->assertStatus(422)
            ->assertJsonPath('error_code', 'deploy_skip_unsupported')
            ->assertJsonValidationErrors('skip');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/git/pull'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_an_unknown_skip_category_is_422(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);

        $this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:710-714 (POST /instances/{id}/redeploy: `branch`, `skip`)
        // CA reads: src/components/modal/GitRedeployModal.vue:710-714 (the 422 `errors.skip` shown as the alert message)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main', 'skip' => ['assets']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('skip.0');
    }

    public function test_files_redeploy_rejects_a_path_outside_home(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => '../../etc/passwd',
                'mode' => 'overwrite',
            ])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonValidationErrors('remote_filepath');
    }

    public function test_upload_stages_the_archive_and_returns_its_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:149 -> FileController::mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:665 -> FileController::upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:500
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'PK-zip-bytes')
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJson(['remote_filepath' => 'project/.panelalpha-upload/site.zip']);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1/files/upload'));
    }

    public function test_upload_is_422_for_a_classic_project(): void
    {
        $user = User::factory()->create();
        // Not a dind template and no git repo: a classic PHP project. The
        // Engine's archive deploy is Dind-only, so there is no directory it
        // reads an archive from.
        $application = $this->application($user, ['template' => '']);

        // CA: src/components/modal/FilesUploadVersionModal.vue:500
        $this->actingAs($user)
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'PK-zip-bytes')
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
            ->assertJsonValidationErrors('filename');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    public function test_upload_is_422_for_a_project_with_no_readable_directory(): void
    {
        $user = User::factory()->create();
        // A classic project (with or without a domain) has no application
        // directory the Engine's archive deploy can read.
        $application = $this->application($user, ['template' => ''], ['domain' => null]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:500
        $this->actingAs($user)
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'PK-zip-bytes')
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
            ->assertJsonValidationErrors('filename');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/upload'));
    }

    public function test_classic_files_redeploy_is_422(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user, ['template' => '']);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'overwrite',
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
            ->assertJsonValidationErrors('deploy');

        // No Engine deploy call and no deploy watcher for the refused classic
        // project (the sync's type-detection job is unrelated).
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/rebuild')
            || str_contains($request->url(), '/git/'));
        Queue::assertNotPushed(WatchDeployJob::class);
        Queue::assertNotPushed(WatchApplicationTaskJob::class);
    }

    public function test_classic_git_redeploy_is_422(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // A classic project (no Engine git_repo/dind template) with only a panel
        // `site_git` binding: the Engine's git porcelain is Dind-only.
        $application = $this->application($user, ['template' => '']);
        $application->forceFill(['git_source' => 'https://github.com/acme/site.git'])->save();

        // CA: src/components/modal/GitRedeployModal.vue:401
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
            ->assertJsonValidationErrors('deploy');

        // No Engine deploy call and no deploy watcher for the refused classic
        // project (the sync's type-detection job is unrelated).
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/rebuild')
            || str_contains($request->url(), '/git/'));
        Queue::assertNotPushed(WatchDeployJob::class);
        Queue::assertNotPushed(WatchApplicationTaskJob::class);
    }

    public function test_a_refused_files_redeploy_deletes_the_staged_archive(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
            'engine.example.com/api/projects/site1/rebuild' => Http::response([
                'message' => 'Archive not found: /home/site1/project/.panelalpha-upload/site.zip',
                'errors' => ['zip_path' => ['Archive not found: /home/site1/project/.panelalpha-upload/site.zip']],
            ], 422),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $response = $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'overwrite',
            ])
            ->assertStatus(422);

        $this->assertStringNotContainsString('/home/', (string) $response->json('errors.zip_path.0'));

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');

        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_a_v1_validation_refusal_deletes_the_staged_archive(): void
    {
        // An invalid `mode` is v1's own 422 (no Engine call),
        // so the uploaded archive must not stay in the Engine's staging folder.
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'not-a-mode',
            ])
            // CA reads: src/components/modal/FilesUploadVersionModal.vue:518
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_a_v1_validation_refusal_never_deletes_a_path_outside_the_staging_folder(): void
    {
        // The cleanup stays inside the project's own staging
        // folder; a foreign `remote_filepath` never becomes a files/remove.
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'public_html/index.php',
                'mode' => 'not-a-mode',
            ])
            // CA reads: src/components/modal/FilesUploadVersionModal.vue:518
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/remove'));
    }

    public function test_a_5xx_files_redeploy_keeps_the_staged_archive(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['message' => 'boom'], 500),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'removed']),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
                'mode' => 'overwrite',
            ])
            ->assertStatus(502);

        // A 5xx is not proof that no task started, so the archive is left for
        // the watcher.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/remove'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_upload_rejects_an_unsupported_archive_type(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:500
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.exe", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'nope')
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:73 (errors group loop)
            ->assertJsonValidationErrors('filename');
    }

    public function test_upload_bubbles_a_connection_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:149 -> FileController::mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:665 -> FileController::upload
            'engine.example.com/api/projects/site1/files/upload' => Http::failedConnection(),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:500
        $this->actingAs($user)
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'PK-zip-bytes')
            ->assertStatus(503);
    }

    public function test_upload_bubbles_an_engine_500(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:149 -> FileController::mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's 5xx body)
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:500
        $this->actingAs($user)
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'PK-zip-bytes')
            ->assertStatus(502);
    }

    public function test_cancel_deploy_passes_through(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DeployLogController.php:140 -> DeployLogController::cancel
        Http::fake(['engine.example.com/api/projects/site1/deploy-cancel' => Http::response(['data' => ['cancelled' => true]])]);

        $this->actingAs($user)
        // CA: src/apis/Instances.js:39
            ->postJson("/api/projects/{$application->id}/deploy-cancel")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.cancelled', true);
    }

    public function test_cancel_deploy_engine_409_bubbles(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DeployLogController.php:140 -> DeployLogController::cancel
        Http::fake(['engine.example.com/api/projects/site1/deploy-cancel' => Http::response(['message' => 'No running deploy to cancel'], 409)]);

        $this->actingAs($user)
        // CA: src/apis/Instances.js:39
            ->postJson("/api/projects/{$application->id}/deploy-cancel")
            ->assertStatus(409);
    }

    public function test_retry_install_requires_a_failed_last_deploy(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // A git project: an archive project's retry is refused (see below).
        $application = $this->application($user, ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site']);

        // Nothing to retry yet: no recorded deploy outcome on an older project.
        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertStatus(422)
            // Old custom_validation.cannot_retry_installation text, key 0.
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        // The next sync brings the Engine's failed outcome:
        // `details.deployment_status` from FailureRetention.php:31-39.
        $application->forceFill(['engine_payload' => array_merge($application->engine_payload ?? [], [
            'details' => ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed', 'error' => 'npm ERR! missing script: build'],
        ])])->save();
        // The newest deploy is the failed install, nothing is retrying it.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'failed', 'kind' => 'install'])]);
        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['status' => 'queued']], 202)]);

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.id', $application->id)
        // CA reads: src/components/onboarding/OnboardingModalWrapper.vue:1656 (the item the CA shows follows the new install)
            ->assertJsonPath('data.async_status.installation', 'in_progress');

        // The retry is followed with the installation notifications the CA
        // waits for (no panel row).
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_retry_install_refuses_a_project_with_a_finished_deploy(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // The Engine's outcome of a clean deploy (Models/User.php:1346-1358).
        $application = $this->application($user, ['template' => 'dind', 'deployment_status' => 'success']);
        Http::fake();

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        Queue::assertNotPushed(WatchDeployJob::class);
        // Only the deploy guard's read reaches the Engine.
        Http::assertNotSent(static fn ($request): bool => ! str_ends_with($request->url(), '/projects/site1/deploys'));
    }

    public function test_retry_install_allows_a_cancelled_deploy(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // A cancelled install keeps the project as a failed one
        // (FailureRetention::retainAfterDeployCancelled, FailureRetention.php:41-51).
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'cancelled', 'kind' => 'install'])]);
        // A git project, for the same reason as above.
        $application = $this->application($user, ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['status' => 'queued']], 202)]);

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.id', $application->id);

        Queue::assertPushed(WatchDeployJob::class);
    }

    public function test_retry_install_of_a_files_project_asks_for_the_archive_instead_of_rebuilding(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // An unreadable archive left only the placeholder, and the archive is gone.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy([
            'status' => 'failed',
            'kind' => 'install',
            'source' => 'archive',
            'action' => 'deploy_archive',
            'error' => 'Could not read site.zip: End-of-central-directory signature not found.',
        ])]);
        $application = $this->application($user, ['template' => 'dind', 'deployment_status' => 'failed']);
        Http::fake();

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'This project deploys from an uploaded archive, and that archive is deleted when its deploy ends. Upload the archive again to retry.');

        Http::assertNotSent(static fn ($request): bool => str_ends_with($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
        $this->assertSame('failed', app(DeployState::class)->installation($application->refresh()));
    }

    public function test_retry_install_of_a_git_project_without_a_checkout_deploys_from_the_repository(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // A first deploy that failed before a checkout existed.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'failed', 'kind' => 'install'])]);
        $application = $this->application($user, ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        Http::fake([
            // Engine: core/app/Lib/Git/GitActions.php:250 -> the 422 under `git`
            'engine.example.com/api/projects/site1/git/pull' => Http::response([
                'message' => 'No git repository at path',
                'errors' => ['git' => ['No git repository at path']],
            ], 422),
            // Engine: core/app/Lib/Project/ProjectRebuild.php:338 -> ATTACH_SOURCE / REBUILD
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 45]], 202),
        ]);

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.id', $application->id);

        Http::assertSent(static fn ($request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/projects/site1/rebuild'));
        Queue::assertPushed(WatchDeployJob::class);
    }

    public function test_retry_install_refuses_while_a_retry_runs(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // A retry (a rebuild) is already running on the Engine.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'action' => 'rebuild'])]);
        $application = $this->application($user, ['template' => 'dind', 'deployment_status' => 'failed']);
        Http::fake();

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            // The deploy guard answers first: the old 409 while a deploy runs
            // (read from the Engine, as the panel row did).
            ->assertStatus(409);

        Http::assertNotSent(static fn ($request): bool => str_ends_with($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_retry_install_refuses_when_only_a_redeploy_failed(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        // The install succeeded, then a redeploy failed: the Engine keeps
        // `deployed_before` (FailureRetention.php:31-39), so the installation
        // stays finished and the old `async_status.installation = failed` guard
        // refuses.
        $application = $this->application($user, ['template' => 'dind', 'deployment_status' => 'failed', 'deployed_before' => true]);
        Http::fake();

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        Queue::assertNotPushed(WatchDeployJob::class);
        // Only the deploy guard's read reaches the Engine.
        Http::assertNotSent(static fn ($request): bool => ! str_ends_with($request->url(), '/projects/site1/deploys'));
    }

    public function test_retry_install_is_422_for_a_classic_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, ['template' => '']);

        $this->actingAs($user)
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:1654
            ->putJson("/api/projects/{$application->id}/retry-install")
            ->assertStatus(422);
    }

    public function test_a_failed_engine_accept_follows_nothing_and_allows_a_retry(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine refuses the deploy (422/503): nothing must be persisted.
        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild
        Http::fakeSequence('engine.example.com/api/projects/site1/rebuild')
            ->push(['message' => 'nope'], 422)
            ->push(['data' => ['id' => 7]], 202);

        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
            ])
            ->assertStatus(422);

        Queue::assertNotPushed(WatchDeployJob::class);

        // A second attempt is not blocked by a stuck `running` row.
        $this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
            ->postJson("/api/projects/{$application->id}/redeploy", [
                'remote_filepath' => 'project/.panelalpha-upload/site.zip',
            ])
            ->assertStatus(202);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id && $job->taskId === 7);
    }

    public function test_unknown_project_is_404(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        $this->actingAs(User::factory()->create())
        // CA: src/apis/Instances.js:24
            ->getJson('/api/projects/999/deploy-logs')
            ->assertNotFound();
    }

    public function test_redeploy_requires_authentication(): void
    {
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->postJson('/api/projects/1/redeploy', ['branch' => 'main'])->assertUnauthorized();
    }

    public function test_deploy_logs_require_authentication(): void
    {
        // CA: src/apis/Instances.js:24
        $this->getJson('/api/projects/1/deploy-logs')->assertUnauthorized();
    }
}
