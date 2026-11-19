<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A project's main domain changed and the Engine rename was committed.
 * `DomainChangeService` fires it where it
 * used to delete the stale preview tunnel and run the WordPress search-replace
 * itself; the controller's `SearchReplaceOnDomainChange` listens (moved
 * from client-area-legacy, so the event is no longer a legacy
 * seam). The preview-tunnel listener was removed: the Engine's
 * rename deletes the old main domain row and its tunnels with it.
 *
 * Dispatched synchronously; it carries the model and the old/new domains.
 */
final class ProjectDomainChanged
{
    use Dispatchable;

    public function __construct(
        public readonly Application $application,
        public readonly ?string $oldDomain,
        public readonly string $newDomain,
    ) {}
}
