<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Requests\Project\ChangeBranchRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitCommitsRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitConnectRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitCredentialsRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitDeployRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitDeployKeyRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitPullRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\GitRevertRequest;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitCheckoutService;
use PanelAlpha\ClientArea\Projects\GitDeployKeyService;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * The Git page of a project, backed by the Engine
 * `E:/git/*` endpoints. Reads keep `general.view_logs`-style privileges only
 * where the old route had one; mutating routes use `general.manage_git`.
 */
final class GitController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly GitService $git,
        private readonly GitDeployKeyService $deployKeys,
        private readonly GitCheckoutService $checkout,
        private readonly ProjectPresenter $projects,
    ) {}

    public function show(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->show($application)]);
    }

    public function connect(GitConnectRequest $request, Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->connect($application, $request->validated())]);
    }

    public function deployKey(GitDeployKeyRequest $request, Application $application): JsonResponse
    {
        return response()->json(['data' => $this->deployKeys->show(
            $application,
            Payload::nullableString($request->validated()['repo_url'] ?? null),
        )]);
    }

    public function currentDeployKey(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->deployKeys->current($application)]);
    }

    public function deleteDeployKey(Application $application): Response
    {
        $this->deployKeys->delete($application);

        return response()->noContent();
    }

    public function envExample(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->checkout->envExample($application)]);
    }

    public function deploy(GitDeployRequest $request, Application $application): JsonResponse
    {
        $application = $this->checkout->deploy($application, $request->validated());

        return response()->json(['data' => $this->projects->present($application, $this->authenticatedUser($request))]);
    }

    public function disconnect(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->disconnect($application)]);
    }

    public function repair(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->repair($application)]);
    }

    public function pull(GitPullRequest $request, Application $application): JsonResponse
    {
        $this->git->pull($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function push(Application $application): JsonResponse
    {
        // The CA reads the top-level `nothing_to_push` flag (old controller).
        $result = $this->git->push($application);

        return response()->json([
            'success' => true,
            'nothing_to_push' => ($result['nothing_to_push'] ?? false) === true,
        ]);
    }

    public function revert(GitRevertRequest $request, Application $application): JsonResponse
    {
        $this->git->revert($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function branches(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->branches($application)]);
    }

    public function commits(GitCommitsRequest $request, Application $application): JsonResponse
    {
        $validated = $request->validated();

        return response()->json(['data' => $this->git->commits(
            $application,
            Payload::nullableString($validated['branch'] ?? null),
            Payload::int($validated['limit'] ?? null),
        )]);
    }

    public function updateCredentials(GitCredentialsRequest $request, Application $application): JsonResponse
    {
        return response()->json(['data' => $this->git->updateCredentials($application, $request->validated())]);
    }

    public function changeBranch(ChangeBranchRequest $request, Application $application): JsonResponse
    {
        $this->git->changeBranch($application, Payload::string($request->validated()['branch'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function ignoreDrift(Application $application): JsonResponse
    {
        $this->git->ignoreDrift($application);

        return response()->json(['success' => true]);
    }
}
