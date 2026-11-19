<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\CopyProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchCopyJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineFeatures;
use Tests\TestCase;

/**
 * The paths of the project copy (`CopyProjectJob`, `WatchCopyJob`) that end in
 * a failure or a retry: the source project is gone, the Engine hiccups or
 * refuses the task or the project read, the Engine answers without the copy,
 * or the copy runs past the wall-clock cap.
 *
 * Contract: only an Engine hiccup (connection error, 5xx) is retried with a
 * backoff (3, 6, 12 ... seconds); every other failure ends the CA spinner with
 * `installation_failed` on the source project.
 */
class WatchCopyJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Event::fake([ClientAreaNotificationRequested::class]);
    }

    private function watch(Application $source, int $startedAt = 0, int $hiccupAttempt = 0): void
    {
        Queue::fake();
        (new WatchCopyJob($source->id, 'site1copy', 77, $startedAt > 0 ? $startedAt : now()->getTimestamp(), $hiccupAttempt))
            ->handle(app(ApplicationSynchronizer::class));
    }

    private function fakeCompletedTask(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (the copy task completed)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'completed', 'details' => ['action' => 'copy']]])]);
    }

    public function test_a_deleted_source_ends_the_watch_quietly(): void
    {
        $source = $this->bareApplication();
        $id = $source->id;
        $source->delete();
        Http::fake();

        Queue::fake();
        (new WatchCopyJob($id, 'site1copy', 77))->handle(app(ApplicationSynchronizer::class));

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_failed_hook_of_a_deleted_source_notifies_nobody(): void
    {
        $source = $this->bareApplication();
        $id = $source->id;
        $source->delete();

        (new WatchCopyJob($id, 'site1copy', 77))->failed();

        $this->assertNotNotified();
    }

    public function test_the_failed_hook_ends_the_spinner_on_the_source(): void
    {
        $source = $this->bareApplication();

        (new WatchCopyJob($source->id, 'site1copy', 77))->failed();

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The copy did not finish.');
    }

    public function test_an_unreachable_engine_polls_again_with_a_backoff(): void
    {
        $source = $this->bareApplication();
        Http::fake(['engine.example.com/api/tasks/77*' => Http::failedConnection()]);

        $this->watch($source, hiccupAttempt: 1);

        $this->assertPollQueued(WatchCopyJob::class, 2, 6);
        $this->assertNotNotified();
    }

    public function test_a_task_5xx_polls_again_with_a_backoff(): void
    {
        $source = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (the Engine errors)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['message' => 'boom'], 503)]);

        $this->watch($source);

        $this->assertPollQueued(WatchCopyJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_task_refusal_fails_the_copy_with_the_engine_message(): void
    {
        $source = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (a refusal that is not 404 or 5xx)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        $this->watch($source);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'This token may not read tasks.');
        Queue::assertNothingPushed();
    }

    public function test_an_engine_that_is_not_configured_fails_the_copy(): void
    {
        $source = $this->bareApplication(['engine_id' => 99]);
        Http::fake();

        $this->watch($source);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true);
        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_a_copy_still_running_past_the_cap_fails_with_the_time_message(): void
    {
        $source = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:206 -> show (still running)
        Http::fake(['engine.example.com/api/tasks/77*' => Http::response(['data' => ['id' => 77, 'status' => 'running', 'details' => []]])]);

        $this->watch($source, startedAt: now()->getTimestamp() - WatchCopyJob::WALL_CLOCK_SECONDS);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The copy did not finish in time.');
        Queue::assertNothingPushed();
    }

    public function test_an_unreachable_engine_at_the_project_read_polls_again(): void
    {
        $source = $this->bareApplication();
        $this->fakeCompletedTask();
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::failedConnection()]);

        $this->watch($source);

        $this->assertPollQueued(WatchCopyJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_project_read_5xx_polls_again(): void
    {
        $source = $this->bareApplication();
        $this->fakeCompletedTask();
        // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (the Engine errors)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['message' => 'boom'], 500)]);

        $this->watch($source);

        $this->assertPollQueued(WatchCopyJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_project_read_refusal_fails_the_copy_and_keeps_the_copy_row(): void
    {
        $source = $this->bareApplication();
        $copy = $this->bareApplication(['engine_username' => 'site1copy', 'status' => 'pending']);
        $this->fakeCompletedTask();
        // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (a refusal that is not 404 or 5xx)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['message' => 'Not yours.'], 403)]);

        $this->watch($source);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'Not yours.');
        $this->assertNotNull(Application::query()->find($copy->id), 'a copy that may still exist keeps its row');
    }

    public function test_a_project_read_validation_error_fails_the_copy(): void
    {
        $source = $this->bareApplication();
        $this->fakeCompletedTask();
        // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (a 422)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['message' => 'Invalid.', 'errors' => ['username' => ['The username is invalid.']]], 422)]);

        $this->watch($source);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The username is invalid.');
    }

    public function test_a_project_answer_without_a_username_fails_the_copy(): void
    {
        $source = $this->bareApplication();
        $this->fakeCompletedTask();
        // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (an answer that names no project)
        Http::fake(['engine.example.com/api/projects/site1copy' => Http::response(['data' => ['id' => 11]])]);

        $this->watch($source);

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The Engine did not return the cloned project.');
    }

    public function test_a_deleted_source_ends_the_copy_job_quietly(): void
    {
        $source = $this->bareApplication();
        $id = $source->id;
        $source->delete();
        Http::fake();

        (new CopyProjectJob($id))->handle(app(ApplicationSynchronizer::class));
        (new CopyProjectJob($id))->failed();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_copy_job_failed_hook_ends_the_spinner_on_the_source(): void
    {
        $source = $this->bareApplication();

        (new CopyProjectJob($source->id))->failed();

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The copy did not finish.');
    }

    public function test_a_clone_answer_without_a_username_fails_the_copy(): void
    {
        $source = $this->bareApplication();
        // Engine: core/app/Http/Controllers/UserController.php:1099 -> UserController::clone (an answer that names no project)
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response(['data' => ['id' => 11]])]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The Engine did not return the cloned project.');
    }

    public function test_a_copy_task_answer_without_a_username_or_task_fails_the_copy(): void
    {
        $source = $this->bareApplication();
        EngineFeatures::remember(app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID), ['features' => [EngineFeatures::PROJECT_SOURCE]]);
        // Engine: core/app/Lib/Project/ProjectCopier.php:50 -> queue (an answer with neither username nor task id)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => ['status' => 'queued']], 202)]);

        Queue::fake();
        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified(CopyProjectJob::FAILED_TYPE, true, 'The Engine did not return the cloned project.');
        Queue::assertNotPushed(WatchCopyJob::class);
        $this->assertSame(1, Application::query()->count());
    }
}
