<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\AppUsers\AppUserService;
use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use PanelAlpha\ClientArea\Http\Presenters\AppUserPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\AppUserPasswordRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\AppUserRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Application users of a container project, backed by the
 * Engine `E:/app/*` endpoints. The CA calls them under `/projects/{id}/users`;
 * the Engine calls live in AppUserService, the shapes in AppUserPresenter.
 */
final class AppUserController extends Controller
{
    public function __construct(
        private readonly AppUserService $users,
        private readonly AppUserPresenter $presenter,
        private readonly PreviewTunnelService $tunnels,
    ) {}

    public function index(Application $application): JsonResponse
    {
        $this->assertContainer($application);

        return response()->json(['data' => $this->users->users($application)]);
    }

    public function roles(Application $application): JsonResponse
    {
        $this->assertContainer($application);

        return response()->json(['data' => $this->users->roles($application)]);
    }

    public function store(AppUserRequest $request, Application $application): JsonResponse
    {
        $this->assertContainer($application);

        /** @var array{username: string, email: string, password: string, role: string} $params */
        $params = $request->validated();
        $this->users->create($application, $params);

        return response()->json(['success' => true]);
    }

    public function destroy(Application $application, string $userId): JsonResponse
    {
        $this->assertContainer($application);
        $this->users->delete($application, $userId);

        return response()->json(['success' => true]);
    }

    public function resetPassword(AppUserPasswordRequest $request, Application $application, string $userId): JsonResponse
    {
        $this->assertContainer($application);
        $password = Payload::string($request->validated()['password'] ?? '');
        $this->users->resetPassword($application, $userId, $password);

        // The CA expects the server to return a generated password; here the
        // caller supplies one, so it is echoed back.
        return response()->json(['success' => true, 'new_password' => $password]);
    }

    public function ssoUrl(Application $application, string $userId): JsonResponse
    {
        $this->assertContainer($application);

        return response()->json(['data' => $this->presenter->ssoUrl($this->users->ssoUrl($application, $userId))]);
    }

    /**
     * The app-user SSO served through the project's preview tunnel:
     * the old `UserController::ssoPreviewUrl` swapped the SSO
     * URL's host for the temporary domain, which the tunnel host now is.
     */
    public function ssoPreviewUrl(Application $application, string $userId): JsonResponse
    {
        $this->assertContainer($application);
        $tunnel = $this->tunnels->tunnel($application);
        $url = $this->presenter->ssoUrl($this->users->ssoUrl($application, $userId))['sso_url'];

        return response()->json(['data' => [
            'sso_url' => is_string($url) ? PreviewTunnelService::swapHost($url, $tunnel['hostname']) : null,
        ]]);
    }

    /**
     * App users (`E:/app/*`) are container (DinD) only on the Engine; a classic
     * project is refused up front.
     */
    private function assertContainer(Application $application): void
    {
        if (! $application->isContainer()) {
            abort(422, 'Application users are available for container projects only.');
        }
    }
}
