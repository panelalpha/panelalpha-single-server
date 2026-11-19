<?php

namespace App\Http\Presenters\Account;

use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;

/**
 * Shapes a stored notification the way the Client Area store expects:
 * id, type, data, read_at, created_at.
 */
final class NotificationPresenter
{
    /**
     * @return array<string, mixed>
     */
    public function present(DatabaseNotification $notification): array
    {
        return [
            'id' => $notification->id,
            // `databaseType()` stores the CA type.
            'type' => $notification->type,
            'data' => $notification->data,
            'read_at' => $notification->read_at?->toJSON(),
            'created_at' => $notification->created_at === null ? null : Carbon::parse($notification->created_at)->toJSON(),
        ];
    }
}
