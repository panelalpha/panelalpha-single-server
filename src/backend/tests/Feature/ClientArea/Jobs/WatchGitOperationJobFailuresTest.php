<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Git\WatchGitOperationJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use Tests\TestCase;

/**
 * The paths of `WatchGitOperationJob` that end a queued pull or revert badly:
 * the project or the operation row is gone, the Engine refuses or errors on
 * the task read, the task fails with problems, or the commit read fails.
 *
 * Contract: the row never stays `in_progress` after a terminal answer; only an
 * Engine hiccup (connection error, 5xx) is polled again with a backoff.
 */
class WatchGitOperationJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
    }

    private function operation(Application $application): GitOperation
    {
        return GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_IN_PROGRESS,
            'engine_task_id' => 4242,
        ]);
    }

    private function watch(Application $application, GitOperation $operation): void
    {
        Queue::fake();
        (new WatchGitOperationJob($application->id, $operation->id, 4242, now()->getTimestamp()))->handle(app(EngineResolver::class));
    }

    public function test_a_deleted_project_ends_the_watch_without_an_engine_call(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        $application->delete();
        Http::fake();

        $this->watch($application, $operation);

        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_a_deleted_operation_row_ends_the_watch_without_an_engine_call(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        $operation->delete();
        Http::fake();

        $this->watch($application, $operation);

        Http::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_a_task_5xx_keeps_the_row_in_progress_and_polls_again_with_a_backoff(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the Engine errors)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['message' => 'boom'], 500)]);

        $this->watch($application, $operation);

        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, $operation->fresh()->status);
        $this->assertPollQueued(WatchGitOperationJob::class, 1, 3);
    }

    public function test_a_task_refusal_fails_the_row_with_the_engine_message(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (a refusal that is neither 404 nor 5xx)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['message' => 'This token may not read tasks.'], 403)]);

        $this->watch($application, $operation);

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertSame('This token may not read tasks.', $operation->error_message);
        Queue::assertNothingPushed();
    }

    public function test_a_failed_task_stores_the_first_problem_message_when_it_has_no_error(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (details.problems[] without details.error)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'failed', 'details' => [
            'problems' => [['message' => ''], ['code' => 'x'], ['message' => 'The checkout has local changes.']],
        ]]])]);

        $this->watch($application, $operation);

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertSame('The checkout has local changes.', $operation->error_message);
    }

    public function test_a_failed_task_without_any_message_stores_no_message(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'cancelled', 'details' => []]])]);

        $this->watch($application, $operation);

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertNull($operation->error_message);
    }

    public function test_a_completed_task_succeeds_without_a_commit_when_the_commit_read_fails(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/User/GitController.php:113 -> GitController::commits (the Engine errors)
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->watch($application, $operation);

        $operation->refresh();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $operation->status);
        $this->assertNull($operation->commit_hash);
    }

    public function test_the_failed_hook_fails_a_row_that_is_still_in_progress(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);

        (new WatchGitOperationJob($application->id, $operation->id, 4242))->failed();

        $this->assertSame(GitOperation::STATUS_FAILED, $operation->fresh()->status);
    }

    public function test_the_failed_hook_of_a_deleted_row_does_nothing(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        $id = $operation->id;
        $operation->delete();

        (new WatchGitOperationJob($application->id, $id, 4242))->failed();

        $this->assertSame(0, GitOperation::query()->count());
    }

    public function test_the_wall_clock_cap_fails_a_row_whose_task_still_runs(): void
    {
        $application = $this->bareApplication();
        $operation = $this->operation($application);
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (still running)
        Http::fake(['engine.example.com/api/tasks/4242*' => Http::response(['data' => ['id' => 4242, 'status' => 'running']])]);

        Queue::fake();
        (new WatchGitOperationJob($application->id, $operation->id, 4242, now()->getTimestamp() - WatchGitOperationJob::WALL_CLOCK_SECONDS))
            ->handle(app(EngineResolver::class));

        $this->assertSame(GitOperation::STATUS_FAILED, $operation->fresh()->status);
        Queue::assertNothingPushed();
    }
}
