<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * The queued job that follows an Engine
 * `202 + task` to its end and fires the Client Area notification. Engine
 * hiccups only delay it; the wall-clock cap and a task 404 end it.
 * @see Engine core/routes/api.php:114-117 (tasks)
 */
class WatchApplicationTaskJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
        ]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    private function runJob(WatchApplicationTaskJob $job): void
    {
        $job->handle(
            app(EngineResolver::class),
            app(ApplicationSynchronizer::class),
        );
    }

    public function test_a_running_task_redispatches_itself_carrying_the_after_cursor(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => [
            'status' => 'running',
            'next_after_id' => 42,
        ]])]);
        Queue::fake();
        $startedAt = now()->getTimestamp();

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed', startedAt: $startedAt,
        ));

        Queue::assertPushed(WatchApplicationTaskJob::class, fn (WatchApplicationTaskJob $job) => $job->nextAfterId === 42
            && $job->startedAt === $startedAt
            && $job->hiccupAttempt === 0);
    }

    public function test_an_engine_hiccup_redispatches_with_backoff_and_does_not_fail(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Notification::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed', startedAt: now()->getTimestamp(),
        ));

        Queue::assertPushed(WatchApplicationTaskJob::class, function (WatchApplicationTaskJob $job) {
            $seconds = $job->delay instanceof \DateTimeInterface
                ? $job->delay->getTimestamp() - now()->getTimestamp()
                : -1;

            return $job->hiccupAttempt === 1 && $seconds >= 2 && $seconds <= 4;
        });
        Notification::assertNothingSent();
    }

    public function test_engine_5xx_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['message' => 'boom'], 500)]);

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed', startedAt: now()->getTimestamp(),
        ));

        Queue::assertPushed(WatchApplicationTaskJob::class, function (WatchApplicationTaskJob $job) {
            $seconds = $job->delay instanceof \DateTimeInterface
                ? $job->delay->getTimestamp() - now()->getTimestamp()
                : -1;

            return $job->hiccupAttempt === 1 && $seconds >= 2 && $seconds <= 4;
        });
        Notification::assertNothingSent();
    }

    public function test_a_task_that_recovers_after_a_hiccup_finishes(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/5*' => Http::response(['data' => ['status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
            'engine.example.com/api/projects/site1/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => null, 'state' => 'no_core']]),
        ]);

        // The re-dispatched poll (one hiccup already seen) now succeeds.
        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
            startedAt: now()->getTimestamp(), hiccupAttempt: 1,
        ));

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_finished'
                && $notification->isError === false,
        );
    }

    public function test_engine_down_past_the_cap_fails_without_redispatching(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Notification::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
            startedAt: now()->getTimestamp() - WatchApplicationTaskJob::WALL_CLOCK_SECONDS - 1,
        ));

        Queue::assertNothingPushed();
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_failed'
                && $notification->isError === true,
        );
    }

    public function test_a_missing_task_notifies_failure(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['message' => 'Not found'], 404)]);

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
        ));

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_failed'
                && $notification->isError === true,
        );
    }

    public function test_a_finished_task_notifies_success_and_resyncs(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/5*' => Http::response(['data' => ['status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
            'engine.example.com/api/projects/site1/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => null, 'state' => 'no_core']]),
        ]);
        Notification::fake();

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
        ));

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_finished'
                && $notification->isError === false,
        );
    }

    public function test_a_finished_task_deletes_the_deploy_archive(): void
    {
        // The fallback watcher follows the same deploy task when
        // no `deploy_logs` row could be written, so it deletes the staged
        // archive on the same terminal outcome.
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/5*' => Http::response(['data' => ['status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
            'engine.example.com/api/projects/site1/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => null, 'state' => 'no_core']]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
        ]);

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.installation_finished', 'user.instance.installation_failed',
            archivePath: 'project/.panelalpha-upload/site.zip',
        ));

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/api/projects/site1/files/remove')
            && $request['path'] === 'project/.panelalpha-upload/site.zip');
    }

    public function test_a_running_task_redispatches_carrying_the_archive_path(): void
    {
        // A running task re-dispatches itself, so the archive to
        // delete when it finally ends must travel with the next poll.
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => ['status' => 'running']])]);
        Queue::fake();

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.installation_finished', 'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
            archivePath: 'project/.panelalpha-upload/site.zip',
        ));

        Queue::assertPushed(WatchApplicationTaskJob::class, fn (WatchApplicationTaskJob $job): bool => $job->archivePath === 'project/.panelalpha-upload/site.zip');
    }

    public function test_a_failed_task_notifies_failure(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine TaskResource (core/app/Http/Resources/TaskResource.php);
        // `details.error` / `details.problems[].message` is what the watcher
        // forwards to the CA.
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/5*' => Http::response(['data' => [
            'id' => 5,
            'job_id' => 'job-5',
            'queue' => 'default',
            'job_type' => 'rebuild',
            'status' => 'failed',
            'details' => [
                'error' => 'image build failed',
            ],
            'next_after_id' => 0,
        ]])]);
        Notification::fake();

        $this->runJob(new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
        ));

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_failed'
                && $notification->isError === true
                && ($notification->payload['message'] ?? null) === 'image build failed',
        );
    }

    public function test_the_failed_hook_always_notifies(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();

        (new WatchApplicationTaskJob(
            $application->id, 5, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
        ))->failed();

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification) => $notification->type === 'user.instance.redeploy_failed'
                && $notification->isError === true,
        );
    }
}
