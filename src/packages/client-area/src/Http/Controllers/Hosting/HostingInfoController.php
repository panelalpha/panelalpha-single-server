<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\ServerApi;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;

/**
 * Hosting endpoints that are not tied to one project:
 * the SSL provider list and the Engine metrics the CA's server graphs read.
 */
final class HostingInfoController extends Controller
{
    public function __construct(
        private readonly ServerAccountService $service,
        private readonly EngineResolver $engines,
    ) {}

    public function sslOffer(): JsonResponse
    {
        return response()->json(['data' => $this->service->sslOffer()]);
    }

    /**
     * GET /server/metrics/{period} – current | last-5-minutes | last-hour |
     * last-12-hours. The Engine serves the whole Engine, not one project.
     */
    public function metrics(string $period): JsonResponse
    {
        $api = new ServerApi($this->engines->forEngine($this->engines->defaultEngineId()));

        return response()->json(['data' => $api->metrics($period)]);
    }
}
