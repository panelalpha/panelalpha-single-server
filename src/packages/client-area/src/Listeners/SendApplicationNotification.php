<?php

namespace PanelAlpha\ClientArea\Listeners;

use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Notifications\ApplicationNotifier;

/**
 * Delivers a requested Client Area notification: the jobs and services fire
 * `ClientAreaNotificationRequested`,
 * and this listener hands it to the notifier, which writes the database row and
 * broadcasts it on the user's channel. The arguments are exactly what the P3a
 * controller listener passed, so the recipients and payload are unchanged
 *Notifications are a Client Area feature, so the controller
 * registers it itself.
 *
 * The event is dispatched synchronously; the notification itself is queued
 * (`ApplicationNotification` implements `ShouldQueue`).
 */
final class SendApplicationNotification
{
    public function __construct(private readonly ApplicationNotifier $notifier) {}

    public function handle(ClientAreaNotificationRequested $event): void
    {
        $this->notifier->send(
            $event->application,
            $event->type,
            $event->payload(),
            $event->isError,
            $event->includeInstance,
            $event->recipients,
        );
    }
}
