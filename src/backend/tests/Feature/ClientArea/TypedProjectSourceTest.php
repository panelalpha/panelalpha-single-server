<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Jobs\Application\CopyProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchCopyJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineFeatures;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Tests\TestCase;

/**
 * The panel on an Engine 2.3.0:
 * the typed `POST /projects`, the copy as a create with a `project` source,
 * `PUT /projects/{u}/source` and the `source` block on a project read, each
 * only when `GET /system/info` lists `project_source`; an older Engine keeps
 * the flat calls.
 *
 * @see Engine core/app/Http/Controllers/SystemController.php:54 (`features`)
 * @see Engine core/app/Lib/Project/Create/CreateShape.php (the typed body)
 * @see Engine core/app/Http/Controllers/User/ProjectSourceController.php (PUT source)
 */
class TypedProjectSourceTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  list<string>  $features
     */
    private function fakeSystemInfo(array $features = [EngineFeatures::PROJECT_SOURCE]): void
    {
        // configureEngine() records an Engine 2.2.0; read this one's answer.
        Cache::flush();
        $this->rememberNoSelfProject();
        // Engine: core/app/Http/Controllers/SystemController.php:54 -> info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'version' => '2.3.0',
            'features' => $features,
        ]])]);
    }

    private function fakeCreate(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:201 -> storeAsync (202 + Task)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => [
            'id' => 55,
            'username' => 'shop',
            'status' => 'queued',
            'details' => ['domain' => 'shop.example.com', 'action' => 'deploy', 'source_type' => 'git'],
        ]], 202)]);
    }

    public function test_a_git_create_sends_the_typed_body(): void
    {
        $this->configureEngine();
        $this->fakeSystemInfo();
        $this->fakeCreate();

        $result = $this->app->make(ApplicationProvisioner::class)->provision(User::factory()->create(), new ProvisionRequest(
            domain: 'shop.example.com',
            username: 'shop',
            gitRepo: 'https://github.com/acme/shop',
            gitBranch: 'main',
            gitToken: 'ghp_x',
            template: 'dind',
            envVars: ['APP_ENV' => 'production'],
        ));

        $this->assertSame(55, $result->taskId);
        $this->assertSame('shop', $result->application->engine_username);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request->data() === [
                'name' => 'shop',
                'runtime' => 'container',
                'domain' => ['name' => 'shop.example.com'],
                'build' => ['env_vars' => ['APP_ENV' => 'production']],
                'source' => [
                    'type' => 'git',
                    'url' => 'https://github.com/acme/shop',
                    'branch' => 'main',
                    'auth' => ['type' => 'token', 'token' => 'ghp_x'],
                ],
            ]);
    }

    public function test_a_classic_create_names_its_runtime(): void
    {
        $this->configureEngine();
        $this->fakeSystemInfo();
        $this->fakeCreate();

        $this->app->make(ApplicationProvisioner::class)->provision(User::factory()->create(), new ProvisionRequest(domain: 'shop.example.com'));

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request->data() === ['runtime' => 'php_hosting', 'domain' => ['name' => 'shop.example.com']]);
    }

    public function test_an_engine_without_the_feature_gets_the_flat_body(): void
    {
        $this->configureEngine();
        $this->fakeSystemInfo([]);
        $this->fakeCreate();

        $this->app->make(ApplicationProvisioner::class)->provision(User::factory()->create(), new ProvisionRequest(
            domain: 'shop.example.com',
            gitRepo: 'https://github.com/acme/shop',
            template: 'dind',
        ));

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request->data() === ['domain' => 'shop.example.com', 'git_repo' => 'https://github.com/acme/shop', 'template' => 'dind']);
    }

    /**
     * An Engine without `features` (2.2.0) has none; the answer is cached, so
     * the next create does not read `system/info` again.
     */
    public function test_the_features_are_read_once_per_engine(): void
    {
        $this->configureEngine();
        Cache::flush();
        $this->rememberNoSelfProject();
        // Engine: core/app/Http/Controllers/SystemController.php:45 -> info (2.2.0: no `features`)
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => ['version' => '2.2.0']])]);
        $this->fakeCreate();

        $provisioner = $this->app->make(ApplicationProvisioner::class);
        $provisioner->provision(User::factory()->create(), new ProvisionRequest(domain: 'a.example.com'));
        $provisioner->provision(User::factory()->create(), new ProvisionRequest(domain: 'b.example.com'));

        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => ($request->data()['domain'] ?? null) === 'b.example.com');
    }

    /**
     * A typed refusal names `domain.name`, `name`, `source.url`… with the flat
     * body's codes (`CreateFields`); the panel gets the flat field names back,
     * so its error handling and the CA forms stay as they are.
     */
    public function test_a_typed_refusal_comes_back_with_the_flat_field_names(): void
    {
        $this->configureEngine();
        $this->fakeSystemInfo();
        // Engine: core/app/OpenApi/ApiDefinitions.php:72-97 (422 shape), CreateFields::rename
        Http::fake(['engine.example.com/api/projects' => Http::response([
            'message' => 'The domain is taken.',
            'errors' => [
                'domain.name' => ['The domain is taken.'],
                'name' => ['The name is taken.'],
                'source.branch' => ['The branch does not exist.'],
            ],
            'problems' => [
                ['field' => 'domain.name', 'code' => 'domain_taken', 'message' => 'The domain is taken.'],
                ['field' => 'name', 'code' => 'name_taken', 'message' => 'The name is taken.'],
                ['field' => 'source.branch', 'code' => 'git_branch_not_found', 'message' => 'The branch does not exist.'],
            ],
        ], 422)]);

        try {
            $this->app->make(ApplicationProvisioner::class)->provision(User::factory()->create(), new ProvisionRequest(
                domain: 'shop.example.com',
                username: 'shop',
                gitRepo: 'https://github.com/acme/shop',
                gitBranch: 'nope',
            ));
            $this->fail('The refusal was not thrown.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['domain', 'username', 'git_branch'], array_keys($e->errors));
            $this->assertSame(['domain', 'username', 'git_branch'], array_column($e->problems, 'field'));
            $this->assertSame(['domain_taken', 'name_taken', 'git_branch_not_found'], array_column($e->problems, 'code'));
        }

        $this->assertSame(0, Application::query()->count());
    }

    /**
     * The git attach after a domain step is `PUT /projects/{u}/source` on an
     * Engine 2.3.0, with the same answer (202 + Task).
     */
    public function test_attaching_a_git_source_uses_put_source(): void
    {
        $this->configureEngine();
        $this->fakeSystemInfo();
        // Engine: core/app/Http/Controllers/User/ProjectSourceController.php:56 -> update (202 + RebuildProject task)
        Http::fake(['engine.example.com/api/projects/shop/source' => Http::response(['data' => [
            'id' => 81,
            'status' => 'queued',
            'details' => ['action' => 'attach_source', 'source_type' => 'git'],
        ]], 202)]);

        $application = Application::query()->forceCreate(['engine_id' => 1, 'engine_username' => 'shop', 'domain' => 'shop.example.com', 'status' => 'active']);

        $taskId = (new ProjectsApi($application->engine()))->attachSource($application->engineProject(), [
            'git_repo' => 'https://github.com/acme/shop',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => ['APP_ENV' => 'production'],
        ]);

        $this->assertSame(81, $taskId);
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/api/projects/shop/source')
            && $request->data() === [
                'source' => ['type' => 'git', 'url' => 'https://github.com/acme/shop', 'branch' => 'main'],
                'build' => ['env_vars' => ['APP_ENV' => 'production']],
            ]);
        Http::assertNotSent(fn ($request) => $request->method() === 'POST' && str_ends_with($request->url(), '/source'));
    }

    private function copySource(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']]),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    /**
     * Run the 2.3.0 copy job with the Engine's 202 and return the pending row it
     * records for the copy. WatchCopyJob is faked: the row's later fate is each
     * test's own.
     */
    private function pendingCopy(Application $source): Application
    {
        $this->fakeSystemInfo();
        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCopier.php:50 -> queue (202 + CopyProject task)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => [
            'id' => 77,
            'username' => 'site1copy',
            'status' => 'queued',
            'job_type' => 'App\\Jobs\\CopyProject',
            'details' => ['domain' => 'site1copy.example.com', 'action' => 'copy', 'source_type' => 'project', 'from' => 'site1', 'copy_databases' => true],
        ]], 202)]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        return Application::query()->where('engine_username', 'site1copy')->firstOrFail();
    }

    /**
     * The copy is a create with a `project` source (202 + `CopyProject`
     * task), never the synchronous clone; the task is followed by WatchCopyJob.
     */
    public function test_the_copy_job_creates_the_copy_and_watches_its_task(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        $this->fakeSystemInfo();
        Queue::fake();
        // Engine: core/app/Lib/Project/ProjectCopier.php:50 -> queue (202 + CopyProject task)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => [
            'id' => 77,
            'username' => 'site1copy',
            'status' => 'queued',
            'job_type' => 'App\\Jobs\\CopyProject',
            'details' => ['action' => 'copy', 'source_type' => 'project', 'from' => 'site1', 'copy_databases' => true],
        ]], 202)]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request->data() === ['source' => ['type' => 'project', 'from' => 'site1', 'copy_databases' => true]]);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/clone'));
        Queue::assertPushed(WatchCopyJob::class, fn (WatchCopyJob $job) => $job->sourceId === $source->id
            && $job->copyUsername === 'site1copy'
            && $job->taskId === 77);
    }

    /**
     * The copy's Engine account exists from the 202 (`ProjectCopier::queue()`),
     * with the source's suspension status `active`, while the task still copies
     * files and databases. The local row is `pending` at once, so a CA read
     * cannot insert the copy as `active` and offer actions on it.
     */
    public function test_the_copy_job_records_a_pending_row_for_the_copy(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        $source->update(['type' => Application::TYPE_CUSTOM]);

        $copy = $this->pendingCopy($source);

        $this->assertSame('pending', $copy->status);
        $this->assertSame($source->engine_id, $copy->engine_id);
        $this->assertSame('site1copy.example.com', $copy->domain);
        $this->assertSame(Application::TYPE_CUSTOM, $copy->type);
        $this->assertNull($copy->service_id);
        $this->assertNotNull($copy->engine_created_at);
    }

    /**
     * `ApplicationSynchronizer::stillCreating()` keeps a panel-created row
     * `pending` while the Engine runs a task for it, even though the project's
     * own `status` is already the Engine's suspension state.
     */
    public function test_a_sync_keeps_the_copy_pending_while_its_copy_task_runs(): void
    {
        $user = User::factory()->create();
        // A direct row: copySource() registers its own `projects/all` stub,
        // and the first matching fake would answer this sync.
        $this->configureEngine();
        $source = Application::query()->forceCreate([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);
        $copy = $this->pendingCopy($source);

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
            $this->engineProject(11, 'site1copy', ['status' => 'active']),
        ]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (`status=active`)
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => [
            ['id' => 77, 'username' => 'site1copy', 'status' => 'running', 'action' => 'copy'],
        ], 'meta' => ['last_page' => 1, 'total' => 1]])]);

        app(ApplicationSynchronizer::class)->sync($source->engine_id);

        $copy->refresh();
        $this->assertSame('pending', $copy->status);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/tasks')
            && $request['status'] === 'active'
            && $request['scope'] === 'all');
    }

    /**
     * When the copy task completes, the mirror replaces the pending row with the
     * Engine's own project status (the suspension state) and notifies the CA
     * with the copy.
     */
    public function test_a_completed_copy_mirrors_the_engine_status_over_the_pending_row(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        $copy = $this->pendingCopy($source);
        $this->assertSame('pending', $copy->status);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'completed', 'details' => ['action' => 'copy']]])]);
        // Engine: core/app/Http/Resources/UserResource.php:60 (`source` on UserController::show)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['data' => $this->engineProject(11, 'site1copy', [
            'domain' => 'site1copy.example.com',
            'status' => 'suspended',
            'details' => ['template' => 'dind'],
        ])])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $copy->refresh();
        $this->assertSame('suspended', $copy->status);
        $this->assertSame(11, $copy->engine_project_id);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FINISHED_TYPE
            && $n->application->id === $copy->id);
    }

    /**
     * A failed copy is discarded by the Engine (`CopyProject::failed()`), so its
     * pending row goes too; the failure still names the source project.
     */
    public function test_a_failed_copy_removes_the_pending_row_and_notifies_the_source(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        $this->pendingCopy($source);

        Notification::fake();
        // Engine: core/app/Models/Task.php:282-292 (`details.error` on a failed task)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'failed', 'details' => [
            'error' => 'rsync failed in /home/site1copy/project',
        ]]])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1copy']);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FAILED_TYPE
            && $n->application->id === $source->id);
    }

    public function test_a_cancelled_copy_removes_the_pending_row_and_notifies_the_source(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        $this->pendingCopy($source);

        Notification::fake();
        // Engine: core/app/Models/Task.php:240 -> cancel (a terminal `cancelled` task)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'cancelled', 'details' => []]])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1copy']);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FAILED_TYPE
            && $n->application->id === $source->id
            && ($n->payload['message'] ?? null) === 'The copy was cancelled.');
    }

    public function test_a_finished_copy_is_mirrored_and_the_ca_notified(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'completed', 'details' => ['action' => 'copy']]])]);
        // Engine: core/app/Http/Resources/UserResource.php:60 (`source` on UserController::show)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['data' => $this->engineProject(11, 'site1copy', [
            'details' => ['template' => 'dind'],
            'source' => ['type' => 'project', 'from' => 'site1'],
        ])])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $copy = Application::query()->where('engine_username', 'site1copy')->firstOrFail();
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FINISHED_TYPE
            && $n->application->id === $copy->id);
    }

    public function test_a_running_copy_is_polled_again(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        Queue::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'running', 'details' => []]])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        Queue::assertPushed(WatchCopyJob::class, fn (WatchCopyJob $job) => $job->taskId === 77 && $job->hiccupAttempt === 0);
        $this->assertSame(0, Application::query()->where('engine_username', 'site1copy')->count());
    }

    /**
     * A task the Engine pruned (`TaskPruner::KEEP_OTHER`) is not a failed copy:
     * the copy is the truth. A 404 on the task with the copy still on the Engine
     * finishes it as a completed copy.
     */
    public function test_a_task_404_with_the_copy_on_the_engine_finishes_the_copy(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (pruned)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['message' => 'Task not found.'], 404)]);
        // Engine: core/app/Http/Resources/UserResource.php:60 (`source` on UserController::show)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['data' => $this->engineProject(11, 'site1copy', [
            'details' => ['template' => 'dind'],
        ])])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $copy = Application::query()->where('engine_username', 'site1copy')->firstOrFail();
        $this->assertSame('active', $copy->status);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FINISHED_TYPE
            && $n->application->id === $copy->id);
    }

    public function test_a_task_404_without_the_copy_reports_the_failure(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (pruned)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['message' => 'Task not found.'], 404)]);
        // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (missing project)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['message' => 'Not found.'], 404)]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        $this->assertSame(0, Application::query()->where('engine_username', 'site1copy')->count());
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FAILED_TYPE
            && $n->application->id === $source->id);
    }

    public function test_a_task_422_reports_the_failure(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (TaskLogPageRequest)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['message' => 'Invalid task.'], 422)]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FAILED_TYPE
            && $n->application->id === $source->id);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/api/projects/site1copy'));
    }

    /**
     * A failed copy is discarded by the Engine (`CopyProject::failed()`); the CA
     * gets the failure on the original with the task's error, whose home
     * paths are not shown.
     */
    public function test_a_failed_copy_notifies_the_failure_on_the_original(): void
    {
        $user = User::factory()->create();
        $source = $this->copySource($user);
        Notification::fake();
        // Engine: core/app/Models/Task.php:282-292 (`details.error` on a failed task)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'failed', 'details' => [
            'error' => 'rsync failed in /home/site1copy/project',
        ]]])]);

        (new WatchCopyJob($source->id, 'site1copy', 77, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === CopyProjectJob::FAILED_TYPE
            && $n->application->id === $source->id
            && $n->isError === true
            && ! str_contains((string) ($n->payload['message'] ?? ''), '/home/'));
        $this->assertSame(0, Application::query()->where('engine_username', 'site1copy')->count());
    }

    /**
     * The Engine's `source` answers where a project deploys from when the
     * flat `details` do not (a git/connect checkout, an archive project).
     */
    public function test_the_engine_source_is_read_beside_the_details(): void
    {
        $checkout = (new Application)->forceFill(['engine_payload' => ['details' => ['template' => 'dind'], 'source' => [
            'type' => 'git', 'url' => 'git@github.com:acme/shop.git', 'branch' => 'main', 'auth' => 'deploy_key', 'rebuild' => 'checkout',
        ]]]);
        $this->assertSame('git@github.com:acme/shop.git', $checkout->gitRepositoryUrl());
        $this->assertSame('main', $checkout->gitBranch());

        $archive = (new Application)->forceFill(['engine_payload' => ['details' => [], 'source' => ['type' => 'archive', 'upload_id' => 'upl_01']]]);
        $this->assertTrue($archive->isContainer());
        $this->assertNull($archive->gitRepositoryUrl());

        // The flat details still win, and an older Engine has no `source`.
        $cloned = (new Application)->forceFill(['engine_payload' => ['details' => ['git_repo' => 'https://github.com/acme/shop', 'git_branch' => 'dev'], 'source' => [
            'type' => 'git', 'url' => 'https://github.com/acme/other', 'branch' => 'main',
        ]]]);
        $this->assertSame('https://github.com/acme/shop', $cloned->gitRepositoryUrl());
        $this->assertSame('dev', $cloned->gitBranch());

        $classic = (new Application)->forceFill(['engine_payload' => ['details' => []]]);
        $this->assertFalse($classic->isContainer());
        $this->assertNull($classic->gitRepositoryUrl());
    }
}
