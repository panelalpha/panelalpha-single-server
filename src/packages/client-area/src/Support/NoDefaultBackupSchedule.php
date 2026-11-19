<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\DefaultBackupSchedule;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The controller's answer: the panel has no schedule default, so a project
 * without one keeps the old midnight start. The Community edition binds its
 * Settings-backed answer over this.
 */
final class NoDefaultBackupSchedule implements DefaultBackupSchedule
{
    public function cronFor(Application $application): ?string
    {
        return null;
    }
}
