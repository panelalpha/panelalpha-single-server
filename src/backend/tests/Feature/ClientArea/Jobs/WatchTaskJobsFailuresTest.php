<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchPushJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use Tests\TestCase;

/**
 * The failure paths of the four task watchers that tell the Client Area how a
 * background Engine task ended: backup, generic application task, push and
 * staging copy. Each ends the CA spinner with a failure notification when its
 * project is lost, the Engine refuses, or the task fails.
 *
 * Contract: only an Engine hiccup (connection error, 5xx) is polled again with
 * a backoff (3, 6, 12 ... seconds); a running task is polled again after 3 s.
 */
class WatchTaskJobsFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Event::fake([ClientAreaNotificationRequested::class]);
    }

    // WatchBackupTaskJob

    private function backup(int $applicationId, int $startedAt = 0): WatchBackupTaskJob
    {
        return new WatchBackupTaskJob(
            $applicationId, 9, 3, 'delete',
            'user.instance.backup.delete_finished', 'user.instance.backup.delete_failed',
            ['id' => 3], $startedAt > 0 ? $startedAt : now()->getTimestamp(),
        );
    }

    public function test_a_backup_watcher_of_a_deleted_project_ends_quietly(): void
    {
        $application = $this->bareApplication();
        $job = $this->backup($application->id);
        $application->delete();
        Http::fake();

        $job->handle();
        $job->failed();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_a_backup_task_5xx_polls_again_with_a_backoff(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the Engine errors)
        Http::fake(['engine.example.com/api/tasks/9*' => Http::response(['message' => 'boom'], 500)]);

        Queue::fake();
        $this->backup($application->id)->handle();

        $this->assertPollQueued(WatchBackupTaskJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_backup_task_refusal_fails_the_action_with_the_engine_message(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/9*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        Queue::fake();
        $this->backup($application->id)->handle();

        $this->assertNotified('user.instance.backup.delete_failed', true, 'This token may not read tasks.');
        Queue::assertNothingPushed();
    }

    public function test_a_running_backup_task_polls_again_after_three_seconds(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (still running)
        Http::fake(['engine.example.com/api/tasks/9*' => Http::response(['data' => ['id' => 9, 'status' => 'running']])]);

        Queue::fake();
        $this->backup($application->id)->handle();

        $this->assertPollQueued(WatchBackupTaskJob::class, 0, 3);
        $this->assertNotNotified();
    }

    public function test_a_failed_backup_task_reports_the_first_problem_message_when_it_has_no_error(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (details.problems[] without details.error)
        Http::fake(['engine.example.com/api/tasks/9*' => Http::response(['data' => ['id' => 9, 'status' => 'failed', 'details' => [
            'problems' => [['message' => ''], ['message' => 'The backup store is full.']],
        ]]])]);

        Queue::fake();
        $this->backup($application->id)->handle();

        $this->assertNotified('user.instance.backup.delete_failed', true, 'The backup store is full.');
    }

    public function test_a_failed_backup_task_without_any_message_sends_no_message(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details)
        Http::fake(['engine.example.com/api/tasks/9*' => Http::response(['data' => ['id' => 9, 'status' => 'cancelled', 'details' => []]])]);

        Queue::fake();
        $this->backup($application->id)->handle();

        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.backup.delete_failed'
            && $event->isError
            && ! array_key_exists('message', $event->payload()));
    }

    // WatchApplicationTaskJob

    private function applicationTask(int $applicationId, ?string $archivePath = null): WatchApplicationTaskJob
    {
        return new WatchApplicationTaskJob(
            $applicationId, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
            startedAt: now()->getTimestamp(), archivePath: $archivePath,
        );
    }

    public function test_a_task_watcher_of_a_deleted_project_ends_quietly(): void
    {
        $application = $this->bareApplication();
        $job = $this->applicationTask($application->id);
        $application->delete();
        Http::fake();

        $job->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));
        $job->failed();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_a_task_refusal_fails_the_action_with_the_engine_message(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        Queue::fake();
        $this->applicationTask($application->id)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.redeploy_failed', true, 'This token may not read tasks.');
        Queue::assertNothingPushed();
    }

    public function test_a_failing_project_listing_does_not_stop_the_finished_notification(): void
    {
        $application = $this->bareApplication();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the sync fails)
            'engine.example.com/api/projects/all*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->applicationTask($application->id)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.redeploy_finished', false);
    }

    public function test_a_failed_task_reports_the_first_problem_message_when_it_has_no_error(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (details.problems[] without details.error)
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'failed', 'details' => [
            'problems' => [['message' => ''], ['message' => 'The image build failed.']],
        ]]])]);

        $this->applicationTask($application->id)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.redeploy_failed', true, 'The image build failed.');
    }

    public function test_a_failed_task_without_any_message_sends_no_message(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details)
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'cancelled', 'details' => []]])]);

        $this->applicationTask($application->id)->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));

        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.redeploy_failed'
            && $event->isError
            && ! array_key_exists('message', $event->payload()));
    }

    public function test_a_failing_archive_delete_does_not_stop_the_finished_notification(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove (the delete fails)
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->applicationTask($application->id, 'project/.panelalpha-upload/site.zip')->handle(app(EngineResolver::class), app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.redeploy_finished', false);
    }

    // WatchPushJob

    private function watcherOfPush(int $sourceId, int $targetId): WatchPushJob
    {
        return new WatchPushJob($sourceId, $targetId, 'user.instance.push_finished', 'user.instance.push_failed', 8, now()->getTimestamp());
    }

    public function test_a_push_watcher_of_a_deleted_project_ends_quietly(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_username' => 'site2']);
        $job = $this->watcherOfPush($source->id, $target->id);
        $target->delete();
        Http::fake();

        $job->handle(app(ApplicationSynchronizer::class));

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_push_failed_hook_of_a_deleted_source_notifies_nobody(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_username' => 'site2']);
        $job = $this->watcherOfPush($source->id, $target->id);
        $source->delete();

        $job->failed();

        $this->assertNotNotified();
    }

    public function test_a_push_task_refusal_fails_the_push_with_the_engine_message(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_username' => 'site2']);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/8*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        Queue::fake();
        $this->watcherOfPush($source->id, $target->id)->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.push_failed', true, 'This token may not read tasks.');
        Queue::assertNothingPushed();
    }

    public function test_a_push_on_an_engine_that_is_not_configured_fails_the_push(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_id' => 99, 'engine_username' => 'site2']);
        Http::fake();

        Queue::fake();
        $this->watcherOfPush($source->id, $target->id)->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.push_failed', true);
        Http::assertNothingSent();
    }

    public function test_a_running_push_polls_again_after_three_seconds(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_username' => 'site2']);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (still running)
        Http::fake(['engine.example.com/api/tasks/8*' => Http::response(['data' => ['id' => 8, 'status' => 'running']])]);

        Queue::fake();
        $this->watcherOfPush($source->id, $target->id)->handle(app(ApplicationSynchronizer::class));

        $this->assertPollQueued(WatchPushJob::class, 0, 3);
        $this->assertNotNotified();
    }

    public function test_a_failing_target_read_does_not_stop_the_finished_notification(): void
    {
        $source = $this->bareApplication();
        $target = $this->bareApplication(['engine_username' => 'site2']);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/8*' => Http::response(['data' => ['id' => 8, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1010 -> show (the mirror read fails)
            'engine.example.com/api/projects/site2' => Http::response(['message' => 'boom'], 500),
        ]);

        Queue::fake();
        $this->watcherOfPush($source->id, $target->id)->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.push_finished', false);
    }

    // WatchStagingJob

    public function test_the_staging_failed_hook_of_a_deleted_row_does_nothing(): void
    {
        $this->bareApplication();

        (new WatchStagingJob(999))->failed();

        $this->assertNotNotified();
    }

    public function test_a_lost_staging_reports_the_first_problem_message_of_its_task(): void
    {
        $parent = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (details.problems[] without details.error)
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'failed', 'details' => [
            'problems' => [['message' => ''], ['message' => 'There is not enough disk space.']],
        ]]])]);

        (new WatchStagingJob(999, 5, now()->getTimestamp(), 0, $parent->id, 'site1-staging'))->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.create_staging_failed', true, 'There is not enough disk space.');
    }

    public function test_a_lost_staging_whose_task_has_no_message_says_the_project_is_gone(): void
    {
        $parent = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details)
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => ['id' => 5, 'status' => 'failed', 'details' => []]])]);

        (new WatchStagingJob(999, 5, now()->getTimestamp(), 0, $parent->id, 'site1-staging'))->handle(app(ApplicationSynchronizer::class));

        $this->assertNotified('user.instance.create_staging_failed', true, 'The staging project is gone.');
    }
}
