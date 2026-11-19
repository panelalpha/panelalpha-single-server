<?php

namespace Tests\Feature\ClientArea\Events;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Controller jobs and services
 * request a Client Area notification through ClientAreaNotificationRequested
 * instead of calling `ApplicationNotifier::send()` directly. The listener the
 * controller provider registers delivers it, so the existing behaviour tests
 * (WatchApplicationTaskJobTest::test_a_finished_task_notifies_success_and_resyncs,
 * NotificationBroadcastTest, …) stay green unchanged.
 *
 * The old direct calls are the `ApplicationNotifier::send()` sites in
 * `src/Jobs/**` and `src/Projects/GitService.php`; each now fires the event.
 * `Event::fake` is only used here (the new firing tests), never in the
 * behaviour tests.
 *
 * @see src/Jobs/Application/AttachGitSourceJob.php
 * @see src/Jobs/Application/WatchBackupTaskJob.php
 * @see src/Jobs/Application/WatchStagingJob.php
 * @see src/Projects/GitService.php
 */
class ClientAreaNotificationRequestedTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_a_failed_git_attach_requests_the_notification_event(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        Event::fake([ClientAreaNotificationRequested::class]);

        // AttachGitSourceJob::failed() used to call
        // app(ApplicationNotifier::class)->send($application, $this->failedType,
        // ['message' => 'The git source attach stopped.'], isError: true).
        (new AttachGitSourceJob($application->id, [], 'user.instance.installation_finished', 'user.instance.installation_failed'))->failed();

        Event::assertDispatched(
            ClientAreaNotificationRequested::class,
            fn (ClientAreaNotificationRequested $event): bool => $event->application->is($application)
                && $event->type === 'user.instance.installation_failed'
                && $event->message === 'The git source attach stopped.'
                && $event->extra === []
                && $event->isError === true
                && $event->includeInstance === true
                && $event->recipients === null,
        );
    }

    public function test_a_backup_failure_requests_the_event_with_the_backup_payload(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        Event::fake([ClientAreaNotificationRequested::class]);

        // WatchBackupTaskJob::failed() used to call
        // app(ApplicationNotifier::class)->send($application, $this->failedType,
        // ['backup' => $this->snapshot, 'message' => 'The backup watcher stopped.'],
        // isError: true, includeInstance: false).
        (new WatchBackupTaskJob($application->id, 1, 2, 'create', 'user.instance.backup.create_finished', 'user.instance.backup.create_failed', ['id' => 2]))->failed();

        Event::assertDispatched(
            ClientAreaNotificationRequested::class,
            fn (ClientAreaNotificationRequested $event): bool => $event->application->is($application)
                && $event->type === 'user.instance.backup.create_failed'
                && $event->message === 'The backup watcher stopped.'
                && $event->extra === ['backup' => ['id' => 2]]
                && $event->isError === true
                && $event->includeInstance === false,
        );
    }

    public function test_a_lost_staging_requests_the_event_with_the_parent_as_recipients(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);

        Event::fake([ClientAreaNotificationRequested::class]);

        // WatchStagingJob::notifyParentOfLostStaging() used to call
        // app(ApplicationNotifier::class)->send($staging, self::FAILED_TYPE,
        // ['message' => $message], isError: true, recipients: $parent).
        (new WatchStagingJob(999999, parentId: $parent->id, stagingUsername: 'ghost'))->handle(
            app(ApplicationSynchronizer::class),
        );

        Event::assertDispatched(
            ClientAreaNotificationRequested::class,
            fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.create_staging_failed'
                && $event->message === 'The staging project is gone.'
                && $event->isError === true
                && $event->recipients !== null
                && $event->recipients->is($parent)
                // The presented resource is the lost staging, not the parent.
                && $event->application->id === 999999,
        );
    }
}
