<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\BroadcastNotificationCreated;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Listeners\QueueProjectScreenshot;
use PanelAlpha\ClientArea\Listeners\SendApplicationNotification;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Notifications\ApplicationNotifier;
use PanelAlpha\ClientArea\Support\EngineText;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Client Area notification delivery is a Client Area
 * feature, so `ApplicationNotification`, `ApplicationNotifier`, the
 * `SendApplicationNotification` listener and the `notifications` texts moved
 * from client-area-legacy into the controller. The
 * controller registers the listener of its own `ClientAreaNotificationRequested`
 * itself, so controller and
 * legacy jobs keep firing the event and the recipients, channels, database
 * payload and broadcast stay the same (`NotificationBroadcastTest`, the job
 * tests).
 *
 * Old names: the database channel stores the CA type in `notifications.type`
 * (`databaseType()`), never the class, and the host presents it as
 * a plain string (`app/Http/Presenters/Account/NotificationPresenter.php:22`).
 * A queued notification serializes its class, though, so a
 * `SendQueuedNotifications` payload written before the move names
 * `PanelAlpha\ClientAreaLegacy\Notifications\ApplicationNotification`; legacy's
 * alias file maps that one name onto the controller class. The notifier and
 * the listener are never serialized and keep no legacy name.
 *
 * Contract: the CA receives the notification on `private-user.{gravatar_hash}`
 * (`packages/client-area/src/components/navbar/NotificationsManager.vue:10`)
 * and from the bell's `GET /notifications`; no Client Area request or Engine
 * call is made here.
 */
final class NotificationDeliveryTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const LEGACY_NOTIFICATION = 'PanelAlpha\\ClientAreaLegacy\\Notifications\\ApplicationNotification';

    /**
     * The controller listens to its own event exactly once: legacy no longer
     * registers a second listener, which would notify twice.
     */
    public function test_the_notification_names_a_nameless_staging_copy_after_its_parent(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user, 'twp1');
        $parent->forceFill(['name' => 'twp1'])->save();
        $make = fn (string $username, ?int $stagingOf): Application => Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_project_id' => random_int(100, 9999),
            'engine_username' => $username,
            'name' => null,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'type' => 'wordpress',
            'staging_of_id' => $stagingOf,
        ]);
        $staging = $make('twp18669', $parent->id);
        $plain = $make('plain', null);

        $text = fn ($app): string => (new ApplicationNotification($app->fresh(), 'user.instance.redeploy_failed'))->toArray($user)['html_text'];

        $this->assertSame('Redeployment of (staging) twp1 failed.', $text($staging));
        $this->assertSame('Redeployment of plain failed.', $text($plain));
        $this->assertSame('Redeployment of twp1 failed.', $text($parent));
    }

    public function test_the_controller_delivers_the_requested_notification_once(): void
    {
        $listeners = app('events')->getRawListeners()[ClientAreaNotificationRequested::class] ?? [];
        $this->assertCount(1, array_keys($listeners, SendApplicationNotification::class, true));
        // The controller's own listeners; an edition may add its own (Community's Hub monitoring events).
        $this->assertSame(
            [SendApplicationNotification::class, QueueProjectScreenshot::class],
            array_values(array_filter($listeners, static fn (mixed $listener): bool => is_string($listener) && str_starts_with($listener, 'PanelAlpha\\ClientArea\\'))),
        );

        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Notification::fake();

        ClientAreaNotificationRequested::dispatch($application, 'user.instance.redeploy_failed', message: 'Build failed.', isError: true);

        Notification::assertSentToTimes($user, ApplicationNotification::class, 1);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification): bool => $notification->type === 'user.instance.redeploy_failed'
                && $notification->isError
                && $notification->payload === ['message' => 'Build failed.']
                && $notification->toArray($user)['html_text'] === 'Redeployment of '.$application->name.' failed. Build failed.',
        );
    }

    public function test_an_installation_failure_with_a_php_error_reads_the_generic_detail(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Notification::fake();

        ClientAreaNotificationRequested::dispatch($application, 'user.instance.installation_failed', message: 'Call to undefined method WP_Migration::run()', isError: true);

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $notification): bool => $notification->payload === ['message' => EngineText::INTERNAL_ERROR_DETAIL]
                && $notification->toArray($user)['html_text'] === 'Installation of '.$application->name.' failed. '.EngineText::INTERNAL_ERROR_DETAIL,
        );
    }

    /**
     * The job payload as it was written before the move: the serialized
     * notification and the display name carry the client-area-legacy class.
     */
    private function underLegacyName(string $payload): string
    {
        $decoded = json_decode($payload, true);
        $this->assertIsArray($decoded);

        $command = (string) $decoded['data']['command'];
        $current = 'O:'.strlen(ApplicationNotification::class).':"'.ApplicationNotification::class.'"';
        $this->assertStringContainsString($current, $command);
        $decoded['data']['command'] = str_replace(
            $current,
            'O:'.strlen(self::LEGACY_NOTIFICATION).':"'.self::LEGACY_NOTIFICATION.'"',
            $command,
        );
        $decoded['displayName'] = self::LEGACY_NOTIFICATION;

        $legacy = (string) json_encode($decoded);
        $this->assertStringContainsString('ClientAreaLegacy', $legacy);
        $this->assertStringNotContainsString('ClientArea\\\\Notifications', $legacy);

        return $legacy;
    }
}
