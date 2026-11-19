<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Notifications\DatabaseNotification;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The host's stored notification (the `notifications` table it owns). Prunable
 * so the scheduler keeps the bell bounded; the
 * TTL is the host's `notifications.retention_days`.
 */
class Notification extends DatabaseNotification
{
    use Prunable;

    /**
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        $days = Payload::int(config('notifications.retention_days')) ?? 90;

        return static::query()->where('created_at', '<', now()->subDays($days));
    }
}
