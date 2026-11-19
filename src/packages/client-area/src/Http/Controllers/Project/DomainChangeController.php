<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\ChangeDomainRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\ChangeSubdomainRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DomainChangeService;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\PresentedDomain;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Changing a project's main domain. The CA sends the new
 * domain; the Engine renames it and the fresh project is returned.
 */
final class DomainChangeController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly DomainChangeService $domains,
        private readonly ProjectPresenter $presenter,
    ) {}

    public function options(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->domains->options($application)]);
    }

    public function changeToDomain(ChangeDomainRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        $domain = $this->domains->changeToDomain($application, Payload::string($params['domain'] ?? ''));

        $this->logDomainChange($request, $application, $domain);

        return $this->renamed($request, $application);
    }

    /**
     * The CA sends `{subdomain, domain}` and the panel builds `subdomain.domain`
     * (SetYourDomainModal.vue:767; old ChangeDomainController::changeToSubdomain).
     */
    public function changeToSubdomain(ChangeSubdomainRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        $domain = $this->domains->changeToSubdomain(
            $application,
            Payload::string($params['subdomain'] ?? ''),
            Payload::string($params['domain'] ?? ''),
        );

        $this->logDomainChange($request, $application, $domain);

        return $this->renamed($request, $application);
    }

    /**
     * The CA renders `payload["…Application:<id>"].domain` for the domain-change
     * actions.
     */
    private function logDomainChange(Request $request, Application $application, string $domain): void
    {
        // A FormRequest copies the attribute bag, so set it on the canonical
        // request the middleware reads.
        request()->attributes->set('activity', [
            // The old payload carried the `www.`-less domain.
            'App\\Models\\Application:'.$application->id => ['domain' => PresentedDomain::of($domain)],
        ]);
    }

    /**
     * The service persisted the Engine's synchronous rename answer before
     * answering, so the refreshed row already carries the new domain.
     */
    private function renamed(Request $request, Application $application): JsonResponse
    {
        return response()->json(['data' => $this->presenter->present($application->refresh(), $this->authenticatedUser($request))]);
    }
}
