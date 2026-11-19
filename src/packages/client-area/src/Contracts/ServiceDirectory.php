<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * The hosting services the Client Area shows (`/home` `user.services`,
 * `/services`, `/services/{service}/…`) and the service each project belongs to
 * (the project's `service_id`). Community answers its one virtual service
 * ({@see \PanelAlpha\ClientArea\Access\SingleServiceDirectory}, bound
 * with `bindIf()`); a paid edition binds its `services` table.
 */
interface ServiceDirectory
{
    /**
     * The user's services.
     *
     * @return list<HostingService>
     */
    public function forUser(Authenticatable $user): array;

    /**
     * One of the user's services, or null (the caller answers 404).
     */
    public function findForUser(Authenticatable $user, int $id): ?HostingService;

    /**
     * The service a project belongs to.
     */
    public function ofApplication(Application $application): HostingService;

    /**
     * The service's projects the user can see, from the user's projects.
     *
     * @param  list<Application>  $applications  the user's projects (ApplicationRepository::forUser)
     * @return list<Application>
     */
    public function applicationsOf(HostingService $service, array $applications): array;
}
