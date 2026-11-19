<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Presenters\DeployHistoryPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployEntry;
use PanelAlpha\ClientArea\Projects\DeployHistoryService;

/**
 * Deploy-log history and the live deploy view of container projects (migration
 * section C), read from the Engine's deploy history: every
 * deploy the Engine keeps, including the ones Connect AI/MCP, `pae` or a deploy
 * hook started. Classic projects are refused 422, as the CA only shows the tab
 * for `type === custom` and the Engine's deploy log is container-only.
 */
final class DeployHistoryController extends Controller
{
    public function __construct(
        private readonly DeployHistoryService $deploys,
        private readonly DeployHistoryPresenter $presenter,
    ) {}

    public function index(Application $application): JsonResponse
    {
        $this->assertCustom($application);

        return response()->json([
            'data' => array_map(
                fn (DeployEntry $entry): array => $this->presenter->presentList($application, $entry),
                $this->deploys->history($application),
            ),
        ]);
    }

    public function show(Application $application, string $logId): JsonResponse
    {
        $this->assertCustom($application);

        $deploy = $this->deploys->find($application, $logId);

        return response()->json(['data' => $this->presenter->present($deploy['entry'], $deploy['lines'])]);
    }

    public function download(Application $application, string $logId): JsonResponse
    {
        $this->assertCustom($application);

        $deploy = $this->deploys->find($application, $logId);

        return response()->json($this->presenter->presentDownload($deploy['entry'], $deploy['lines']));
    }

    /**
     * Live view while a deploy runs: the running deploy plus the Engine's current
     * log page. Both are null while nothing runs.
     */
    public function live(Request $request, Application $application): JsonResponse
    {
        $this->assertCustom($application);

        $offsetQuery = $request->query('offset');
        $offset = is_numeric($offsetQuery) ? (int) $offsetQuery : 0;

        $live = $this->deploys->live($application, max(0, $offset));

        return response()->json(['data' => $this->presenter->live($live['panel'], $live['engine'])]);
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
