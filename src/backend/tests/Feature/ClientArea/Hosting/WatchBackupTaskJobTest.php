<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The backup `202 + task` watcher: it follows
 * the Engine task to its end, re-reads the backup and fires the old
 * `user.instance.backup.*` notification with the `backup` payload the CA renders
 * (`src/apis/Auth.js:408-416`).
 */
class WatchBackupTaskJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function engineBackup(int $id = 5, array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/BackupResource.php:12 -> BackupResource::toArray
        return array_merge([
            'id' => $id,
            'kind' => 'manual',
            'note' => null,
            'contents' => ['files' => true, 'databases' => true],
            'async_status' => ['backup' => 'completed'],
            'error' => null,
            'size_bytes' => 2048,
            'created_at' => '2026-10-10T12:00:00.000000Z',
            'items' => [],
        ], $overrides);
    }

    private function runJob(WatchBackupTaskJob $job): void
    {
        $job->handle();
    }

    public function test_a_completed_create_task_notifies_with_the_finished_backup(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
        Http::fake([
            'engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'completed', 'details' => ['action' => 'backup', 'backup_id' => 5]]]),
            'engine.example.com/api/projects/site1/backups/5' => Http::response(['data' => $this->engineBackup(5)]),
        ]);

        $this->runJob(new WatchBackupTaskJob(
            $application->id,
            7,
            5,
            'create',
            'user.instance.backup.create_finished',
            'user.instance.backup.create_failed',
            ['id' => 5],
        ));

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $notification): bool {
            return $notification->type === 'user.instance.backup.create_finished'
                && $notification->payload['backup']['id'] === 5
                && $notification->payload['backup']['async_status']['create'] === 'finished';
        });
    }

    public function test_a_failed_task_notifies_with_the_engine_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/7' => Http::response(['data' => [
            'id' => 7,
            'status' => 'failed',
            'details' => ['action' => 'backup', 'error' => 'Disk full'],
        ]])]);

        $this->runJob(new WatchBackupTaskJob(
            $application->id,
            7,
            5,
            'create',
            'user.instance.backup.create_finished',
            'user.instance.backup.create_failed',
            ['id' => 5],
        ));

        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $notification): bool {
            return $notification->type === 'user.instance.backup.create_failed'
                && $notification->isError === true
                && $notification->payload['message'] === 'Disk full';
        });
    }

    public function test_a_completed_delete_task_notifies_with_the_snapshot_and_never_reads_the_gone_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/9' => Http::response(['data' => [
            'id' => 9,
            'status' => 'completed',
            'details' => ['action' => 'delete', 'backup_id' => 5],
        ]])]);

        $this->runJob(new WatchBackupTaskJob(
            $application->id,
            9,
            5,
            'delete',
            'user.instance.backup.delete_finished',
            'user.instance.backup.delete_failed',
            ['id' => 5, 'type' => 'manual'],
        ));

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/backups/5'));
        Notification::assertSentTo($user, ApplicationNotification::class, function (ApplicationNotification $notification): bool {
            return $notification->type === 'user.instance.backup.delete_finished'
                && $notification->payload['backup']['id'] === 5;
        });
    }

    public function test_an_engine_hiccup_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/api/tasks/7' => fn () => throw new ConnectionException('down')]);
        Queue::fake();

        $this->runJob(new WatchBackupTaskJob(
            $application->id,
            7,
            5,
            'create',
            'user.instance.backup.create_finished',
            'user.instance.backup.create_failed',
            ['id' => 5],
        ));

        Queue::assertPushed(WatchBackupTaskJob::class, fn (WatchBackupTaskJob $job): bool => $job->hiccupAttempt === 1
            && $job->taskId === 7);
    }

    public function test_the_wall_clock_cap_fails_the_notification(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'running', 'details' => []]])]);

        $this->runJob(new WatchBackupTaskJob(
            $application->id,
            7,
            5,
            'create',
            'user.instance.backup.create_finished',
            'user.instance.backup.create_failed',
            ['id' => 5],
            startedAt: now()->getTimestamp() - (WatchBackupTaskJob::WALL_CLOCK_SECONDS + 1),
        ));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $notification): bool => $notification->type === 'user.instance.backup.create_failed');
    }
}
