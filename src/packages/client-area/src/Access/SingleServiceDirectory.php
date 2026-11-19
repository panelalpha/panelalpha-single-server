<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\VirtualService;

/**
 * Community's one virtual service (`VirtualService::ID`, plan "Default",
 * unlimited): every project belongs to it.
 */
final class SingleServiceDirectory implements ServiceDirectory
{
    public function forUser(Authenticatable $user): array
    {
        return [self::service()];
    }

    public function findForUser(Authenticatable $user, int $id): ?HostingService
    {
        return $id === VirtualService::ID ? self::service() : null;
    }

    public function ofApplication(Application $application): HostingService
    {
        return self::service();
    }

    public function applicationsOf(HostingService $service, array $applications): array
    {
        return $service->id === VirtualService::ID ? $applications : [];
    }

    private static function service(): HostingService
    {
        return new HostingService(VirtualService::ID, VirtualService::PLAN_NAME);
    }
}
