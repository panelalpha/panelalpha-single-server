<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Http\Requests\Project\CopyProjectRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectDestroyRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectListRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectListService;
use PanelAlpha\ClientArea\Projects\ProjectService;
use PanelAlpha\ClientArea\Projects\ProjectBackupDetails;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Client Area project list and detail. Reference implementation of the
 * package pattern: visibility comes from ApplicationRepository, the
 * {application} parameter is already scoped to the user by route binding,
 * and nothing here knows which edition is running – except Copy Project: the
 * single-server Client Area hides that page by product decision (2026-10-28),
 * and the Community panel refuses its route too ({@see self::COPY_REFUSAL}).
 * List/search/sort/paginate lives in ProjectListService, lifecycle in
 * ProjectService.
 */
final class ProjectController extends Controller
{
    use ResolvesAuthenticatedUser;

    public const COPY_REFUSAL = 'Copying a project is not available in Single Server Community.';

    public function __construct(
        private readonly ProjectListService $list,
        private readonly ProjectPresenter $presenter,
        private readonly ProjectService $projects,
        private readonly ProjectSourceDetails $sourceDetails,
        private readonly ProjectWordPressDetails $wordpressDetails,
        private readonly ProjectBackupDetails $backupDetails,
        private readonly CommunityPanel $communityPanel,
    ) {}

    public function index(ProjectListRequest $request): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->list->paginate($this->authenticatedUser($request), [
            'page' => Payload::int($params['page'] ?? null),
            'per_page' => Payload::int($params['per_page'] ?? null),
            'sort_by' => Payload::nullableString($params['sort_by'] ?? null),
            'sort_dir' => Payload::nullableString($params['sort_dir'] ?? null),
            'search_term' => Payload::nullableString($params['search_term'] ?? null),
            'labels' => Payload::nullableString($params['labels'] ?? null),
            'server_account_id' => Payload::int($params['server_account_id'] ?? null),
        ]));
    }

    /**
     * The single project from the mirror: its usage tiles come from the synced
     * project. A deployed (git/files) project adds its Source card –
     * stack, database and last deploy – from the cache a queued refresh fills
     * ({@see ProjectSourceDetails}); no live Engine read, and the list never
     * carries it. A WordPress project adds its core version, available core
     * updates and plugins the same way ({@see ProjectWordPressDetails}).
     */
    public function show(Request $request, Application $application): JsonResponse
    {
        $project = $this->presenter->present($application, $this->authenticatedUser($request));

        $project = $this->sourceDetails->apply($application, $project);
        $project = $this->wordpressDetails->apply($application, $project);

        return response()->json(['data' => $this->backupDetails->apply($application, $project)]);
    }

    /**
     * POST /projects/{application}/copy – queue the Engine clone (old
     * CopyInstanceController::store). The clone is synchronous on the Engine,
     * so it runs on the `long` queue and the CA is told through
     * `user.instance.installation_finished|failed`; the CA ignores this body
     * (`CopyInstance.vue:235`). The Community Client Area does not offer the page
     * (hidden since 2026-10-28, as in every single-server
     * edition), so Community refuses the route instead of cloning where the user
     * has no action for it.
     */
    public function copy(CopyProjectRequest $request, Application $application): JsonResponse
    {
        if ($this->communityPanel->active()) {
            return response()->json(['message' => self::COPY_REFUSAL], 403);
        }

        $this->projects->copy($application);

        return response()->json(['success' => true], 202);
    }

    /** DELETE /projects/{application}; 202 when a busy Engine's delete is left to DeleteProjectJob. */
    public function destroy(ProjectDestroyRequest $request, Application $application): JsonResponse
    {
        if (! $this->projects->delete($application, $request->boolean('defer_while_busy'))) {
            return response()->json(['success' => true], 202);
        }

        // A user's own delete tells the admins (old `InstanceDeletedByUser`); a
        // staging's does not, as before. An admin delete uses ProjectService
        // directly and stays silent.
        $this->projects->announceUserDelete($application);

        return response()->json(['success' => true]);
    }
}
