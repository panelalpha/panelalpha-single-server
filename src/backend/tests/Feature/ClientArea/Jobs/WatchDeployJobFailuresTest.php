<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\DeployLogUpdated;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use RuntimeException;
use Tests\TestCase;

/**
 * The paths of `WatchDeployJob` a deploy takes when the Engine or the project
 * misbehaves: a project deleted while it runs, Engine 4xx/5xx and timeouts on
 * the task and on the deploy log, a task that fails with problems, a failing
 * sync, archive delete or broadcast, and a deployed commit with a bad date.
 *
 * Contract: the watcher always ends the CA spinner (`finished` or `failed`
 * notification) and only an Engine hiccup (connection error, 5xx) is retried
 * with a backoff (3, 6, 12 ... seconds).
 */
class WatchDeployJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    private const FINISHED = 'user.instance.redeploy_finished';

    private const FAILED = 'user.instance.redeploy_failed';

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Event::fake([ClientAreaNotificationRequested::class, DeployLogUpdated::class]);
    }

    private function watch(Application $application, ?int $taskId = 7, ?string $deployId = null, ?string $archivePath = null, int $startedAt = 0): void
    {
        Queue::fake();
        (new WatchDeployJob(
            $application->id,
            $taskId,
            self::FINISHED,
            self::FAILED,
            startedAt: $startedAt > 0 ? $startedAt : now()->getTimestamp(),
            archivePath: $archivePath,
            deployId: $deployId,
        ))->handle(app(ApplicationSynchronizer::class));
    }

    private function endedAs(string $status): void
    {
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $event): bool => $event->status === $status
            && $event->lines === []
            && $event->nextOffset === null);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function page(string $status, array $overrides = []): array
    {
        return array_merge([
            'id' => 'd-1', 'status' => $status, 'stage' => 'done', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null,
        ], $overrides);
    }

    public function test_a_deleted_project_ends_the_watch_without_a_call_or_a_notification(): void
    {
        $application = $this->bareApplication();
        $id = $application->id;
        $application->delete();
        Http::fake();

        Queue::fake();
        (new WatchDeployJob($id, 7, self::FINISHED, self::FAILED))->handle(app(ApplicationSynchronizer::class));

        Http::assertNothingSent();
        Queue::assertNothingPushed();
        $this->assertNotNotified();
    }

    public function test_the_failed_hook_of_a_deleted_project_notifies_nobody(): void
    {
        $application = $this->bareApplication();
        $id = $application->id;
        $application->delete();

        (new WatchDeployJob($id, 7, self::FINISHED, self::FAILED))->failed();

        $this->assertNotNotified();
    }

    public function test_a_deploy_without_a_recorded_task_fails_at_once(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();

        $this->watch($application, taskId: null);

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'No Engine task was recorded for this deploy.');
    }

    public function test_a_deploy_task_the_engine_pruned_fails_the_deploy(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a pruned task answers 404)
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['message' => 'Not found'], 404)]);

        $this->watch($application);

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'The Engine task is gone.');
        Queue::assertNothingPushed();
    }

    public function test_an_engine_refusal_of_the_task_read_fails_the_deploy_with_its_message(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['message' => 'Forbidden for this token.'], 403)]);

        $this->watch($application);

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'Forbidden for this token.');
        Queue::assertNothingPushed();
    }

    public function test_a_queued_task_without_a_deploy_polls_again_without_a_backoff(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (queued, the deploy has not started)
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'queued', 'details' => []]])]);

        $this->watch($application);

        $this->assertPollQueued(WatchDeployJob::class, 0, 3);
        $this->assertNotNotified();
    }

    public function test_a_failed_task_reports_the_first_problem_message_when_it_has_no_error(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (an empty page)
            'engine.example.com/api/tasks/7/logs*' => Http::response(['data' => [], 'meta' => ['next_after_id' => 0, 'task_status' => 'failed']]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (details.problems[] without details.error)
            'engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'failed', 'details' => [
                'problems' => [['message' => ''], ['code' => 'x'], ['message' => 'The repository has no branch main.']],
            ]]]),
        ]);

        $this->watch($application);

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'The repository has no branch main.');
    }

    public function test_a_failed_task_without_any_message_says_it_failed_before_it_started(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (an empty page)
            'engine.example.com/api/tasks/7/logs*' => Http::response(['data' => [], 'meta' => ['next_after_id' => 0, 'task_status' => 'failed']]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details)
            'engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'failed', 'details' => []]]),
        ]);

        $this->watch($application);

        $this->assertNotified(self::FAILED, true, 'The deploy failed before it started.');
    }

    public function test_a_task_log_line_with_an_unreadable_time_is_still_kept_in_the_tail(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (a line whose created_at is not a date)
            'engine.example.com/api/tasks/7/logs*' => Http::sequence()
                ->push(['data' => [
                    ['id' => 1, 'log' => 'Cloning', 'level' => 'info', 'stage' => null, 'created_at' => 'not a date'],
                    ['id' => 2, 'log' => 'Cloned', 'level' => 'info', 'stage' => null, 'created_at' => null],
                ], 'meta' => ['next_after_id' => 2, 'task_status' => 'failed']])
                // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (the last page is empty)
                ->push(['data' => [], 'meta' => ['next_after_id' => 2, 'task_status' => 'failed']]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'failed', 'details' => ['error' => 'Build failed.']]]),
        ]);

        $this->watch($application);

        $tail = DeployTaskTail::query()->sole();
        $this->assertSame(['Cloning', 'Cloned'], array_map(static fn (array $line): string => $line['msg'], $tail->parsedLines()));
        $this->assertSame([now()->getTimestamp(), now()->getTimestamp()], array_map(static fn (array $line): int => $line['ts'], $tail->parsedLines()));
    }

    public function test_the_deploy_log_being_unreachable_polls_again_with_a_backoff(): void
    {
        $application = $this->bareApplication();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        $this->watch($application, deployId: 'd-1');

        $this->assertPollQueued(WatchDeployJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_deploy_log_5xx_polls_again_with_a_backoff(): void
    {
        $application = $this->bareApplication();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'boom'], 502)]);

        $this->watch($application, deployId: 'd-1');

        $this->assertPollQueued(WatchDeployJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_a_second_hiccup_doubles_the_backoff(): void
    {
        $application = $this->bareApplication();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        Queue::fake();
        (new WatchDeployJob($application->id, 7, self::FINISHED, self::FAILED, startedAt: now()->getTimestamp(), hiccupAttempt: 3, deployId: 'd-1'))
            ->handle(app(ApplicationSynchronizer::class));

        $this->assertPollQueued(WatchDeployJob::class, 4, 24);
    }

    public function test_the_backoff_stops_growing_at_one_minute(): void
    {
        $application = $this->bareApplication();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        Queue::fake();
        (new WatchDeployJob($application->id, 7, self::FINISHED, self::FAILED, startedAt: now()->getTimestamp(), hiccupAttempt: 9, deployId: 'd-1'))
            ->handle(app(ApplicationSynchronizer::class));

        $this->assertPollQueued(WatchDeployJob::class, 10, 60);
    }

    public function test_a_deploy_log_refusal_fails_the_deploy_with_the_engine_message(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show (a refusal that is not 403/404/5xx)
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'Offset is out of range.'], 400)]);

        $this->watch($application, deployId: 'd-1');

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'Offset is out of range.');
        Queue::assertNothingPushed();
    }

    public function test_a_missing_deploy_log_without_a_task_fails_with_the_log_message(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show (404, nothing to read)
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'No deploy log.'], 404)]);

        $this->watch($application, taskId: null, deployId: 'd-1');

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'The Engine has no deploy log for this project.');
    }

    public function test_a_missing_deploy_log_with_an_unreadable_task_fails_with_the_log_message(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'No deploy log.'], 404),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the Engine errors)
            'engine.example.com/api/tasks/7*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application, deployId: 'd-1');

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'The Engine has no deploy log for this project.');
        $this->assertSame(0, DeployTaskTail::query()->count());
    }

    public function test_a_missing_deploy_log_of_a_completed_task_fails_with_the_log_message(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'No deploy log.'], 404),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the task completed, so it does not explain the missing log)
            'engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'completed', 'details' => ['deploy_id' => 'd-1']]]),
        ]);

        $this->watch($application, deployId: 'd-1');

        $this->endedAs('failed');
        $this->assertNotified(self::FAILED, true, 'The Engine has no deploy log for this project.');
    }

    public function test_a_task_read_failing_while_the_notification_waits_does_not_hold_it_back(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show (the log ended just now)
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success', ['finished_at' => now()->getTimestamp()])]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the settle check fails)
            'engine.example.com/api/tasks/7*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application, deployId: 'd-1');

        $this->endedAs('finished');
        $this->assertNotified(self::FINISHED, false);
    }

    public function test_a_failing_project_listing_does_not_stop_the_finished_notification(): void
    {
        $application = $this->bareApplication();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success')]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the sync after the deploy fails)
            'engine.example.com/api/projects/all*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application, deployId: 'd-1');

        $this->endedAs('finished');
        $this->assertNotified(self::FINISHED, false);
    }

    public function test_a_project_the_sync_dropped_still_gets_the_finished_notification(): void
    {
        $application = $this->bareApplication();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success')]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the project is no longer listed)
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
        ]);

        $this->watch($application, deployId: 'd-1');

        $this->assertNull(Application::query()->find($application->id));
        $this->assertNotified(self::FINISHED, false);
    }

    public function test_a_deployed_commit_without_a_date_keeps_its_message_and_no_time(): void
    {
        $commit = str_repeat('a', 40);
        $application = $this->bareApplication();
        $this->fakeProjectListing(['details' => ['template' => 'dind']]);
        Http::fake([
            // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118 -> deploy list item, newest first (the deployed commit)
            'engine.example.com/api/projects/site1/deploys' => Http::response(['data' => [
                ['id' => '20261014-101500-a1b2c3', 'status' => 'success', 'commit' => $commit, 'branch' => 'main'],
            ]]),
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success')]),
            // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $commit, 'short_hash' => 'aaaaaaa', 'subject' => 'Fix it', 'author' => 'Dev', 'date' => ''],
            ]]),
        ]);

        $this->watch($application, deployId: 'd-1');

        $fresh = $application->fresh();
        $this->assertSame('Fix it', $fresh->git_last_commit_message);
        $this->assertNull($fresh->git_last_commit_at);
    }

    public function test_a_deployed_commit_with_an_unreadable_date_keeps_its_message_and_no_time(): void
    {
        $commit = str_repeat('b', 40);
        $application = $this->bareApplication();
        $this->fakeProjectListing(['details' => ['template' => 'dind']]);
        Http::fake([
            // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118 -> deploy list item, newest first (the deployed commit)
            'engine.example.com/api/projects/site1/deploys' => Http::response(['data' => [
                ['id' => '20261014-101500-a1b2c3', 'status' => 'success', 'commit' => $commit, 'branch' => 'main'],
            ]]),
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success')]),
            // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $commit, 'short_hash' => 'bbbbbbb', 'subject' => 'Fix it', 'author' => 'Dev', 'date' => 'last tuesday-ish'],
            ]]),
        ]);

        $this->watch($application, deployId: 'd-1');

        $fresh = $application->fresh();
        $this->assertSame($commit, $fresh->git_last_commit_hash);
        $this->assertSame('Fix it', $fresh->git_last_commit_message);
        $this->assertNull($fresh->git_last_commit_at);
    }

    public function test_a_failing_archive_delete_does_not_stop_the_finished_notification(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('success')]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove (the delete fails)
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application, deployId: 'd-1', archivePath: 'project/.panelalpha-upload/site.zip');

        $this->endedAs('finished');
        $this->assertNotified(self::FINISHED, false);
    }

    public function test_a_failing_broadcast_does_not_stop_the_deploy_notification(): void
    {
        $application = $this->bareApplication();
        $this->fakeProjectListing();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => $this->page('failed', ['error' => 'Build failed.'])]),
        ]);
        Event::fake([ClientAreaNotificationRequested::class]);
        Event::listen(DeployLogUpdated::class, static function (): never {
            throw new RuntimeException('Broadcast server is down.');
        });

        $this->watch($application, deployId: 'd-1');

        $this->assertNotified(self::FAILED, true, 'Build failed.');
    }

    public function test_the_failed_hook_removes_the_staged_archive(): void
    {
        $application = $this->bareApplication();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
        ]);

        (new WatchDeployJob($application->id, 7, self::FINISHED, self::FAILED, archivePath: 'project/.panelalpha-upload/site.zip'))->failed();

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE' && $request['path'] === 'project/.panelalpha-upload/site.zip');
        $this->assertNotified(self::FAILED, true, 'The deploy watcher stopped.');
    }
}
