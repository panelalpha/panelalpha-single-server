<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\PushToAppRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\StagingRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Staging of one project. The Engine owns the copy; the
 * service orchestrates and the project payload is the same as everywhere.
 */
final class StagingController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly StagingService $staging,
        private readonly ProjectPresenter $presenter,
    ) {}

    public function store(StagingRequest $request, Application $application): JsonResponse
    {
        $staging = $this->staging->create($application, $request->validated());

        $this->logStaging($application, $staging);

        // The old InstanceResource of the just-created staging answered 201.
        return response()->json(['data' => $this->presenter->present($staging, $this->authenticatedUser($request))], 201);
    }

    public function retry(StagingRequest $request, Application $application, string $stagingId): JsonResponse
    {
        $staging = $this->staging->retry($application, $stagingId, $request->validated());

        $this->logStaging($application, $staging);

        return response()->json(['data' => $this->presenter->present($staging, $this->authenticatedUser($request))]);
    }

    public function pushToLive(PushToAppRequest $request, Application $application): JsonResponse
    {
        $this->staging->pushToLive($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function pushToStaging(PushToAppRequest $request, Application $application): JsonResponse
    {
        $this->staging->pushToStaging($application, $request->validated());

        return response()->json(['success' => true]);
    }

    /**
     * `GET /projects/{application}/push-to-live` – the push dialog's table diff
     * for a staging against its live parent. The old route had no privilege.
     */
    public function pushToLiveShow(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->staging->pushToLiveDiff($application)]);
    }

    /**
     * `GET /projects/{application}/push-to-staging` – the push dialog's table
     * diff for a live project against its staging.
     */
    public function pushToStagingShow(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->staging->pushToStagingDiff($application)]);
    }

    public function preCheck(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->staging->preCheck($application)]);
    }

    /**
     * `staging.create` / `staging.retry_install` render the **second**
     * Application payload entry (`LogItem.vue:99-101` →
     * `InstanceLogMixin::getCreatedStagingInfo`), so the parent goes first and
     * the staging second. MySQL re-sorts JSON object keys, so the activity
     * presenter rebuilds that order from the snapshot ids when it presents the
     * row. A FormRequest copies the attribute bag, so set it on the canonical
     * request the middleware reads.
     */
    private function logStaging(Application $parent, Application $staging): void
    {
        request()->attributes->set('activity', [
            'App\\Models\\Application:'.$parent->id => $this->stagingSnapshot($parent),
            'App\\Models\\Application:'.$staging->id => $this->stagingSnapshot($staging),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function stagingSnapshot(Application $application): array
    {
        return [
            'id' => $application->id,
            'name' => $application->name,
            'domain' => $application->domain,
            'type' => $application->type,
        ];
    }
}
