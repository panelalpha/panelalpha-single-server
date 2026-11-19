<?php

namespace PanelAlpha\Community\Backups;

use PanelAlpha\ClientArea\Contracts\BackupDestination;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\BackupsApi;

/**
 * The Community panel's backup destination: the store saved in Settings while the
 * Engine still lists it, else the store the Engine names as its default (the
 * install creates one), else the first container (an Engine before 2.3 has no
 * default), else none.
 *
 * Retention: the Engine prunes scheduled backups above `keep_last`, so a card
 * edit keeps the project's current value and never lowers it; the Settings
 * value only seeds a project that has no schedule yet.
 */
final class SettingsBackupDestination implements BackupDestination
{
    public function __construct(private readonly BackupDefaults $defaults) {}

    public function containerFor(Application $application): ?string
    {
        return self::resolve((new BackupsApi($application->engine()))->containers(), $this->defaults->storeId());
    }

    public function keepLastFor(Application $application): int
    {
        $schedule = (new BackupsApi($application->engine()))->schedule($application->engineProject());
        $current = $schedule === null ? null : Payload::int($schedule['keep_last'] ?? null);

        return $current ?? $this->defaults->keepLast();
    }

    /**
     * The container to use out of the Engine's list: the saved one, else the
     * Engine's default, else the first (the list is ordered by name, so that is
     * only a fallback for an Engine without a default).
     *
     * @param  list<array<string, mixed>>  $containers
     * @return array<string, mixed>|null
     */
    public static function pick(array $containers, ?int $storedId): ?array
    {
        foreach ($containers as $container) {
            if ($storedId !== null && Payload::int($container['id'] ?? null) === $storedId) {
                return $container;
            }
        }

        foreach ($containers as $container) {
            if (Payload::bool($container['default'] ?? null) === true) {
                return $container;
            }
        }

        return $containers[0] ?? null;
    }

    /**
     * @param  list<array<string, mixed>>  $containers
     */
    public static function resolve(array $containers, ?int $storedId): ?string
    {
        $id = Payload::int(self::pick($containers, $storedId)['id'] ?? null);

        return $id === null ? null : (string) $id;
    }
}
