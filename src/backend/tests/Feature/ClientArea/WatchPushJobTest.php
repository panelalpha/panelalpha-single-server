<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\WatchPushJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * The job that follows an Engine staging push.
 *
 * Contract:
 * - Engine `POST projects/{u}/push` (`StagingController::push`) answers 202 with
 *   the **target** UserResource plus a top-level `task_id`; it records the copy
 *   as `Task::start(jobType: PushState::class, details: {action: 'push', …})`
 *   (`core/app/Http/Controllers/User/StagingController.php:245-256`).
 * - The job polls that task: `GET tasks/{id}`
 *   (`core/routes/api.php:104` → TaskController::show), a bare
 *   `{data: TaskResource}` with `status` (`queued|running|completed|failed|
 *   cancelled`, `core/app/Models/Task.php:14-18`) and `details.error` on failure.
 * - On a terminal task it mirrors the target (`GET projects/{u}`,
 *   UserController::show) and notifies with the **source** project as
 *   `instance` (old `Jobs/User/PushToLive.php:94,139` – the staging;
 *   `PushToStaging.php:83,97` – the live); CA types
 *   `user.instance.push_to_live_finished|failed` /
 *   `push_to_staging_finished|failed`.
 */
class WatchPushJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * A live project with one staging: the staging is the source of a
     * push-to-live, the live one the target.
     *
     * @return array{live: Application, staging: Application}
     */
    private function pair(): array
    {
        $live = $this->syncedApplication(User::factory()->create());

        $staging = Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $live->id,
        ]);

        return ['live' => $live, 'staging' => $staging];
    }

    /**
     * The push Task the Engine records (`StagingController::push`).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function task(array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/TaskResource.php:44 -> taskPayload
        return array_merge([
            'id' => 77,
            'status' => 'completed',
            'details' => ['action' => 'push', 'source' => 'site1-staging', 'target' => 'site1'],
        ], $overrides);
    }

    public function test_a_completed_push_task_notifies_the_source_as_finished(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task()])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => [
            'username' => 'site1',
            'status' => 'suspended',
            'details' => ['async_status' => ['push' => 'completed']],
        ]])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        // The target is mirrored before the source is notified.
        $this->assertSame('suspended', $live->fresh()->status);

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_finished'
            && $n->application->id === $staging->id);
    }

    public function test_a_failed_push_task_notifies_the_source_with_the_engine_message(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'failed',
            'details' => ['action' => 'push', 'error' => 'rsync failed'],
        ])])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'rsync failed');
    }

    public function test_an_empty_engine_error_is_dropped_from_the_notification(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'failed',
            'details' => ['action' => 'push', 'error' => ''],
        ])])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        // The old `array_filter(['message' => $message])` dropped an empty
        // Engine error, so the notification must not gain a `message` key.
        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && ! array_key_exists('message', $n->payload));
    }

    public function test_a_cancelled_push_task_notifies_the_source_as_failed(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'cancelled',
        ])])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'The push was cancelled.');
    }

    public function test_a_failed_push_task_redacts_home_paths_from_the_notification(): void
    {
        // The recorded live answer: an older push failure
        // carried the Engine's `/home/…` path into the notification.
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'failed',
            'details' => [
                'action' => 'push',
                'error' => 'open /home/e2estatic21537/.incoming/docker-compose.yml: permission denied',
            ],
        ])])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'open '.EngineText::REDACTED_PATH.': permission denied');
    }

    public function test_a_push_task_failed_on_a_pending_project_reads_the_preparing_sentence(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'failed',
            'details' => [
                'action' => 'push',
                'error' => "Project 'site1' is pending.",
            ],
        ])])]);
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->payload['message'] === EngineText::STILL_PREPARING);
    }

    public function test_a_refused_task_poll_notifies_the_client_area_text(): void
    {
        // The Engine client's exception carries the Engine's own
        // text; the notification shows the Client Area's presentation of it (a
        // busy 409 naming a task reads the safe busy text).
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
        // Defensive (not an Engine shape): a task poll does not answer a busy 409; it exercises the presented refusal text.
        Http::fake(['engine.example.com/api/tasks/77' => Http::response([
            'message' => 'A deploy of this project is already queued or running: task 48. Follow it with GET /tasks/48.',
        ], 409)]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === EngineText::SAFE_REFUSAL);
    }

    public function test_a_combined_push_env_permission_error_is_shown_sanitised(): void
    {
        // The recorded live answer: a combined
        // `{files:true, databases:true}` push of a project whose `.env` the
        // env_vars save wrote `0600` fails Engine-side. v1 reports it correctly;
        // the Engine's absolute path must not reach the CA.
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
// Engine: core/app/Http/Controllers/TaskController.php:180 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task([
            'status' => 'failed',
            'details' => [
                'action' => 'push',
                'error' => 'Failed to prepare volumes: open /home/e2egit5/.incoming/project/.env: permission denied',
            ],
        ])])]);
// Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'Failed to prepare volumes: open '.EngineText::REDACTED_PATH.': permission denied');
    }

    public function test_a_push_without_a_task_fails_closed_without_an_engine_call(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
        Http::fake();

        // The Engine always records the push as a task; without an id there is no
        // way to follow it (no fallback to the old untasked shape).
        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed'))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/tasks/'));
    }

    public function test_engine_5xx_on_the_task_redispatches_with_backoff(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Queue::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['message' => 'boom'], 500)]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->hiccupAttempt === 1
            && $job->taskId === 77);
    }

    public function test_engine_down_redispatches_with_backoff(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Queue::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->handle(
            app(ApplicationSynchronizer::class),
        );

        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->hiccupAttempt === 1
            && $job->taskId === 77);
    }

    public function test_the_wall_clock_cap_fails_the_push(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();
        Queue::fake();
// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['data' => $this->task(['status' => 'running'])])]);

        (new WatchPushJob(
            $staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77,
            startedAt: now()->getTimestamp() - WatchPushJob::WALL_CLOCK_SECONDS,
        ))->handle(app(ApplicationSynchronizer::class));

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id);
        Queue::assertNotPushed(WatchPushJob::class);
    }

    public function test_the_push_backoff_delays_double_up_to_a_minute(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

// Engine: core/app/Http/Controllers/TaskController.php:80 -> show
        Http::fake(['engine.example.com/api/tasks/77' => Http::response(['message' => 'boom'], 500)]);

        Carbon::setTestNow('2026-10-10 10:00:00');

        // 3, 6, 12, 24, 48, 60, 60 … seconds.
        foreach ([0 => 3, 1 => 6, 2 => 12, 3 => 24, 4 => 48, 5 => 60, 6 => 60] as $attempt => $seconds) {
            Queue::fake();

            (new WatchPushJob(
                $staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77,
                startedAt: now()->getTimestamp(),
                hiccupAttempt: $attempt,
            ))->handle(app(ApplicationSynchronizer::class));

            Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->hiccupAttempt === $attempt + 1
                && $job->taskId === 77
                && $job->delay->getTimestamp() - now()->getTimestamp() === $seconds);
        }

        Carbon::setTestNow();
    }

    public function test_the_failed_hook_always_notifies_the_source(): void
    {
        ['live' => $live, 'staging' => $staging] = $this->pair();

        Notification::fake();

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))->failed();

        Notification::assertSentTo(User::query()->first(), ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.push_to_live_failed'
            && $n->application->id === $staging->id);
    }
}
