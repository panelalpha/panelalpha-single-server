<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\RedeployRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\RedeployUploadRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployService;
use PanelAlpha\ClientArea\Support\RequestBody;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Deploy actions for custom (deploy) projects: cancel,
 * redeploy, retry-install and archive upload. The read side (history and the
 * live view) is `DeployHistoryController`, read from the Engine.
 *
 * WordPress projects are rejected 422, as the CA only shows the tab for
 * `type === custom`.
 */
final class DeployController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly DeployService $deploys,
        private readonly ProjectPresenter $projects,
    ) {}

    public function cancel(Application $application): JsonResponse
    {
        $this->assertCustom($application);

        // 409 (nothing running) bubbles through to the CA, which keeps polling.
        $result = (new ProjectsApi($application->engine()))->cancelDeploy($application->engineProject());

        return response()->json(['data' => ['cancelled' => (bool) ($result['cancelled'] ?? true)]]);
    }

    /**
     * POST /projects/{application}/redeploy – the old RedeployController::store.
     * Returns 202 with the panel deploy-log id and the target project id.
     */
    public function redeploy(RedeployRequest $request, Application $application): JsonResponse
    {
        $result = $this->deploys->redeploy($application, $request->validated());

        return response()->json($result, 202);
    }

    /**
     * PUT /projects/{application}/retry-install – retry a failed deploy of a
     * custom project (old InstanceController::retryInstall). Returns the project
     * so the CA can follow the new deploy.
     */
    public function retryInstall(Request $request, Application $application): JsonResponse
    {
        $this->deploys->retryInstall($application, clientAreaRetry: true);

        return response()->json(['data' => $this->projects->presentInstalling($application, $this->authenticatedUser($request))]);
    }

    /**
     * POST /projects/{application}/deploy/upload – stage an uploaded archive in
     * the project home and return its `remote_filepath` for the redeploy. The CA
     * sends the raw body (`application/octet-stream`) with `?filename=`.
     */
    public function upload(RedeployUploadRequest $request, Application $application): JsonResponse
    {
        // Buffer the raw body to a seekable temp stream in
        // fixed chunks instead of handing php://input to the Engine, so a 250 MB
        // archive never sits on the PHP heap and the multipart call carries a
        // Content-Length. Guzzle's stream wrapper owns the resource and closes
        // it when the response is freed, so close it only while still open.
        $contents = RequestBody::buffer($request);

        try {
            $result = $this->deploys->uploadArchive($application, $request->validated(), $contents);
        } finally {
            if (is_resource($contents)) {
                fclose($contents);
            }
        }

        return response()->json($result);
    }

    private function assertCustom(Application $application): void
    {
        // Deploy-log/deploy-cancel are container (DinD) only on the Engine; a
        // classic project is refused up front.
        if (! $application->isContainer()) {
            abort(422, 'Deploy logs are available for container projects only.');
        }
    }
}
