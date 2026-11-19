<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\ClientArea\Http\Requests\Project\GitAutoDeployRequest;

/**
 * PUT /projects/{application}/auto-deploy – enable/disable the Engine deploy
 * hook and the provider webhook (the Engine has no provider webhook, so the
 * panel registers it). Extracted from `GitController` and moved to
 * `client-area-legacy`.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller.
 */
final class GitAutoDeployController extends Controller
{
    public function __construct(private readonly GitService $git) {}

    public function toggleAutoDeploy(GitAutoDeployRequest $request, Application $application): JsonResponse
    {
        $enabled = (bool) $request->validated()['auto_deploy_enabled'];

        return response()->json(['data' => $this->git->toggleAutoDeploy($application, $enabled)]);
    }
}
