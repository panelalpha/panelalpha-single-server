<?php

namespace PanelAlpha\ClientArea\Hosting;

use PanelAlpha\ClientArea\Contracts\BackupDestination;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\BackupsApi;

/**
 * The controller's backup destination: the
 * Engine resource has no `enabled` flag (`BackupContainerResource.php:15-24`),
 * so the first container the project's Engine lists (the Engine orders by
 * name) is used, with the Engine's default retention.
 */
final class FirstEngineBackupContainer implements BackupDestination
{
    public function containerFor(Application $application): ?string
    {
        $containers = (new BackupsApi($application->engine()))->containers();
        if ($containers === []) {
            return null;
        }

        $id = Payload::int($containers[0]['id'] ?? null);

        return $id !== null ? (string) $id : Payload::string($containers[0]['name'] ?? null);
    }

    public function keepLastFor(Application $application): ?int
    {
        return null;
    }
}
