<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Containers\ContainerService;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Hosting\ProxyRuleService;
use PanelAlpha\ClientArea\Http\Presenters\ContainerPresenter;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ContainerActionRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ContainerServiceActionRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ProxyRuleRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ProxyRuleUpdateRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Service-level proxy rules and containers for the virtual service (migration
 * section O). In single-server the service's accounts are the user's projects,
 * so the `{accountId}` path segment is the project id.
 */
final class ContainerController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly ProxyRuleService $proxyRules,
        private readonly ContainerService $containers,
        private readonly ContainerPresenter $presenter,
        private readonly ApplicationRepository $applications,
        private readonly AccessResolver $access,
    ) {}

    // Proxy rules ---------------------------------------------------------

    public function proxyRules(Request $request, int $service): JsonResponse
    {
        $this->assertService($request, $service);

        return response()->json(['data' => $this->proxyRules->list($this->authenticatedUser($request))]);
    }

    public function createProxyRule(ProxyRuleRequest $request, int $service): JsonResponse
    {
        $this->assertService($request, $service);
        $this->proxyRules->create($this->authenticatedUser($request), $request->validated());

        return response()->json(['success' => true], 201);
    }

    public function updateProxyRule(ProxyRuleUpdateRequest $request, int $service, int $ruleId): JsonResponse
    {
        $this->assertService($request, $service);
        $this->proxyRules->update($this->authenticatedUser($request), $ruleId, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteProxyRule(Request $request, int $service, int $ruleId): JsonResponse
    {
        $this->assertService($request, $service);
        $this->proxyRules->delete($this->authenticatedUser($request), $ruleId);

        return response()->json(['success' => true]);
    }

    // Containers ----------------------------------------------------------

    public function containers(Request $request, int $service): JsonResponse
    {
        $this->assertService($request, $service);

        // Containers only exist for container (DinD) projects; a broken project
        // never fails the list and an Engine that does not answer answers the
        // panel's 503 (ContainerService fan-out).
        return response()->json(['data' => $this->presenter->groups($this->containers->groupsFor($this->authenticatedUser($request)))]);
    }

    public function containerAction(ContainerActionRequest $request, int $service, int $accountId): JsonResponse
    {
        $this->assertService($request, $service);
        $application = $this->resolvedContainerApplication($request, $accountId);

        // The Engine answers bare `{exit_code, stdout, stderr}`; proxy it.
        $result = $this->containers->projectAction($application, $request->validated());

        return response()->json($result->json(), $result->status());
    }

    public function serviceAction(ContainerServiceActionRequest $request, int $service, int $accountId, string $container): JsonResponse
    {
        $this->assertService($request, $service);
        $application = $this->resolvedContainerApplication($request, $accountId);

        $result = $this->containers->serviceAction($application, $container, $request->validated());

        return response()->json($result->json(), $result->status());
    }

    public function containerLogs(Request $request, int $service, int $accountId, string $container): JsonResponse
    {
        $this->assertService($request, $service);
        $application = $this->applications->findForUser($this->authenticatedUser($request), $accountId);

        // Old service-name guard and 500-line cap
        // (ServiceContainerController::logs:215-219).
        abort_unless(preg_match('/^[a-zA-Z0-9_-]+$/', $container) === 1, 422, 'Invalid service name');

        // Container logs are DinD-only.
        abort_if(! $application->isContainer(), 422, 'Container logs are available for container projects only.');

        // The old `(int)` cast, not `is_numeric`: a non-numeric query reads as
        // 0, a numeric prefix keeps its digits, and an array reads as 0 empty /
        // 1 non-empty (ServiceContainerController::logs:219). The
        // array branch spells PHP's cast out, so Psalm's RiskyCast stays quiet.
        $linesQuery = $request->query('lines', 200);
        $lines = min(is_array($linesQuery) ? (int) ($linesQuery !== []) : (int) $linesQuery, 500);

        return response()->json(['data' => $this->containers->logs($application, $container, $lines)]);
    }

    /**
     * Resolve the {accountId} project and enforce the old
     * `hosting.manage_containers` privilege on it.
     */
    private function resolvedContainerApplication(Request $request, int $accountId): Application
    {
        $application = $this->applications->findForUser($this->authenticatedUser($request), $accountId);

        abort_unless(
            $this->access->allows($this->authenticatedUser($request), $application, 'hosting.manage_containers'),
            403,
            'You do not have permission to perform this action.',
        );

        return $application;
    }

    /**
     * One of the user's services, or 404 (Community: only the virtual service).
     */
    private function assertService(Request $request, int $service): void
    {
        abort_if(app(ServiceDirectory::class)->findForUser($this->authenticatedUser($request), $service) === null, 404);
    }
}
