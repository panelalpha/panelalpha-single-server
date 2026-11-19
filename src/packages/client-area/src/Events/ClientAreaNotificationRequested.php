<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A Client Area notification about one application was requested. Jobs and
 * services fire this instead of calling `ApplicationNotifier::send`; the
 * controller's own `SendApplicationNotification` listener delivers it through
 * the notifier.
 *
 * The event is dispatched synchronously (no queued listener): it carries plain
 * values plus the application model and is never serialized.
 */
final class ClientAreaNotificationRequested
{
    use Dispatchable;

    /**
     * @param  array<string, mixed>  $extra  extra payload fields (backup, plugin, theme…)
     * @param  bool  $isError  the notification's error flag (old `send()` argument)
     * @param  bool  $includeInstance  whether the presented instance is included (old `send()` argument)
     * @param  Application|null  $recipients  the recipient owner when it differs from `$application` (old `send()` argument)
     */
    public function __construct(
        public readonly Application $application,
        public readonly string $type,
        public readonly ?string $message = null,
        public readonly array $extra = [],
        public readonly bool $isError = false,
        public readonly bool $includeInstance = true,
        public readonly ?Application $recipients = null,
    ) {}

    /**
     * The exact payload `ApplicationNotifier::send()` received: the extra
     * fields plus the message under its old key.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        if ($this->message === null) {
            return $this->extra;
        }

        return array_merge($this->extra, ['message' => $this->message]);
    }
}
