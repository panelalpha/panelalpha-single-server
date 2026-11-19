<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Hosting\DomainValidation;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Http\Presenters\ServiceDomainPresenter;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ServiceDomainStoreRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitSourceAttacher;
use PanelAlpha\ClientArea\Projects\GitSourceRecord;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Provisioning\ProvisionResult;
use PanelAlpha\ClientArea\Provisioning\ProvisionWaiter;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\ProjectName;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\QueryString;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Onboarding domain step of the virtual service. The
 * single-server CA picks a domain here and creates the project from it; the
 * panel-side checks (syntax, taken, the plan's blacklists) run before the
 * Engine is asked. A plan that does not ask for a domain gets one generated.
 */
final class ServiceDomainController extends Controller
{
    use ResolvesAuthenticatedUser;

    /** Old `api/custom_validation.domain_name_not_available` (custom_validation.php:12). */
    public const string NOT_AVAILABLE = 'The domain name is not available';

    public function __construct(
        private readonly DomainValidation $validation,
        private readonly ApplicationRepository $applications,
        private readonly ApplicationProvisioner $provisioner,
        private readonly ProvisionWaiter $waiter,
        private readonly HostGuard $hosts,
        private readonly ServiceDomainPresenter $presenter,
        private readonly GitSourceAttacher $attacher,
        private readonly ServiceDirectory $services,
        private readonly ServiceOnboarding $onboarding,
    ) {}

    /**
     * GET /services/{id}/domains – every domain across the user's projects.
     */
    public function index(Request $request, int $service): JsonResponse
    {
        $hostingService = $this->service($request, $service);

        // The CA sends `search_term` and `per_page=100` (`ServiceDomainsMixin`);
        // each row is the old DomainResource shape, with `id`.
        $search = strtolower(trim(QueryString::from($request, 'search_term')));

        $data = [];
        $applications = array_values($this->applications->forUser($this->authenticatedUser($request))->all());
        foreach ($this->services->applicationsOf($hostingService, $applications) as $application) {
            // The old `www.`-less domain, searched as shown.
            $domain = (string) ($application->presentedDomain() ?? '');
            if ($domain === '' || ($search !== '' && ! str_contains(strtolower($domain), $search))) {
                continue;
            }
            // The old DomainResource shape: `{id, domain}` only.
            $data[] = ['id' => $application->id, 'domain' => $domain];
        }

        return response()->json(['data' => $data]);
    }

    /**
     * GET /services/{id}/domains/validate?domain= – plain "can this be used".
     */
    public function validate(Request $request, int $service): JsonResponse
    {
        $hostingService = $this->service($request, $service);

        $domain = QueryString::from($request, 'domain');
        $this->validation->assertAvailable($this->authenticatedUser($request), $domain);
        $this->assertPlanAllows($hostingService, $domain);

        return response()->json(['success' => true]);
    }

    /**
     * GET /services/{id}/domains/verify?domain= – DNS-transfer verification
     * state. The Engine has no "can host this domain" check (old
     * `checkCanHostDomain`), so no record is needed; whether a transfer is
     * allowed is the plan's (old `verify()` :298).
     */
    public function verify(Request $request, int $service): JsonResponse
    {
        $hostingService = $this->service($request, $service);

        $this->validation->assertAvailable($this->authenticatedUser($request), QueryString::from($request, 'domain'));

        return response()->json([
            'verification_allowed' => $this->onboarding->homeFields($hostingService)['onboarding']['domain_transfer_enabled'],
            'verification_required' => false,
            'verification_record' => null,
        ]);
    }

    /**
     * POST /services/{id}/domains – the onboarding domain step: create the
     * project on the Engine for the chosen domain. The old route checked
     * `service.create_instance` in middleware before validation; the
     * `privilege-user:` route middleware does the same.
     */
    public function store(ServiceDomainStoreRequest $request, int $service): JsonResponse
    {
        $hostingService = $this->service($request, $service);

        $params = $request->validated();

        // Files-source onboarding: no domain yet, a container project is
        // created for the uploads and the Engine allocates its domain
        // (old DomainController::create files branch). The CA sends
        // the uploaded archive's file name, which is not a project name; it is
        // sanitised like the Engine (ProjectName::suggest) or omitted so the
        // Engine generates one. The old create was synchronous,
        // so the step waits for the Engine create task and mirrors the finished
        // project before answering. The upload and deploy stay
        // with `/projects/upload-files` and `/projects/deploy`.
        if (($params['source_type'] ?? null) === 'files') {
            // The wait budget is measured from the request start, so the
            // project create and its retry-without-`name` count against it.
            $startedAt = now()->getTimestamp();
            $suggested = ProjectName::suggest(trim(Payload::string($params['name'] ?? '')));

            $result = $this->provisionFiles($request, $suggested, $hostingService, 'dind');
            $application = $this->waiter->wait($result->application, $result->taskId, $startedAt);

            return $this->domainPayload($application, 202);
        }

        $domain = trim(Payload::string($params['domain'] ?? ''));
        if ($domain === '') {
            // Old `create()` :150-173: a plan that asks needs the domain; any
            // other generates one, or lets the Engine allocate it.
            if ($this->onboarding->homeFields($hostingService)['ask_for_domain']) {
                throw ValidationException::withMessages(['domain' => ['The domain field is required.']]);
            }
            $domain = (string) $this->onboarding->generatedDomain($hostingService, Payload::nullableString($params['name'] ?? null));
        }

        if ($domain === '') {
            return $this->domainPayload($this->provisionAllocated($request, $hostingService, $params), 202);
        }

        $this->validation->assertAvailable($this->authenticatedUser($request), $domain);
        $this->assertPlanAllows($hostingService, $domain);

        // The domain step creates a container project only when the CA names
        // the source as git or files; every other domain step (the WordPress `createDomain`,
        // OnboardingModalWrapper.vue:1561-1572, which sends no `source_type`)
        // creates a classic project, so PHP settings, cron and the push diff
        // keep their target. A `git_repo` only makes sense for the git
        // source, so it is read under the same rule (the Engine deploys every
        // git repo into a container).
        $sourceType = Payload::nullableString($params['source_type'] ?? null);
        $container = in_array($sourceType, ['git', 'files'], true);

        // A project created with `git_repo` makes the Engine clone a user URL:
        // guard the host and send a canonical URL.
        $gitRepo = null;
        $repoUrl = $params['repo_url'] ?? null;
        if ($sourceType === 'git' && is_string($repoUrl) && $repoUrl !== '') {
            $parsed = RepositoryUrl::parse($repoUrl);
            if ($parsed === null) {
                throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
            }
            $this->hosts->assertAllowed($parsed['host']);
            $gitRepo = $parsed['canonical'];
        }

        $gitToken = Payload::nullableString($params['token'] ?? null);
        $result = $this->provisioner->provision($this->authenticatedUser($request), new ProvisionRequest(
            domain: $domain,
            username: Payload::nullableString($params['username'] ?? null),
            gitRepo: $gitRepo,
            gitBranch: Payload::nullableString($params['branch'] ?? null),
            gitToken: $gitToken,
            template: $container ? 'dind' : null,
            serviceId: $hostingService->id,
        ));

        // The git source the Engine just accepted is kept on the row like the
        // Git card keeps it, so Advanced > Git shows the token and auto-deploy
        // has its credentials (a provision that throws stores nothing).
        if ($gitRepo !== null) {
            GitSourceRecord::store($result->application, $gitRepo, $gitToken);
        }

        // The plain domain step creates a classic project that a later git
        // deploy may replace. The git-source seam records its `onboarding_at`
        // marker (the controller's default attacher).
        $this->attacher->domainStepCreated($result->application, $sourceType);

        return $this->domainPayload($result->application, 202);
    }

    /**
     * The old `{id, domain}` shape, never the raw Application model;
     * the shaping lives in ServiceDomainPresenter.
     */
    private function domainPayload(Application $application, int $status): JsonResponse
    {
        return response()->json(['data' => $this->presenter->present($application)], $status);
    }

    /**
     * The domain step of a plan that does not ask for a domain and leaves its
     * name to the Engine (old `create()` :158-169 and :213-227: the panel's
     * panelalpha.online allocation, else the Engine's own name): the
     * project is created without `domain`, the site name as the project-name
     * hint (the old label source, `sanitizeSourceBase($params['name'])`), and
     * the Engine answers the domain it allocated (`details.domain`).
     *
     * @param  array<string, mixed>  $params  the validated request
     */
    private function provisionAllocated(ServiceDomainStoreRequest $request, HostingService $service, array $params): Application
    {
        $sourceType = Payload::nullableString($params['source_type'] ?? null);
        $suggested = ProjectName::suggest(trim(Payload::string($params['name'] ?? '')));
        $result = $this->provisionFiles($request, $suggested, $service, $sourceType === 'git' ? 'dind' : null);
        $this->attacher->domainStepCreated($result->application, $sourceType);

        return $result->application;
    }

    /**
     * Provision a project without a domain: the container project of a
     * files-source onboarding, or the project of a plan that leaves the domain
     * to the Engine (`$template`). The CA
     * sends the uploaded archive's file name, which is not a project name; it
     * is sanitised like the Engine (ProjectName::suggest) or omitted so the
     * Engine generates one. When the panel-derived name is
     * taken, the Engine answers 422 `name_taken`/`name_unavailable`
     * (ProjectCreator.php:400-409, ProvisionChecks.php:40-58); retry once
     * without `name`, letting `generateUsernameFrom()` pick a unique one – the
     * old `verifyNewUsername` loop.
     *
     * A create call that cannot reach the Engine (connection error, 5xx) or has
     * no Engine configured answers 422 keyed `domain` with the Engine message,
     * never 502/503/504 the CA would read as a lost response.
     */
    private function provisionFiles(ServiceDomainStoreRequest $request, ?string $suggested, HostingService $service, ?string $template): ProvisionResult
    {
        $extra = $suggested === null ? [] : ['name' => $suggested];

        try {
            return $this->provisioner->provision($this->authenticatedUser($request), new ProvisionRequest(
                // The Engine derives the username from `name` (NewProjectRules).
                template: $template,
                extra: $extra,
                serviceId: $service->id,
            ));
        } catch (EngineValidationException $e) {
            if ($suggested === null || ! $this->isProjectNameProblem($e)) {
                throw $e;
            }
            // A panel-derived name the Engine refused: fall through and retry
            // below without `name`.
        } catch (EngineUnavailableException|EngineRequestException|EngineNotConfiguredException $e) {
            throw $this->createFailure($e);
        }

        try {
            return $this->provisioner->provision($this->authenticatedUser($request), new ProvisionRequest(template: $template, serviceId: $service->id));
        } catch (EngineUnavailableException|EngineRequestException|EngineNotConfiguredException $e) {
            throw $this->createFailure($e);
        }
    }

    /**
     * A transport error, 5xx or a not-configured Engine on the create call must
     * not answer 502/503/504 – the CA treats those as a lost response and adopts
     * the half-created project.
     */
    private function createFailure(EngineException $e): ValidationException
    {
        return ValidationException::withMessages(['domain' => [EngineErrors::message($e)]]);
    }

    /**
     * Whether the Engine refused the panel-derived project name. The Engine
     * reports `problems[]` with a stable `code` beside the field errors
     * (`ProblemException`, Engine core/app/Exceptions/Handler.php:159-170).
     */
    private function isProjectNameProblem(EngineValidationException $e): bool
    {
        foreach ($e->problems as $problem) {
            if (in_array($problem['code'] ?? null, ['name_taken', 'name_unavailable'], true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Old `check()` :371-401: the plan's domain and subdomain blacklists
     * (Community blocks nothing).
     *
     * @throws ValidationException
     */
    private function assertPlanAllows(HostingService $service, string $domain): void
    {
        $name = strtolower(trim($domain));
        if (str_starts_with($name, 'www.')) {
            $name = substr($name, 4);
        }
        if (! $this->onboarding->allowsDomain($service, $name)) {
            throw ValidationException::withMessages(['domain' => [self::NOT_AVAILABLE]]);
        }
    }

    /**
     * One of the user's services, or 404 (Community: only the virtual service).
     */
    private function service(Request $request, int $service): HostingService
    {
        $hostingService = $this->services->findForUser($this->authenticatedUser($request), $service);
        abort_if($hostingService === null, 404);

        return $hostingService;
    }
}
