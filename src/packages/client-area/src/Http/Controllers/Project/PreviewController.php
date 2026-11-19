<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\UserSsoRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\WordPressService;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The project preview and the WordPress admin preview
 * SSO, served through the project's Engine preview tunnel.
 *
 * Since Engine `f72fec570` a preview tunnel forwards the main domain
 * as Host and rewrites it back to the tunnel name in the answer, so the
 * preview no longer depends on the project kind: WordPress, a custom project
 * and one whose type is not detected yet all get the tunnel,
 * and the WordPress admin SSO URL works on the tunnel host.
 */
final class PreviewController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly PreviewTunnelService $tunnels,
        private readonly ProjectPresenter $presenter,
        private readonly WordPressService $wordpress,
    ) {}

    /**
     * POST /projects/{application}/preview – the old `PreviewSiteController`
     * answered the whole project (`InstanceResource`) with its
     * `preview_site {temp_host, valid_until, url}`; the CA reads
     * `preview_site` and replaces the project page's instance with the answer,
     * so the body is the same `GET /projects/{id}` shape.
     * Every project kind gets it: the tunnel forwards the main domain as Host,
     * so WordPress answers as itself instead of canonical-redirecting.
     */
    public function preview(Request $request, Application $application): JsonResponse
    {
        $tunnel = $this->tunnels->tunnel($application);

        $project = $this->presenter->present(
            $application,
            $this->authenticatedUser($request),
        );
        // The old `details.temp_domain {temp_host, valid_until}` with `url`
        // built from the project URL (old InstanceResource::getPreviewSiteDetails);
        // `valid_until` stays unix seconds, which the CA compares with now.
        $project['preview_site'] = [
            'temp_host' => $tunnel['hostname'],
            'valid_until' => $tunnel['valid_until']?->getTimestamp(),
            'url' => PreviewTunnelService::swapHost($application->url(), $tunnel['hostname']),
        ];

        return response()->json(['data' => $project]);
    }

    /**
     * POST /projects/{application}/sso-preview-url – the WordPress admin
     * preview SSO (old `InstanceController::ssoPreviewUrl`): the old `user`
     * rule, the preview tunnel, then the same WordPress user SSO the
     * `/sso-url` route asks for, with the SSO URL's host swapped for the
     * tunnel's, as the app-user and phpMyAdmin preview SSOs do. The tunnel
     * forwards the main domain as Host, so the SSO login and its cookies work
     * on the tunnel host. An Engine without the WordPress SSO
     * fails this route exactly as it fails `/sso-url`.
     */
    public function wordpressSsoPreviewUrl(UserSsoRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $tunnel = $this->tunnels->tunnel($application);
        $result = $this->wordpress->userSsoUrl($application, Payload::string($params['user'] ?? ''));
        $url = Payload::nullableString($result['url'] ?? $result['sso_url'] ?? null);

        return response()->json(['data' => [
            'sso_url' => $url !== null ? PreviewTunnelService::swapHost($url, $tunnel['hostname']) : null,
        ]]);
    }
}
