<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Activity\ActivityLogService;
use PanelAlpha\ClientArea\Http\Presenters\Activity\ActivityLogPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\ActivityLogListRequest;
use PanelAlpha\ClientArea\Models\ActivityLog;

/**
 * GET /projects/{application}/logs – the panel-side activity
 * history the Client Area shows on the project Logs tab, newest first.
 *
 * The old panel exposed it under `/instances/{id}/logs` too; the CA rewrites
 * that to `/projects` for axios calls, so one route is enough. Query/sort/
 * search live in ActivityLogService, the row shape in ActivityLogPresenter.
 */
final class ActivityLogController extends Controller
{
    public function __construct(
        private readonly ActivityLogService $logs,
        private readonly ActivityLogPresenter $presenter,
    ) {}

    public function index(ActivityLogListRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        ['sort_by' => $sortBy, 'sort_dir' => $sortDir, 'logs' => $logs] = $this->logs->paginate($application, [
            'page' => Payload::int($params['page'] ?? null),
            'per_page' => Payload::int($params['per_page'] ?? null),
            'sort_by' => Payload::nullableString($params['sort_by'] ?? null),
            'sort_dir' => Payload::nullableString($params['sort_dir'] ?? null),
            'search_term' => Payload::nullableString($params['search_term'] ?? null),
        ]);

        return response()->json([
            'data' => collect($logs->items())
                ->map(fn (ActivityLog $log) => $this->presenter->present($log))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'sort_by' => $sortBy,
                'sort_dir' => $sortDir,
            ],
        ]);
    }
}
