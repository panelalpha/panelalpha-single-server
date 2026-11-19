<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The project limit a single-server licence names, for the Client Area's
 * project creation: the old panel refused another project once the panel held
 * as many applications as the licence's `instance_limit`
 * (`User\InstanceController`, packages/api/app/Http/Controllers/User/
 * InstanceController.php:346-352 and the service limit
 * `Service::getInstanceLimit()`, app/Models/Service.php:1581-1603).
 *
 * Community has no licence: the controller's default sets none. The paid
 * Admin Area binds its own over the injected licensing client, and answers
 * none in Multi (the licence is `multi-server` there).
 */
interface LicenceProjectLimit
{
    /**
     * The licence's panel-wide project limit, or null when it names none (a
     * source build, a test, a licence without one, or Multi).
     */
    public function limit(): ?int;
}
