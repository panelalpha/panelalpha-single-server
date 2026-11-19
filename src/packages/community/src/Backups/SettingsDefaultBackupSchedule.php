<?php

namespace PanelAlpha\Community\Backups;

use PanelAlpha\ClientArea\Contracts\DefaultBackupSchedule;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The Community panel's schedule for a project that has none: the hour and the days
 * of Settings > Backups, and the project's own minute ({@see BackupDefaults::cronFor}),
 * the same cron the sweep gives a project the panel created.
 */
final class SettingsDefaultBackupSchedule implements DefaultBackupSchedule
{
    public function __construct(private readonly BackupDefaults $defaults) {}

    public function cronFor(Application $application): string
    {
        return $this->defaults->cronFor($application->engine_username);
    }
}
