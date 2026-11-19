<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;

/**
 * `GET /projects/{id}/source`: the real stack, database, last deploy, deploy
 * steps and deploy warnings of a container project, for the General page's
 * Source card, the redeploy/upload modals and the alert next to the "Project
 * Details" tab (CA: GitSourceInfoCard, FilesSourceInfoCard, DeploySteps,
 * InstanceStatusTabAlert).
 *
 * Answer: `{data: {available: false}}` for a classic project (no Engine call) or
 * when the Engine could not be read; otherwise the {@see ProjectSourceReport}
 * shape, kept for a minute and forgotten when a deploy starts or ends.
 */
final class ProjectSourceController extends Controller
{
    public function show(Application $application, ProjectSourceReport $report): JsonResponse
    {
        if (! $application->isContainer()) {
            return response()->json(['data' => ['available' => false]]);
        }

        return response()->json(['data' => $report->cached($application)]);
    }
}
