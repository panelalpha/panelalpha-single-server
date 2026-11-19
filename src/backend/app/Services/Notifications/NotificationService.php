<?php

namespace App\Services\Notifications;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * The Client Area notification bell. Notifications are
 * stored by the database channel; filtering lives here, the
 * row shape in `App\Http\Presenters\Account\NotificationPresenter`.
 */
final class NotificationService
{
    /**
     * @return LengthAwarePaginator<int, \Illuminate\Notifications\DatabaseNotification>
     */
    public function paginate(User $user, int $perPage): LengthAwarePaginator
    {
        return $user->notifications()
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    public function delete(User $user, string $id): void
    {
        $user->notifications()->whereKey($id)->delete();
    }

    public function markAsRead(User $user, mixed $readAt): void
    {
        $user->unreadNotifications()
            ->where('created_at', '<=', $readAt)
            ->update(['read_at' => $readAt]);
    }

    public function clear(User $user, mixed $deleteAt): void
    {
        $user->notifications()
            ->where('created_at', '<=', $deleteAt)
            ->delete();
    }

}
