<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * Rows of one Engine left the `applications` mirror: a project deleted through
 * the panel (`ProjectService::delete()`) or gone from the Engine's list
 * (`ApplicationSynchronizer::sync()`). The controller's `SyncMcpScopes`
 * listener takes the projects out of their owners' Connect AI token scopes.
 *
 * Dispatched synchronously, after the rows are gone; it carries only the
 * Engine id, because the user ↔ project links went with the rows.
 */
final class ProjectsUnmirrored
{
    use Dispatchable;

    public function __construct(public readonly int $engineId) {}
}
