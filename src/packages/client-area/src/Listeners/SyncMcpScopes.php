<?php

namespace PanelAlpha\ClientArea\Listeners;

use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Events\ProjectMirrored;
use PanelAlpha\ClientArea\Events\ProjectsUnmirrored;
use PanelAlpha\ClientArea\Mcp\McpScopeSynchronizer;

/**
 * Queues the Connect AI scope sync when a user's projects may have changed
 *After a real sync of an Engine, after a new project row (created,
 * cloned or staged) and after rows left the mirror. Only users who own a token
 * are queued; the job itself calls the Engine.
 *
 * `ProjectMirrored` carries no Engine id, so a new row queues every token
 * owner; an owner whose scope did not change gets no `PUT`.
 */
final class SyncMcpScopes
{
    public function __construct(private readonly McpScopeSynchronizer $synchronizer) {}

    public function handle(EngineProjectsSynced|ProjectMirrored|ProjectsUnmirrored $event): void
    {
        if ($event instanceof ProjectMirrored) {
            // A re-mirrored known row changes no scope.
            if ($event->created) {
                $this->synchronizer->syncOwners();
            }

            return;
        }

        $this->synchronizer->syncOwners($event->engineId);
    }
}
