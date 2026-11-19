<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * One Engine's project list finished a real sync. `SyncEnginesJob` fires it
 * after every `syncIfStale()` that read the Engine. It is no longer a legacy seam: client-area-legacy's
 * `RefreshUsageCache` listener left with the panel's usage cache (project
 * usage comes from the Engine), and the panel listens to it from
 * the controller (`SyncMcpScopes`, Connect AI scopes).
 *
 * Dispatched synchronously; it carries only the Engine id.
 */
final class EngineProjectsSynced
{
    use Dispatchable;

    public function __construct(public readonly int $engineId) {}
}
