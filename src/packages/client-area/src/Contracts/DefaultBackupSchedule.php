<?php

namespace PanelAlpha\ClientArea\Contracts;

use PanelAlpha\ClientArea\Models\Application;

/**
 * The schedule a project without one starts from: the Engine's UTC cron the
 * panel would give it. The Client Area's automatic-backup dialog opens at that
 * time, so a project with no schedule is not offered midnight.
 *
 * The controller's default answers none ({@see \PanelAlpha\ClientArea\Support\NoDefaultBackupSchedule}),
 * and the dialog keeps the old midnight start. The Community edition binds
 * `SettingsDefaultBackupSchedule`: the hour of Settings > Backups and the
 * project's own minute, the cron `ApplyNewProjectBackupSchedules` creates.
 */
interface DefaultBackupSchedule
{
    /**
     * The Engine cron (`minute hour day-of-month month day-of-week`, UTC) a
     * project without a schedule starts from, or null when the panel has no
     * default.
     */
    public function cronFor(Application $application): ?string;
}
