<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * The watcher that follows an Engine staging copy to its end.
 *
 * Contract:
 * - CA waits for `user.instance.create_staging_finished` /
 *   `user.instance.create_staging_failed`; both carry `instance` = the staging
 *   (`packages/api/app/Jobs/User/CreateStaging.php:75,175`,
 *   `packages/client-area/src/views/instance/index.vue` reloads on finish).
 * - Engine `POST projects/{u}/staging` (core/routes/api.php:147 →
 *   StagingController::staging) starts an async copy and sets the
 *   **destination's** `details.async_status.staging` from `running`
 *   (`Models/User.php:makePendingStaging`) to `completed`
 *   (`System/Projects.php:249`) or `failed` + `details.error`
 *   (`Models/User.php:markStagingFailed`, `System/Projects.php:272`).
 * - `GET projects/{u}` (core/routes/api.php:149 → UserController::show) returns
 *   the destination with that status; a failed copy is deleted
 *   (`Jobs/CreateStaging.php:56-83`), so a 404 means failed too.
 */
class WatchStagingJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function staging(User $user): Application
    {
        $parent = $this->syncedApplication($user);

        return Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
        ]);
    }

    /**
     * Bind a resolver that records which application the notifier asked for
     * recipients, so the lost-staging path can prove it uses the parent.
     */
    private function recordRecipientApplications(): object
    {
        $seen = new \stdClass;
        $seen->applicationIds = [];
        $inner = $this->app->make(AccessResolver::class);

        $this->app->instance(AccessResolver::class, new class($inner, $seen) implements AccessResolver
        {
            public function __construct(
                private readonly AccessResolver $inner,
                private readonly \stdClass $seen,
            ) {}

            /** @return list<string> */
            public function privileges(Authenticatable $user, Application $application): array
            {
                return $this->inner->privileges($user, $application);
            }

            public function allows(Authenticatable $user, Application $application, string $privilege): bool
            {
                return $this->inner->allows($user, $application, $privilege);
            }

            public function allowsUser(Authenticatable $user, string $privilege): bool
            {
                return $this->inner->allowsUser($user, $privilege);
            }

            /** @return Collection<int, Authenticatable> */
            public function usersFor(Application $application): Collection
            {
                $this->seen->applicationIds[] = $application->id;

                return $this->inner->usersFor($application);
            }
        });

        return $seen;
    }

    private function runOnce(Application $staging, int $startedAt = 0, int $parentId = 0): void
    {
        (new WatchStagingJob(
            $staging->id,
            startedAt: $startedAt > 0 ? $startedAt : now()->getTimestamp(),
            parentId: $parentId,
        ))->handle(app(ApplicationSynchronizer::class));
    }

    public function test_a_completed_staging_copy_notifies_finished(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        Queue::fake();
        // Engine destination resource (UserResource): async_status.staging flips
        // to completed in System/Projects.php:249.
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
            'engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
                'id' => 50,
                'username' => 'site1-staging',
                'domain' => 'staging.site1.example.com',
                'status' => 'active',
                'details' => ['async_status' => ['staging' => 'completed']],
            ]]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]]),
        ]);

        $this->runOnce($staging);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_finished'
            && $n->application->id === $staging->id);
    }

    public function test_a_completed_staging_copy_presents_the_fresh_mirror(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);
        // The row still carries what the Engine said when the copy started.
        $staging->update([
            'status' => 'pending',
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'running']]],
            // A previous failed attempt kept this row; the successful copy clears
            // the marker. The creating marker set at create/retry
            // must be cleared too, or the staging stays pending forever and can
            // never be pushed to or deleted on the Engine.
            'staging_create_failed_at' => now(),
            'staging_creating_at' => now(),
        ]);

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'details' => ['async_status' => ['staging' => 'completed']],
        ]])]);

        $this->runOnce($staging);

        // The mirror is refreshed before the notification is built.
        $this->assertSame('active', $staging->fresh()->status);
        $this->assertNull($staging->fresh()->staging_create_failed_at);
        $this->assertNull($staging->fresh()->staging_creating_at);

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use ($user): bool {
            $instance = $n->toArray($user)['instance'] ?? [];

            return $n->type === 'user.instance.create_staging_finished'
                && ($instance['status'] ?? null) === 'active'
                && ($instance['async_status']['installation'] ?? null) === 'finished';
        });
    }

    public function test_a_running_staging_copy_redispatches_without_backoff(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Queue::fake();
        // Engine makePendingStaging(): the destination starts as running.
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'running']],
        ]])]);

        $startedAt = now()->getTimestamp() - 10;
        $this->runOnce($staging, startedAt: $startedAt, parentId: (int) $staging->staging_of_id);

        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->id
            && $job->hiccupAttempt === 0
            // The re-dispatch must carry the parent so a later lost row can
            // still end its spinner.
            && $job->parentId === (int) $staging->staging_of_id
            // Every poll counts the window from the first dispatch, not from
            // the poll that re-scheduled it.
            && $job->startedAt === $startedAt);
    }

    public function test_a_redispatch_carries_the_staging_username(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Queue::fake();
        // Engine makePendingStaging(): the destination starts as running.
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'running']],
        ]])]);

        (new WatchStagingJob($staging->id, parentId: (int) $staging->staging_of_id, stagingUsername: 'site1-staging'))->handle(
            app(ApplicationSynchronizer::class),
        );

        // Every poll must keep the username, so a row the user deletes while the
        // copy runs still renders the staging's name rather than the fallback.
        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->id
            && $job->stagingUsername === 'site1-staging');
    }

    public function test_engine_down_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Queue::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        $startedAt = now()->getTimestamp() - 10;
        $this->runOnce($staging, startedAt: $startedAt);

        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->id
            && $job->hiccupAttempt === 1
            // The window must not restart when a transport hiccup re-dispatches
            // the watcher.
            && $job->startedAt === $startedAt);
    }

    public function test_a_missing_staging_project_notifies_failed(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        // A re-dispatch on this terminal path must be observable, not run on
        // the sync queue.
        Queue::fake();
        // CreateStaging::failed() destroys the destination, so the watcher
        // can only see a 404 for a copy that failed (Jobs/CreateStaging.php).
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'Project not found.'], 404)]);

        $this->runOnce($staging);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'The staging project is gone.');
    }

    public function test_a_missing_staging_project_reads_the_copy_task_error(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        Queue::fake();
        // The Engine deleted the failed destination, but the copy task survives
        // with the reason.
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
            'engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'Project not found.'], 404),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7' => Http::response(['data' => [
                'id' => 7,
                'status' => 'failed',
                'details' => ['error' => 'rsync failed'],
            ]]),
        ]);

        (new WatchStagingJob($staging->id, taskId: 7))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'rsync failed');
    }

    public function test_a_missing_staging_project_falls_back_when_the_task_is_gone(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
            'engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'Project not found.'], 404),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7' => Http::response(['message' => 'Task not found.'], 404),
        ]);

        (new WatchStagingJob($staging->id, taskId: 7))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->payload['message'] === 'The staging project is gone.');
    }

    public function test_a_failed_staging_copy_notifies_failed_with_the_engine_error(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        // Engine markStagingFailed(): async_status.staging=failed + details.error.
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'details' => ['async_status' => ['staging' => 'failed'], 'error' => 'rsync failed'],
        ]])]);

        $this->runOnce($staging);

        // The row is marked so the synchronizer keeps it after the Engine
        // deletes the destination.
        $this->assertSame('failed', $staging->fresh()->status);
        $this->assertNotNull($staging->fresh()->staging_create_failed_at);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'rsync failed');
    }

    public function test_a_failed_copy_presents_the_fresh_mirror(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        // Engine: core/app/Models/User.php:163 (markStagingFailed sets
        // details.async_status.staging=failed + details.error).
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'domain' => 'renamed.example.com',
            'status' => 'failed',
            'details' => ['async_status' => ['staging' => 'failed'], 'error' => 'rsync failed'],
        ]])]);

        $this->runOnce($staging);

        $this->assertSame('renamed.example.com', $staging->fresh()->domain);

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use ($user): bool {
            $instance = $n->toArray($user)['instance'] ?? [];

            return $n->type === 'user.instance.create_staging_failed'
                && ($instance['domain'] ?? null) === 'renamed.example.com';
        });
    }

    public function test_a_sync_before_the_failed_watcher_keeps_the_row_and_ends_the_spinner(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);

        Notification::fake();
        Queue::fake();

        // The Engine marked the copy failed and deleted the destination; a sync
        // between that and the watcher poll must keep the creating row.
        // Engine: core/app/Http/Resources/UserResource.php:19 (projects/all body).
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
            // Engine: core/app/Http/Controllers/Controller.php:19 (projectOr404).
            'engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'Project not found.'], 404),
            // Engine: core/app/Http/Resources/TaskResource.php:15 (task details.error).
            'engine.example.com/api/tasks/7' => Http::response(['data' => [
                'id' => 7,
                'status' => 'failed',
                'details' => ['error' => 'rsync failed'],
            ]]),
        ]);

        app(ApplicationSynchronizer::class)->sync($parent->engine_id);

        $this->assertDatabaseHas('applications', ['id' => $staging->id]);

        (new WatchStagingJob($staging->id, taskId: 7, parentId: $parent->id))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'rsync failed');
        $this->assertNotNull($staging->fresh()->staging_create_failed_at);
        $this->assertNull($staging->fresh()->staging_creating_at);
    }

    public function test_a_deleted_staging_row_is_notified_as_itself(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);
        $stagingId = $staging->id;
        // The user deleted the row while the copy ran: the watcher has nobody
        // to mark, but the parent's recipients still get the failure.
        $staging->delete();

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Http/Resources/TaskResource.php:15 (task details.error).
        Http::fake(['engine.example.com/api/tasks/7' => Http::response(['data' => [
            'id' => 7,
            'status' => 'failed',
            'details' => ['error' => 'rsync failed'],
        ]])]);

        $seen = $this->recordRecipientApplications();

        (new WatchStagingJob($stagingId, taskId: 7, parentId: $parent->id))->handle(
            app(ApplicationSynchronizer::class),
        );

        // Recipients come from the parent, which still exists, not from the
        // deleted staging.
        $this->assertSame([$parent->id], $seen->applicationIds);

        // The `instance` is the staging, never the live parent: the CA marks
        // `instance.id` install-failed (Auth.js:393 -> index.vue:165), so the
        // parent would break the live site.
        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use ($stagingId, $parent, $user): bool {
            $instance = $n->toArray($user)['instance'] ?? [];

            return $n->type === 'user.instance.create_staging_failed'
                && $n->application->id === $stagingId
                && $n->application->staging_of_id === $parent->id
                && ($instance['id'] ?? null) === $stagingId
                && ($instance['staging'] ?? null) === $parent->id
                && $n->payload['message'] === 'rsync failed';
        });
        // The probe-shaped failure path sends exactly one notification.
        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
    }

    public function test_a_lost_staging_notification_survives_queue_serialization(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $stagingId = 987654;

        $staging = new Application;
        $staging->forceFill([
            'id' => $stagingId,
            'staging_of_id' => $parent->id,
            'status' => 'failed',
            'staging_create_failed_at' => now(),
        ]);
        $staging->setRelation('stagingOf', $parent);

        $notification = new ApplicationNotification($staging, 'user.instance.create_staging_failed', ['message' => 'gone'], true);
        $restored = unserialize(serialize($notification));

        // The unsaved staging cannot be restored from an id, so the notification
        // must carry it through the queue.
        $this->assertInstanceOf(ApplicationNotification::class, $restored);
        $this->assertSame($stagingId, $restored->application->id);
        $this->assertSame($parent->id, $restored->application->staging_of_id);
        $this->assertSame($stagingId, $restored->toArray($user)['instance']['id'] ?? null);
    }

    public function test_a_deleted_staging_row_without_a_parent_notifies_nobody(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);
        $stagingId = $staging->id;
        $staging->delete();
        // Orphan cleanup: the parent is gone too, so there is nobody left to
        // end a spinner for.
        $parent->delete();

        Notification::fake();
        Queue::fake();

        (new WatchStagingJob($stagingId, taskId: 7, parentId: $parent->id))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertNothingSent();
    }

    public function test_engine_5xx_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'boom'], 500)]);

        $startedAt = now()->getTimestamp() - 10;
        $this->runOnce($staging, startedAt: $startedAt);

        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->id
            && $job->hiccupAttempt === 1
            // A 5xx re-dispatch keeps the original window too.
            && $job->startedAt === $startedAt);
    }

    #[DataProvider('showClientErrorStatuses')]
    public function test_a_non_404_client_error_from_show_keeps_the_failed_marker_unset(int $status): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);
        // The copy really started, so the creating marker must be cleared.
        $staging->update(['staging_creating_at' => now(), 'status' => 'pending']);

        Notification::fake();
        Queue::fake();
        // Defensive (not an Engine shape): the Engine's `GET /projects/{u}` answers only 200 or 404 (UserController::show); a 4xx is exercised to prove the watcher never sets the confirmed-failure marker for it.
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'nope'], $status)]);

        $this->runOnce($staging);

        $fresh = $staging->fresh();
        // A non-404 4xx did not prove the copy failed: the row is failed, the
        // creating marker ends and the failed marker stays unset so the delete
        // still reaches the Engine.
        $this->assertSame('failed', $fresh->status);
        $this->assertNull($fresh->staging_creating_at);
        $this->assertNull($fresh->staging_create_failed_at);
        Queue::assertNotPushed(WatchStagingJob::class);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id);
    }

    /** @return array<string, array{int}> */
    public static function showClientErrorStatuses(): array
    {
        return ['conflict' => [409], 'validation' => [422]];
    }

    #[DataProvider('nonEngineTerminalStatuses')]
    public function test_a_non_engine_terminal_status_does_not_end_the_watcher(string $status): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        Queue::fake();
        // Defensive (not an Engine shape): the Engine writes only running/completed/failed (Models/User.php:makePendingStaging, System/Projects.php:249,272); a legacy success/error must keep polling instead of ending the watcher.
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => $status]],
        ]])]);

        $startedAt = now()->getTimestamp() - 10;
        (new WatchStagingJob($staging->id, startedAt: $startedAt))->handle(
            app(ApplicationSynchronizer::class),
        );

        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->startedAt === $startedAt);
        Notification::assertNothingSent();
    }

    /** @return array<string, array{string}> */
    public static function nonEngineTerminalStatuses(): array
    {
        return ['success' => ['success'], 'error' => ['error']];
    }

    public function test_the_wall_clock_cap_fails_the_staging_copy(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'running']],
        ]])]);

        (new WatchStagingJob(
            $staging->id,
            startedAt: now()->getTimestamp() - WatchStagingJob::WALL_CLOCK_SECONDS,
        ))->handle(app(ApplicationSynchronizer::class));

        // The cap ends the spinner instead of re-dispatching forever;
        // with Queue::fake the re-dispatch is observable, so this fails rather
        // than hangs.
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id
            && $n->payload['message'] === 'The staging copy did not finish in time.');
        Queue::assertNotPushed(WatchStagingJob::class);
    }

    public function test_the_failed_hook_always_notifies(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);
        // A copy that is still marked creating when a crash ends the watcher.
        $staging->update(['staging_creating_at' => now()]);

        Notification::fake();

        (new WatchStagingJob($staging->id))->failed();

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.create_staging_failed'
            && $n->application->id === $staging->id);
        // The creating marker must not pin the row forever, and the failed one
        // must not be set (the Engine never confirmed it): the row is marked
        // failed without it, so a delete still reaches the Engine.
        $this->assertNull($staging->fresh()->staging_creating_at);
        $this->assertNull($staging->fresh()->staging_create_failed_at);
        $this->assertSame('failed', $staging->fresh()->status);
    }

    public function test_the_wall_clock_cap_ends_the_creating_marker_without_the_failed_marker(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);
        // The watcher is running (the copy really did start), so the row carries
        // the creating marker the cap must clear.
        $staging->update(['staging_creating_at' => now(), 'status' => 'pending']);

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'running']],
        ]])]);

        (new WatchStagingJob(
            $staging->id,
            startedAt: now()->getTimestamp() - WatchStagingJob::WALL_CLOCK_SECONDS,
        ))->handle(app(ApplicationSynchronizer::class));

        // The cap did not prove the copy failed, so it must not set
        // `staging_create_failed_at`; only the Engine's own failure (or a 404)
        // may.
        $this->assertNull($staging->fresh()->staging_creating_at);
        $this->assertNull($staging->fresh()->staging_create_failed_at);
        $this->assertSame('failed', $staging->fresh()->status);
    }

    public function test_the_staleness_window_is_the_watcher_cap_plus_the_max_backoff(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        // Literal, so shrinking the window fails here.
        $this->assertSame(3660, WatchStagingJob::STALE_AFTER_SECONDS);

        Carbon::setTestNow('2026-10-10 10:00:00');
        // One second inside the window is still creating.
        $staging->forceFill(['staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS - 1)])->save();
        $this->assertTrue($staging->isStagingCreating());

        // At the window the watcher could have finished its cap plus one maximum
        // backoff, so the marker is stale.
        $staging->forceFill(['staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS)])->save();
        $this->assertFalse($staging->isStagingCreating());
        $this->assertFalse($staging->stagingCreationPending());

        Carbon::setTestNow();
    }

    public function test_a_lost_staging_text_carries_the_staging_name(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $stagingId = 987654;

        Notification::fake();
        Queue::fake();
        // Engine: core/app/Http/Resources/TaskResource.php:15 (task details.error).
        Http::fake(['engine.example.com/api/tasks/7' => Http::response(['data' => [
            'id' => 7,
            'status' => 'failed',
            'details' => ['error' => 'rsync failed'],
        ]])]);

        // The row was deleted mid-copy, so only the username the job carries can
        // name it in the text.
        (new WatchStagingJob($stagingId, taskId: 7, parentId: $parent->id, stagingUsername: 'site1-staging'))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use ($user): bool {
            $html = (string) ($n->toArray($user)['html_text'] ?? '');

            return $n->type === 'user.instance.create_staging_failed'
                && str_contains($html, 'site1-staging');
        });
    }

    public function test_a_lost_staging_text_falls_back_to_the_parent_name(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);
        $parent->forceFill(['name' => 'Parent Site'])->save();
        $stagingId = 987655;

        Notification::fake();
        Queue::fake();
        Http::fake();

        // An old serialized job without the username still names something
        // rather than rendering an empty text.
        (new WatchStagingJob($stagingId, parentId: $parent->id))->handle(
            app(ApplicationSynchronizer::class),
        );

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $n) use ($user): bool {
            $html = (string) ($n->toArray($user)['html_text'] ?? '');

            return $n->type === 'user.instance.create_staging_failed'
                && str_contains($html, 'Parent Site');
        });
    }

    public function test_the_watcher_continues_one_second_before_the_cap(): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Carbon::setTestNow('2026-10-10 10:00:00');
        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'running']],
        ]])]);

        (new WatchStagingJob(
            $staging->id,
            startedAt: now()->getTimestamp() - WatchStagingJob::WALL_CLOCK_SECONDS + 1,
        ))->handle(app(ApplicationSynchronizer::class));

        // At cap - 1 the copy still gets a chance to finish.
        Queue::assertPushed(WatchStagingJob::class);

        Carbon::setTestNow();
    }

    public function test_the_wall_clock_cap_is_one_hour(): void
    {
        // Literal, so lowering the cap or the probe interval fails here.
        $this->assertSame(3600, WatchStagingJob::WALL_CLOCK_SECONDS);
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function engineDownBackoffProvider(): array
    {
        return [
            'first hiccup' => [0, 3],
            'second hiccup' => [1, 6],
            'third hiccup' => [2, 12],
            'fourth hiccup' => [3, 24],
            'fifth hiccup' => [4, 48],
            'sixth hiccup caps at 60' => [5, 60],
        ];
    }

    #[DataProvider('engineDownBackoffProvider')]
    public function test_the_engine_down_backoff_doubles(int $attempt, int $expectedSeconds): void
    {
        $user = User::factory()->create();
        $staging = $this->staging($user);

        Carbon::setTestNow('2026-10-10 10:00:00');
        Queue::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        (new WatchStagingJob($staging->id, hiccupAttempt: $attempt, startedAt: now()->getTimestamp()))
            ->handle(app(ApplicationSynchronizer::class));

        Queue::assertPushed(WatchStagingJob::class, function (WatchStagingJob $job) use ($attempt, $expectedSeconds): bool {
            $delay = $job->delay instanceof \DateTimeInterface
                ? $job->delay->getTimestamp() - now()->getTimestamp()
                : -1;

            return $job->hiccupAttempt === $attempt + 1 && $delay === $expectedSeconds;
        });

        Carbon::setTestNow();
    }
}
