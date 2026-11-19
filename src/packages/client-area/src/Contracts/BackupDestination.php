<?php

namespace PanelAlpha\ClientArea\Contracts;

use PanelAlpha\ClientArea\Models\Application;

/**
 * Where a project's backups go: the Engine
 * backup container a manual backup and the automatic-backup schedule use, and
 * how many automatic backups the schedule keeps.
 *
 * The controller's default (`Hosting\FirstEngineBackupContainer`) is the first
 * container the Engine lists and the Engine's own retention. The paid Admin
 * Area binds its container rules (the old `Application::matchBackupContainer()`:
 * instance, service, client, plan, server, server group) and the matched
 * container's or the plan's automatic-backup limit.
 */
interface BackupDestination
{
    /**
     * The Engine container for the project's backups – its id (or name) as the
     * Engine's `container` field takes it – or null when the Engine has none.
     */
    public function containerFor(Application $application): ?string;

    /**
     * The number of scheduled backups the Engine keeps (its `keep_last`,
     * 1–365), or null for the Engine's default.
     */
    public function keepLastFor(Application $application): ?int;
}
