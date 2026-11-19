<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;

/**
 * PUT /projects/{id}/dns/alerts/enable|disable (old DnsController::enableAlerts
 * / disableAlerts, packages/api/app/Http/Controllers/User/Instance/
 * DnsController.php:29-61, no privilege): the CA's DNS badge dismiss flag
 * (`DnsSslIndicator.vue:377`), stored on the project and presented as
 * `details.dns_alerts_enabled` (`Instances.js:441`). Panel-side on purpose:
 * the Engine needs no DNS alerting, as the old panel never alerted.
 */
final class DnsAlertsController extends Controller
{
    public function enable(Application $application): JsonResponse
    {
        return $this->set($application, true);
    }

    public function disable(Application $application): JsonResponse
    {
        return $this->set($application, false);
    }

    private function set(Application $application, bool $enabled): JsonResponse
    {
        $application->forceFill(['dns_alerts_enabled' => $enabled])->save();

        return response()->json(['data' => $enabled]);
    }
}
