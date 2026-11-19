<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Http\Requests\Project\GitLogsRequest;
use PanelAlpha\ClientArea\Projects\GitOperationLog;

/**
 * The panel-side git operation log of a project. Extracted
 * from `GitController` and moved to `client-area-legacy`; the Engine keeps no operation
 * history, so the rows live in the panel `git_operations` table.
 *
 * Permanent panel code: the git operation history is the old panel's design
 * and the Engine does not need to keep it, so it moved from client-area-legacy
 * into the controller.
 */
final class GitHistoryController extends Controller
{
    public function __construct(private readonly GitOperationLog $operations) {}

    /**
     * GET /projects/{application}/git/logs – paginated like the old git
     * deployment logs.
     */
    public function logs(GitLogsRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->operations->history($application, $request->validated()));
    }
}
