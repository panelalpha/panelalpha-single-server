<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A project domain was deleted on the Engine (the CA's
 * `ServerAccountService::deleteDomain()` or the admin
 * `ServiceDomainController::destroy()`). Dispatched after the Engine call;
 * the seam for the paid DNS and e-mail hooks, the old
 * `RemoteDomainDeleted` → `AutoDeleteDnsZone` / `AutoDeleteEmailDomain`.
 *
 * A paid seam: the paid edition listens for it to
 * create the domain's DNS zone and e-mail domain.
 */
final class ProjectDomainDeleted
{
    use Dispatchable;

    public function __construct(
        public readonly Application $application,
        public readonly string $domain,
        public readonly string $type,
    ) {}
}
