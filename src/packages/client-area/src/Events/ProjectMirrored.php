<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * One Engine project was mirrored into the `applications` table. `$created` is
 * true for a row seen for the first time; the controller's `SyncMcpScopes`
 * follows a new row.
 *
 * Dispatched synchronously; it carries only the panel id.
 */
final class ProjectMirrored
{
    use Dispatchable;

    public function __construct(
        public readonly int $applicationId,
        public readonly bool $created,
    ) {}
}
