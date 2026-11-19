<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob;
use PanelAlpha\ClientArea\Jobs\WordPress\StartWordPressImportJob;
use PanelAlpha\ClientArea\Jobs\WordPress\WatchWordPressImportJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use RuntimeException;
use Tests\TestCase;

/**
 * The failure paths of the WordPress import jobs (start and watch) and of the
 * job that points WordPress at a renamed database: the project or the import
 * record is gone, the project's create task never ends, the Engine answers
 * without an import id or refuses a read, and a long import runs past its cap.
 *
 * Contract: a failed import is marked `failed` with a reason and the CA gets
 * `installation_failed`; a finished import stays finished when the project
 * listing after it fails.
 */
class WordPressImportJobsFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    private const SITE = 'https://www.blog.example.org';

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Sleep::fake(syncWithCarbon: true);
        Event::fake([ClientAreaNotificationRequested::class, ImportStatusChanged::class]);
    }

    /**
     * @param  array<string, mixed>  $import
     * @param  array<string, mixed>  $application
     */
    private function importing(array $import = [], array $application = []): Application
    {
        $row = $this->bareApplication($application);
        WordPressImport::query()->create($import + [
            'application_id' => $row->id,
            'engine_migration_id' => 7,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'source_url' => self::SITE,
            'status' => 'running',
            'engine_status' => ['id' => 7, 'status' => 'running'],
        ]);

        return $row;
    }

    private function starting(): Application
    {
        return $this->importing([
            'engine_migration_id' => null,
            'status' => WordPressImport::STARTING,
            'engine_status' => null,
            'source' => ['url' => self::SITE, 'method' => 'wp_admin', 'username' => 'admin', 'password' => 'Secret-pass-1'],
        ]);
    }

    private function importOf(Application $application): WordPressImport
    {
        return WordPressImport::query()->where('application_id', $application->id)->firstOrFail();
    }

    private function watch(Application $application, int $startedAt = 0): void
    {
        Queue::fake();
        (new WatchWordPressImportJob($application->id, $startedAt > 0 ? $startedAt : now()->getTimestamp()))
            ->handle(app(ApplicationSynchronizer::class));
    }

    // StartWordPressImportJob

    public function test_the_start_job_ignores_a_project_without_an_import_to_start(): void
    {
        $application = $this->bareApplication();
        Http::fake();

        (new StartWordPressImportJob($application->id))->handle();
        (new StartWordPressImportJob($application->id + 100))->handle();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_start_job_ignores_an_import_that_is_already_running(): void
    {
        $application = $this->importing();
        Http::fake();

        (new StartWordPressImportJob($application->id))->handle();

        Http::assertNothingSent();
        $this->assertSame('running', $this->importOf($application)->status);
    }

    public function test_a_project_still_being_created_fails_the_start_and_keeps_the_source(): void
    {
        $application = $this->starting();
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (the project's create task never ends)
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => [['id' => 41, 'status' => 'running']], 'meta' => ['last_page' => 1, 'total' => 1]])]);

        Queue::fake();
        (new StartWordPressImportJob($application->id))->handle();

        $import = $this->importOf($application);
        $this->assertSame(WordPressImport::FAILED, $import->status);
        $this->assertSame(StartWordPressImportJob::STILL_CREATING, $import->error);
        $this->assertNotNull($import->source, 'the source stays for a quick retry');
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, StartWordPressImportJob::STILL_CREATING);
        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'POST');
        Queue::assertNothingPushed();
    }

    public function test_an_unreachable_engine_while_waiting_for_the_project_is_waited_out(): void
    {
        $application = $this->starting();
        $calls = 0;
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (first the Engine is down, then no task runs)
            'engine.example.com/api/tasks*' => function () use (&$calls) {
                if ($calls++ === 0) {
                    throw new ConnectionException('Engine down');
                }

                // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (no task runs any more)
                return Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]);
            },
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:125 -> store (202)
            'engine.example.com/api/wordpress/migrations' => Http::response(['id' => 7, 'status' => 'pending'], 202),
        ]);

        Queue::fake();
        (new StartWordPressImportJob($application->id))->handle();

        $this->assertSame(2, $calls);
        $this->assertSame(7, $this->importOf($application)->engine_migration_id);
        Queue::assertPushed(WatchWordPressImportJob::class);
    }

    public function test_an_engine_answer_without_an_import_id_fails_the_start(): void
    {
        $application = $this->starting();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (no task runs)
            'engine.example.com/api/tasks*' => Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]),
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:125 -> store (an answer without `id`)
            'engine.example.com/api/wordpress/migrations' => Http::response(['status' => 'pending'], 202),
        ]);

        Queue::fake();
        (new StartWordPressImportJob($application->id))->handle();

        $import = $this->importOf($application);
        $this->assertSame(WordPressImport::FAILED, $import->status);
        $this->assertSame('The Engine did not return the import.', $import->error);
        $this->assertNotNull($import->source);
        Queue::assertNothingPushed();
    }

    public function test_the_start_failed_hook_fails_a_starting_import(): void
    {
        $application = $this->starting();

        (new StartWordPressImportJob($application->id))->failed();

        $this->assertSame('The import could not be started.', $this->importOf($application)->error);
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, 'The import could not be started.');
    }

    public function test_the_start_failed_hook_tells_the_engine_reason(): void
    {
        $application = $this->starting();

        (new StartWordPressImportJob($application->id))->failed(new RuntimeException('The worker was killed.'));

        $this->assertSame(WordPressImport::FAILED, $this->importOf($application)->status);
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, 'The worker was killed.');
    }

    public function test_the_start_failed_hook_leaves_a_running_import_alone(): void
    {
        $application = $this->importing();

        (new StartWordPressImportJob($application->id))->failed();

        $this->assertSame('running', $this->importOf($application)->status);
        $this->assertNotNotified();
    }

    // WatchWordPressImportJob

    public function test_the_watcher_ignores_a_project_without_a_started_import(): void
    {
        $plain = $this->bareApplication();
        $unstarted = $this->importing(['engine_migration_id' => null, 'status' => WordPressImport::STARTING, 'engine_status' => null], ['engine_username' => 'site2']);
        Http::fake();

        $this->watch($plain);
        $this->watch($unstarted);

        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_an_engine_that_is_not_configured_ends_the_import_as_failed(): void
    {
        $application = $this->importing(application: ['engine_id' => 99]);
        Http::fake();

        $this->watch($application);

        $this->assertSame(WordPressImport::FAILED, $this->importOf($application)->status);
        $this->assertNotNull($this->importOf($application)->error);
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true);
        Queue::assertNothingPushed();
    }

    public function test_the_watch_failed_hook_ends_the_spinner_and_ignores_a_deleted_project(): void
    {
        $application = $this->importing();
        $deleted = $this->importing(application: ['engine_username' => 'site2']);
        $deletedId = $deleted->id;
        $deleted->delete();

        (new WatchWordPressImportJob($deletedId))->failed();
        $this->assertNotNotified();

        (new WatchWordPressImportJob($application->id))->failed();
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, 'The import watcher stopped.');
    }

    public function test_a_failing_project_listing_does_not_stop_the_finished_notification(): void
    {
        $application = $this->importing();
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (the import completed)
            'engine.example.com/api/wordpress/migrations/7' => Http::response(['id' => 7, 'status' => 'completed', 'notices' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the refresh after the import fails)
            'engine.example.com/api/projects/all*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application);

        $this->assertSame(WordPressImport::COMPLETED, $this->importOf($application)->status);
        $this->assertNotified(InstallWordPressJob::FINISHED_TYPE, false);
    }

    public function test_an_import_running_past_the_cap_ends_as_failed(): void
    {
        $application = $this->importing();
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (still running)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response(['id' => 7, 'status' => 'running', 'stale' => false])]);

        $this->watch($application, now()->getTimestamp() - WatchWordPressImportJob::WALL_CLOCK_SECONDS);

        $this->assertSame(WordPressImport::FAILED, $this->importOf($application)->status);
        $this->assertSame(WatchWordPressImportJob::TOO_LONG, $this->importOf($application)->error);
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, WatchWordPressImportJob::TOO_LONG);
        Queue::assertNothingPushed();
    }

    // PointWordPressAtRenamedDatabaseJob

    private function point(Application $application, int $startedAt = 0): void
    {
        Queue::fake();
        (new PointWordPressAtRenamedDatabaseJob($application->id, 21, 'site1_new', $startedAt > 0 ? $startedAt : now()->getTimestamp()))
            ->handle(app(EngineResolver::class));
    }

    private function assertPointQueuedAfterFiveSeconds(): void
    {
        Queue::assertPushed(PointWordPressAtRenamedDatabaseJob::class, fn (PointWordPressAtRenamedDatabaseJob $job): bool => $job->delay === PointWordPressAtRenamedDatabaseJob::POLL_SECONDS
            && $job->startedAt === now()->getTimestamp());
    }

    public function test_the_rename_watcher_of_a_deleted_project_ends_quietly(): void
    {
        $application = $this->bareApplication();
        $application->delete();
        Http::fake();

        $this->point($application);

        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_an_unreachable_engine_polls_the_rename_task_again(): void
    {
        $application = $this->bareApplication();
        Http::fake(['engine.example.com/api/tasks/21*' => Http::failedConnection()]);

        $this->point($application);

        $this->assertPointQueuedAfterFiveSeconds();
    }

    public function test_a_rename_task_5xx_polls_again(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the Engine errors)
        Http::fake(['engine.example.com/api/tasks/21*' => Http::response(['message' => 'boom'], 500)]);

        $this->point($application);

        $this->assertPointQueuedAfterFiveSeconds();
    }

    public function test_a_rename_task_refusal_is_reported_and_not_polled_again(): void
    {
        Exceptions::fake();
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/21*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        $this->point($application);

        Exceptions::assertReported(EngineRequestException::class);
        Queue::assertNothingPushed();
    }

    public function test_a_failed_rename_task_leaves_db_name_alone_and_stops(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the rename failed)
        Http::fake(['engine.example.com/api/tasks/21*' => Http::response(['data' => ['id' => 21, 'status' => 'failed', 'details' => ['error' => 'The rename failed.']]])]);

        $this->point($application);

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/wp/config'));
        Queue::assertNothingPushed();
    }

    public function test_a_rename_task_running_past_the_cap_is_reported_and_stops(): void
    {
        Exceptions::fake();
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (still running)
        Http::fake(['engine.example.com/api/tasks/21*' => Http::response(['data' => ['id' => 21, 'status' => 'running']])]);

        $this->point($application, now()->getTimestamp() - PointWordPressAtRenamedDatabaseJob::WALL_CLOCK_SECONDS);

        Exceptions::assertReported(fn (RuntimeException $e): bool => str_contains($e->getMessage(), 'did not end within the wait'));
        Queue::assertNothingPushed();
    }

    public function test_the_rename_failed_hook_reports_its_exception_only(): void
    {
        Exceptions::fake();
        $application = $this->bareApplication();

        (new PointWordPressAtRenamedDatabaseJob($application->id, 21, 'site1_new'))->failed();
        Exceptions::assertNothingReported();

        (new PointWordPressAtRenamedDatabaseJob($application->id, 21, 'site1_new'))->failed(new RuntimeException('worker died'));
        Exceptions::assertReported(fn (RuntimeException $e): bool => $e->getMessage() === 'worker died');
    }
}
