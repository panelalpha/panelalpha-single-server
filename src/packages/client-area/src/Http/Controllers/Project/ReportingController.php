<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ReportingService;

/**
 * Bandwidth and visitor reporting for a project, backed
 * by the Engine's AWStats endpoints. Reads keep the old `general.view_reports`
 * privilege.
 */
final class ReportingController extends Controller
{
    public function __construct(private readonly ReportingService $reporting) {}

    public function bandwidth(Application $application, string $period): JsonResponse
    {
        $this->assertPeriod($period);

        return response()->json(['data' => $this->reporting->bandwidth($application, $period)]);
    }

    public function visitors(Application $application, string $period): JsonResponse
    {
        $this->assertPeriod($period);

        return response()->json(['data' => $this->reporting->visitors($application, $period)]);
    }

    public function breakdown(Application $application, string $type, string $period): JsonResponse
    {
        $this->assertPeriod($period);

        // Unknown dimensions answer empty (e.g. device / device-brand, which the Engine does not report).
        return response()->json(['data' => $this->reporting->breakdown($application, $type, $period)]);
    }

    private function assertPeriod(string $period): void
    {
        abort_unless(in_array($period, ['last-week', 'last-month', 'last-year'], true), 404);
    }
}
