<?php

namespace PanelAlpha\Community\Backups;

use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\BackupsApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * Saves the one active backup store: tested on a temporary Engine container
 * first, then created (or, for a `local` store at the same place, reused).
 *
 * A store's location is never moved and a remote container is never updated:
 * host, region and endpoint live in credentials the Engine does not return, so
 * two remote stores cannot be told apart, and changing one would orphan the
 * backups already in it. A changed store is therefore a new container.
 *
 * A container this panel made is deleted when the owner removes the store or
 * changes it and nothing uses the old one any more; the Engine answers 409
 * while a schedule or a backup still does, and the container then stays - and
 * stays recorded as the panel's, so a later removal deletes it. A container the
 * panel only reused is never deleted (another panel or the server's operator
 * may own it).
 */
final class BackupStoreManager
{
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly BackupDefaults $defaults,
    ) {}

    /**
     * @param  array{driver: string, location: string, credentials?: array<string, string|int|bool|null>|null}  $store  validated BackupStoreRequest
     * @return array{container: array<string, mixed>, cleanup: array{id: int, container: string, reason: string|null}|null}  the Engine container resource and what became of the previous one
     *
     * @throws ValidationException
     */
    public function save(array $store): array
    {
        $api = $this->api();
        $fields = $this->fields($store);
        $previous = $this->defaults->storeId();
        $previousCreated = $previous !== null && $this->defaults->createdByPanel($previous);

        $this->test($api, $fields);

        $container = $fields['driver'] === 'local' ? $this->existingLocal($api, $fields['location']) : null;
        $created = $container === null;
        if ($container === null) {
            try {
                $container = $api->createContainer(['name' => 'panel-'.$fields['driver'].'-'.date('YmdHis').'-'.Str::lower(Str::random(4))] + $fields);
            } catch (EngineValidationException $e) {
                throw ValidationException::withMessages(['store' => [EngineErrors::message($e)]]);
            }
        }

        $id = Payload::int($container['id'] ?? null);
        if ($id === null) {
            throw ValidationException::withMessages(['store' => ['The Engine did not create the backup store.']]);
        }
        // A reused store this panel made earlier stays the panel's to delete.
        $this->defaults->rememberStore($id, $created);

        $cleanup = $previous !== null && $previous !== $id && $previousCreated ? $this->discard($api, $previous) : null;
        if ($previous !== null && $cleanup !== null && $cleanup['container'] === 'deleted') {
            $this->defaults->forgetCreatedStore($previous);
        }

        return [
            'container' => $container,
            'cleanup' => $cleanup,
        ];
    }

    /**
     * Go back to the store the Engine uses when the panel chooses none: forget
     * the choice and delete the container this panel made when nothing uses it.
     *
     * @return array{id: int, container: string, reason: string|null}|null
     */
    public function remove(): ?array
    {
        $id = $this->defaults->storeId();
        $created = $this->defaults->createdByPanel();
        $this->defaults->forgetStore();
        if ($id === null) {
            return null;
        }
        if (! $created) {
            return ['id' => $id, 'container' => 'kept', 'reason' => 'not_ours'];
        }

        $cleanup = $this->discard($this->api(), $id);
        if ($cleanup['container'] === 'deleted') {
            $this->defaults->forgetCreatedStore($id);
        }

        return $cleanup;
    }

    /**
     * Whether the owner chose a store (the Engine's own store is not a choice).
     */
    public function selected(): bool
    {
        return $this->defaults->storeId() !== null;
    }

    /**
     * Whether the chosen store's container is one this panel made.
     */
    public function createdHere(): bool
    {
        return $this->defaults->storeId() !== null && $this->defaults->createdByPanel();
    }

    /**
     * The active store: the saved one while the Engine lists it, else the
     * Engine's default, else the first.
     *
     * @return array{id: int, name: string, driver: string, location: string}|null
     */
    public function current(): ?array
    {
        $container = SettingsBackupDestination::pick($this->api()->containers(), $this->defaults->storeId());
        $id = Payload::int($container['id'] ?? null);
        if ($container === null || $id === null) {
            return null;
        }

        return [
            'id' => $id,
            'name' => Payload::string($container['name'] ?? ''),
            'driver' => Payload::string($container['driver'] ?? ''),
            'location' => Payload::string($container['location'] ?? ''),
        ];
    }

    /**
     * Write and remove a probe on a temporary container; the container never
     * outlives the call.
     *
     * @param  array{driver: 'local'|'s3'|'ftp'|'ftps'|'sftp', location: string, credentials?: array<string, string|int|bool>}  $fields
     *
     * @throws ValidationException
     */
    private function test(BackupsApi $api, array $fields): void
    {
        $probeId = null;
        try {
            $created = $api->createContainer(['name' => 'panel-store-test-'.Str::lower(Str::random(12))] + $fields);
            $probeId = Payload::int($created['id'] ?? null);
            if ($probeId === null) {
                throw ValidationException::withMessages(['store' => ['The Engine did not create the backup store.']]);
            }
            $api->testContainer($probeId);
        } catch (EngineValidationException $e) {
            throw ValidationException::withMessages(['store' => [EngineErrors::message($e)]]);
        } finally {
            if ($probeId !== null) {
                try {
                    $api->deleteContainer($probeId);
                } catch (EngineException $e) {
                    report($e);
                }
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function existingLocal(BackupsApi $api, string $location): ?array
    {
        foreach ($api->containers() as $container) {
            if (($container['driver'] ?? null) === 'local' && ($container['location'] ?? null) === $location) {
                return $container;
            }
        }

        return null;
    }

    /**
     * Delete a container this panel made. The Engine's 409 keeps one a schedule
     * or a backup still uses; a container that is already gone counts as
     * deleted.
     *
     * @return array{id: int, container: string, reason: string|null}
     */
    private function discard(BackupsApi $api, int $id): array
    {
        try {
            $api->deleteContainer($id);

            return ['id' => $id, 'container' => 'deleted', 'reason' => null];
        } catch (EngineRequestException $e) {
            // The Engine can remove the container and still fail the answer (a
            // 404 for an id that is gone, or a 500 after its row went).
            if (! $this->listed($api, $id)) {
                return ['id' => $id, 'container' => 'deleted', 'reason' => null];
            }
            if ($e->engineStatus !== 409) {
                report($e);
            }

            return ['id' => $id, 'container' => 'kept', 'reason' => $e->engineStatus === 409 ? 'in_use' : 'error'];
        } catch (EngineException $e) {
            if (! $this->listed($api, $id)) {
                return ['id' => $id, 'container' => 'deleted', 'reason' => null];
            }
            report($e);

            return ['id' => $id, 'container' => 'kept', 'reason' => 'error'];
        }
    }

    private function listed(BackupsApi $api, int $id): bool
    {
        try {
            foreach ($api->containers() as $container) {
                if (Payload::int($container['id'] ?? null) === $id) {
                    return true;
                }
            }
        } catch (EngineException $e) {
            // An Engine that cannot be asked may still hold the container.
            report($e);

            return true;
        }

        return false;
    }

    /**
     * The Engine's container fields for the validated store payload; empty
     * credentials are dropped, the Engine takes only what is set.
     *
     * @param  array{driver: string, location: string, credentials?: array<string, string|int|bool|null>|null}  $store
     * @return array{driver: 'local'|'s3'|'ftp'|'ftps'|'sftp', location: string, credentials?: array<string, string|int|bool>}
     */
    private function fields(array $store): array
    {
        $driver = match ($store['driver']) {
            's3' => 's3',
            'ftp' => 'ftp',
            'ftps' => 'ftps',
            'sftp' => 'sftp',
            default => 'local',
        };
        if ($driver === 'local') {
            return ['driver' => 'local', 'location' => $store['location']];
        }

        $credentials = [];
        foreach ($store['credentials'] ?? [] as $key => $value) {
            if ($value !== null && $value !== '') {
                $credentials[$key] = $value;
            }
        }

        return ['driver' => $driver, 'location' => $store['location'], 'credentials' => $credentials];
    }

    private function api(): BackupsApi
    {
        return new BackupsApi($this->engines->forEngine($this->engines->defaultEngineId()));
    }
}
