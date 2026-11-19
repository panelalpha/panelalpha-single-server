<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Presenters\ServiceDomainPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\Import\ImportConnectionRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\Import\ImportDomainRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\Import\ImportStartRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\Import\ImportTestUrlRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ImportPluginTokens;
use PanelAlpha\ClientArea\Projects\OnboardingGate;
use PanelAlpha\ClientArea\Projects\WordPressImportService;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\WordPressMigrationsApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The Client Area's WordPress import (old `User\Instance\ImportController`,
 * packages/api/app/Http/Controllers/User/Instance/ImportController.php;
 * Engine 2.2.0). Every route answers the old
 * shape; {@see WordPressImportService} composes the Engine calls.
 */
final class ImportController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly WordPressImportService $imports,
        private readonly ProjectPresenter $projects,
        private readonly ServiceDomainPresenter $domains,
        private readonly OnboardingGate $gate,
    ) {}

    /**
     * GET /projects/import/test-wordpress-url – old `testWordpressUrl` (:61-80).
     */
    public function testUrl(ImportTestUrlRequest $request): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->imports->testUrl(
            Payload::string($params['url'] ?? ''),
            Payload::nullableString($params['ip_address'] ?? null),
        ));
    }

    /**
     * POST /projects/import/test-wordpress-connection – old
     * `testWordpressConnection` (:109-250), after the plan's migrations type
     * (:140).
     */
    public function testConnection(ImportConnectionRequest $request, ImportPluginTokens $tokens): JsonResponse
    {
        $params = $request->validated();
        $this->migrationsService($request, Payload::int($params['service_id'] ?? null) ?? 0);

        return response()->json($this->imports->testConnection($params, $tokens));
    }

    /**
     * GET /projects/import/download-plugin (and the /instances alias the CA
     * links to by hand, `OnboardingImportSimpleMethodModal.vue:241`) – old
     * `downloadPlugin` (:577-580): the migrator plugin zip. Each download is a
     * new Engine package with its own token, remembered for the connection
     * test.
     */
    public function downloadPlugin(EngineResolver $engines, ImportPluginTokens $tokens): StreamedResponse
    {
        $api = new WordPressMigrationsApi($engines->forEngine($engines->defaultEngineId()));
        $package = $api->pluginPackage();
        $tokens->remember($package['token']);

        // Opened before the response starts, so an Engine refusal is a clean
        // error, not a broken download.
        $body = $api->openPluginPackage($package['download_url']);

        return response()->streamDownload(function () use ($body): void {
            while (! $body->eof()) {
                echo $body->read(65536);
            }
        }, 'wordpress-migrator.zip', ['Content-Type' => 'application/zip']);
    }

    /**
     * POST /projects/import/domain – old `createDomain` (:272-375): the
     * project on the site's domain, as the old `DomainResource` `{id, domain}`,
     * after the plan's migrations type (:301).
     */
    public function domain(ImportDomainRequest $request): JsonResponse
    {
        $params = $request->validated();
        $serviceId = Payload::int($params['service_id'] ?? null) ?? 0;
        $this->migrationsService($request, $serviceId);

        $application = $this->imports->createDomain(
            $this->authenticatedUser($request),
            $serviceId,
            Payload::string($params['url'] ?? ''),
        );

        return response()->json(['data' => $this->domains->present($application)]);
    }

    /**
     * POST /projects/import/import – old `importWordpress` (:399-522): the
     * new project as the old `InstanceResource` (201: the old import created
     * the instance in this call) with `meta.nameservers` (the single server
     * has none of its own). The plan's migrations type (:428) and the
     * onboarding's shares (:500-514) as before.
     */
    public function store(ImportStartRequest $request, ImportPluginTokens $tokens): JsonResponse
    {
        $params = $request->validated();
        $this->migrationsService($request, Payload::int($params['service_id'] ?? null) ?? 0);

        $user = $this->authenticatedUser($request);
        $shares = $this->gate->shares($user, $params);
        $application = $this->imports->start($user, $params, $tokens);
        $this->gate->share($user, $application, $shares);

        return response()->json([
            'data' => $this->projects->present($application, $user),
            'meta' => ['nameservers' => []],
        ], 201);
    }

    /**
     * PUT /projects/{application}/import/quick-retry – old
     * `quickRetryImportWordpress` (:540-563).
     */
    public function quickRetry(Request $request, Application $application): JsonResponse
    {
        if (! $this->imports->retry($application)) {
            throw ValidationException::withMessages([WordPressImportService::CANNOT_RETRY]);
        }

        return response()->json(['data' => $this->projects->present($application->refresh(), $this->authenticatedUser($request))]);
    }

    /**
     * One of the user's services, or 404 (Community: only the virtual service).
     */
    /**
     * One of the user's services (else 404) whose plan allows the WordPress
     * import (old `assertAllowsMigrations()`).
     */
    private function migrationsService(Request $request, int $service): void
    {
        $this->gate->assertProjectType(
            $this->gate->service($this->authenticatedUser($request), $service),
            ServiceOnboarding::TYPE_MIGRATIONS,
        );
    }
}
