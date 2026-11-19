<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A user deleted one of their projects in the Client Area. The old panel told
 * the admins directly (`App\Notifications\Admin\Instance\InstanceDeletedByUser`
 * in `User\InstanceController`); v1's Client Area must not know the paid admin
 * area, so {@see \PanelAlpha\ClientArea\Projects\ProjectService::announceUserDelete()}
 * dispatches this after the Engine and the mirror are clean and the (paid)
 * admin area sends the notification.
 */
final class ProjectDeletedByUser
{
    use Dispatchable;

    public function __construct(public readonly Application $application) {}
}
