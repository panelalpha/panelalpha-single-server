<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Http\Requests\Project\OnboardingThemesRequest;
use PanelAlpha\ClientArea\Onboarding\WordPressOrg;

/**
 * The onboarding form's WordPress.org catalog: the
 * WordPress versions it offers and the theme browser. The Engine has no catalog
 * so the panel asks api.wordpress.org itself, as the old panel did.
 * Split out of the old `OnboardingController` and moved to legacy with
 * `WordPressOrg`; every route keeps its path.
 *
 * Permanent panel code: the Engine does not need a catalog, so the
 * controller moved back from client-area-legacy; the route names follow the
 * package (`client-area.*`).
 */
final class OnboardingCatalogController extends Controller
{
    public function __construct(
        private readonly WordPressOrg $wordpressOrg,
        private readonly ServiceDirectory $services,
        private readonly ServiceOnboarding $onboarding,
    ) {}

    /**
     * GET /projects/onboarding/themes – the theme browser's page, from the
     * WordPress.org themes API (old OnboardingController::themes). The CA reads
     * `response.data.data` and `response.data.meta.total`. With `service_id` of
     * one of the user's services, the themes its plan removes are left out of
     * the page (old `getThemesToUninstall()`: none in Community, the
     * paid plan's through the controller's `ServiceOnboarding`); `meta` stays
     * the directory's, as before.
     */
    public function themes(OnboardingThemesRequest $request): JsonResponse
    {
        $params = $request->validated();

        $result = $this->wordpressOrg->themes(
            Payload::string($params['search_term'] ?? ''),
            Payload::int($params['per_page'] ?? 12) ?? 12,
            Payload::int($params['page'] ?? 1) ?? 1,
            Payload::string($params['browse'] ?? ''),
            Payload::string($params['tags'] ?? ''),
        );

        $themes = $result['themes'];
        $serviceId = Payload::int($params['service_id'] ?? null);
        $user = $request->user();
        $service = $serviceId === null || $user === null ? null : $this->services->findForUser($user, $serviceId);
        if ($service !== null) {
            $blocked = $this->onboarding->blockedThemes($service);
            $themes = array_values(array_filter($themes, static fn (array $theme): bool => ! in_array($theme['slug'] ?? null, $blocked, true)));
        }

        return response()->json(['data' => $themes, 'meta' => $result['info']]);
    }

    /**
     * GET /projects/wordpress-versions – the WordPress versions the onboarding
     * form offers (old ApplicationController::wordpressVersions): the
     * WordPress.org version-check offers, newest first. The CA reads
     * `response.data.data` as plain version strings.
     */
    public function wordpressVersions(): JsonResponse
    {
        return response()->json(['data' => $this->wordpressOrg->availableVersions()]);
    }
}
