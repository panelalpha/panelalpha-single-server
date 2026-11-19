<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;

/**
 * A Client Area user who can receive panel notifications and websocket
 * broadcasts. Every edition's configured user model implements
 * it: the host's `App\Models\User` uses Laravel's `Notifiable` trait and adds
 * `receivesBroadcastNotificationsOn()` (`app/Models/User.php:56`).
 *
 * `AccessResolver::usersFor()` returns these, so the notification and event
 * code does not have to guess what the framework's `Authenticatable` contract
 * leaves out.
 */
interface PanelUser extends Authenticatable
{
    /**
     * The private channel the Client Area subscribes to.
     */
    public function receivesBroadcastNotificationsOn(): string;

    /**
     * @param  mixed  $notification
     * @return mixed
     */
    public function notify($notification);
}
