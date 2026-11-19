<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Hosting\DomainProbe;

/**
 * The SSL certificate of the project's URL
 * (`ssl/certificate/detected-by-url`): the certificate the project's own domain
 * really serves, from the Engine's `ssl-check`, with its validity verdict
 * (`status`, `valid`, `expires_at`, `days_remaining`, `points_here`,
 * `serves_installed`) – never a panel-side TLS handshake. Moved to
 * legacy with the probe.
 *
 * Permanent panel code: every certificate read goes through the Engine's
 * `ssl-check` and the reachability probe stays panel-side, so it moved from
 * client-area-legacy into the controller.
 */
final class InstanceSslController extends Controller
{
    public function __construct(private readonly DomainProbe $probe) {}

    public function detectedByUrl(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->probe->certificateForUrl($application)]);
    }
}
