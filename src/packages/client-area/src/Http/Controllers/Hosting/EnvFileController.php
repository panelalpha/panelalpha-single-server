<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\EnvFileService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\EnvFileRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\EnvFileUpdateRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The project `.env` editor. The CA addresses it as
 * `/server-accounts/{id}/instances/{instanceId}/env-file`; in single-server the
 * account and the project are the same row, so both ids resolve to one
 * Application. `?path=` selects the file.
 */
final class EnvFileController extends Controller
{
    public function __construct(private readonly EnvFileService $env) {}

    public function meta(Application $application, string $resourceSegment, string $instanceId): JsonResponse
    {
        $this->assertSameInstance($application, $instanceId);

        return response()->json($this->env->meta($application));
    }

    public function show(EnvFileRequest $request, Application $application, string $resourceSegment, string $instanceId): JsonResponse
    {
        $this->assertSameInstance($application, $instanceId);

        return response()->json($this->env->show($application, Payload::string($request->validated()['path'] ?? '')));
    }

    public function update(EnvFileUpdateRequest $request, Application $application, string $resourceSegment, string $instanceId): JsonResponse
    {
        $this->assertSameInstance($application, $instanceId);
        $params = $request->validated();

        // The old panel registered the env-file routes twice: `/instances`
        // logged `user.hosting.env_file.update`, `/projects` logged
        // `…update.project` (packages/api/routes/api.php:643-648). The CA
        // rewrites to `/projects` in single-server
        // (client-area/src/utils/resourcePaths.js), so the activity entry must
        // use the projects name; set on the canonical request, not the
        // FormRequest copy the middleware does not read.
        request()->attributes->set(
            'activity_action',
            $resourceSegment === 'projects'
                ? 'user.hosting.env_file.update.project'
                : 'user.hosting.env_file.update',
        );

        return response()->json($this->env->update(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::string($params['contents'] ?? ''),
            (bool) $params['restart'],
        ));
    }

    /**
     * `{instanceId}` must be the same row as the bound server account; a
     * mismatch is a foreign id, not a silent other project.
     */
    private function assertSameInstance(Application $application, string $instanceId): void
    {
        abort_unless((string) $instanceId === (string) $application->id, 404);
    }
}
