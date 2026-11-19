<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A project domain was created on the Engine (the CA's
 * `ServerAccountService::createDomain()` or the admin
 * `ServiceDomainController::store()`). Dispatched after the Engine call;
 * the seam for the paid DNS and e-mail hooks: the old panel
 * created the zone and the e-mail domain in the control-panel account flow.
 *
 * A paid seam: the paid edition listens for it to
 * create the domain's DNS zone and e-mail domain.
 */
final class ProjectDomainCreated
{
    use Dispatchable;

    public function __construct(
        public readonly Application $application,
        public readonly string $domain,
        public readonly string $type,
    ) {}
}
