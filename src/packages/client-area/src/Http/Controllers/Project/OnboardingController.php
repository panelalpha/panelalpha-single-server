<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\GitBranchesRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\InstallWordPressRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\PreviewEnvExampleRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectDeployKeyRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectDeployRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\UploadFilesRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\TestGitUrlRequest;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Projects\OnboardingDeployService;
use PanelAlpha\ClientArea\Projects\OnboardingGate;
use PanelAlpha\ClientArea\Projects\OnboardingService;
use PanelAlpha\ClientArea\Projects\OnboardingSshDeployService;
use PanelAlpha\ClientArea\Projects\WordPressInstallService;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\RequestBody;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Source inspection before a project exists (onboarding):
 * test a git URL, list its branches and preview the expected env variables.
 *
 * Routes live under `/projects/...` and are registered before the
 * `{application}` binding routes so the literal segments are not swallowed by a
 * numeric id (there is no id here – the CA has no project yet).
 */
final class OnboardingController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly OnboardingService $onboarding,
        private readonly OnboardingDeployService $deploySource,
        private readonly OnboardingSshDeployService $sshDeploy,
        private readonly ProjectPresenter $projects,
        private readonly WordPressInstallService $wordpress,
        private readonly OnboardingGate $gate,
    ) {}

    public function testGitUrl(TestGitUrlRequest $request): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->onboarding->testGitUrl(
            Payload::string($params['repo_url'] ?? ''),
            Payload::nullableString($params['token'] ?? null),
        ));
    }

    public function gitBranches(GitBranchesRequest $request): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->onboarding->gitBranches(
            Payload::string($params['repo_url'] ?? ''),
            Payload::nullableString($params['token'] ?? null),
        ));
    }

    public function previewEnvExample(PreviewEnvExampleRequest $request): JsonResponse
    {
        $params = $request->validated();

        // The files flow needs a project/domain to read the uploaded archive
        // from; onboarding files deploys are gated on section O, so this only
        // supports the git source for now (the CA tolerates has_example:false).
        return response()->json($this->onboarding->previewEnvExample([
            'repo_url' => Payload::nullableString($params['repo_url'] ?? null),
            'token' => Payload::nullableString($params['token'] ?? null),
            'branch' => Payload::nullableString($params['branch'] ?? null),
        ]));
    }

    /**
     * POST /projects/upload-files (and the /instances alias): the raw body is
     * stored in the DinD project the files-source domain step created; the CA
     * sends `service_id`, `domain_id` and `filename` as query parameters and
     * reads `response.data.remote_filepath`
     * (`OnboardingModalWrapper.vue:905-916`). The old route had no
     * privilege.
     */
    public function uploadFiles(UploadFilesRequest $request): JsonResponse
    {
        $params = $request->validated();
        $this->gate->service($this->authenticatedUser($request), Payload::int($params['service_id'] ?? null) ?? 0);

        $contents = RequestBody::buffer($request);

        try {
            $result = $this->deploySource->uploadFiles($this->authenticatedUser($request), $params, $contents);
        } finally {
            if (is_resource($contents)) {
                fclose($contents);
            }
        }

        return response()->json($result);
    }

    /**
     * POST /projects/deploy (and the /instances alias): start the files-source
     * install deploy, or attach a git source to the container project the domain
     * step created, and answer the old `InstanceResource` shape
     * (`OnboardingModalWrapper.vue:924-940` / :607-624). The old
     * route used the user-level `service.create_instance` privilege
     *Enforced by the `privilege-user:` route middleware
     * before validation. The plan's project types and the
     * onboarding's shares as the old `deploy()` (InstanceController.php:1965,
     * :2061-2078).
     */
    public function deploy(ProjectDeployRequest $request): JsonResponse
    {
        $params = $request->validated();
        $user = $this->authenticatedUser($request);
        $service = $this->gate->service($user, Payload::int($params['service_id'] ?? null) ?? 0);
        $git = ($params['source_type'] ?? null) === 'git';
        $this->gate->assertProjectType($service, $git ? ServiceOnboarding::TYPE_GIT : ServiceOnboarding::TYPE_FILES);
        $shares = $this->gate->shares($user, $params);

        $application = $git
            ? $this->deploySource->deployFromGit($user, $params)
            : $this->deploySource->deployFromFiles($user, $params);
        $this->gate->share($user, $application, $shares);

        return response()->json(['data' => $this->projects->present($application, $user)]);
    }

    /**
     * POST /projects/deploy-key (and the /instances alias): the wizard's
     * "Generate key" for a private SSH repository. Creates the container
     * project without a repository, or reuses the domain step's, and answers
     * it together with its deploy key (git-deploy-keys). The git project type
     * and the onboarding's `shared_access` as in `deploy()`.
     */
    public function deployKey(ProjectDeployKeyRequest $request): JsonResponse
    {
        $params = $request->validated();
        $user = $this->authenticatedUser($request);
        $service = $this->gate->service($user, Payload::int($params['service_id'] ?? null) ?? 0);
        $this->gate->assertProjectType($service, ServiceOnboarding::TYPE_GIT);
        $shares = $this->gate->shares($user, $params);

        $result = $this->sshDeploy->create($user, $params);
        $this->gate->share($user, $result['application'], $shares);

        return response()->json(['data' => [
            'project' => $this->projects->present($result['application'], $user),
            'deploy_key' => $result['deploy_key'],
        ]]);
    }

    /**
     * POST /projects/install: the CA's "Install WordPress" create
     * (`OnboardingModalWrapper.vue:1605-1621`) on the classic project its domain
     * step created (`domain_id`). Queues the install (Engine 2.2.0) and
     * answers the old 201 `InstanceResource` (old InstanceController::install
     * :438-492) with `async_status.installation: in_progress`; the CA waits for
     * `user.instance.installation_finished|failed`. The plan's project types
     * and the onboarding's shares as the old `install()`
     * (InstanceController.php:338, :472-486).
     */
    public function install(InstallWordPressRequest $request): JsonResponse
    {
        $params = $request->validated();
        $user = $this->authenticatedUser($request);
        $service = $this->gate->service($user, Payload::int($params['service_id'] ?? null) ?? 0);
        $this->gate->assertProjectType($service, ServiceOnboarding::TYPE_WORDPRESS);
        $shares = $this->gate->shares($user, $params);

        $application = $this->wordpress->start($user, $params);
        $this->gate->share($user, $application, $shares);

        return response()->json(['data' => $this->projects->present($application, $user)], 201);
    }
}
