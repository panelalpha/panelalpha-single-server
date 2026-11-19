<?php

namespace PanelAlpha\ClientArea\Notifications;

use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Sends a Client Area notification about an application to everyone who should
 * hear about it (AccessResolver::usersFor) – Community: the single user, Pro/Multi:
 * the owner plus shared users. The place where "who gets notified" is decided,
 * so features never call notify() themselves.
 *
 * Jobs and services never call it: they fire the
 * `ClientAreaNotificationRequested` event, and the controller's
 * `SendApplicationNotification` listener delivers through this class.
 */
final class ApplicationNotifier
{
    public function __construct(private readonly AccessResolver $access) {}

    /**
     * @param  array<string, mixed>  $payload  extra fields (backup, plugin, theme…)
     * @param  Application|null  $recipients  who hears about it when that differs from
     *         the presented resource (a staging whose row is gone is presented as
     *         itself, but its parent owns the recipients)
     */
    public function send(
        Application $application,
        string $type,
        array $payload = [],
        bool $isError = false,
        bool $includeInstance = true,
        ?Application $recipients = null,
    ): void {
        $notification = new ApplicationNotification($application, $type, $this->sanitizePayload($payload), $isError, $includeInstance);

        foreach ($this->access->usersFor($recipients ?? $application) as $user) {
            $user->notify($notification);
        }
    }

    /**
     * The Engine's own message reaches the CA only through the sanitiser: a raw
     * unzip output or a `/home/…`/`/var/lib/panelalpha/…` text must not appear in
     * a notification's `html_text` or payload. A known refusal (a pending
     * project, a refused key, a PHP error) becomes its friendly sentence first.
     * The full text is logged once.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function sanitizePayload(array $payload): array
    {
        $message = Payload::nullableString($payload['message'] ?? null);
        if ($message !== null && $message !== '') {
            $payload['message'] = EngineText::present($message);
        }

        return $payload;
    }
}
