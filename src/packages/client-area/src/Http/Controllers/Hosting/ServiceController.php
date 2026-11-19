<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Http\Presenters\ServicePresenter;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * The hosting services: `/services` answers the user's
 * services from the {@see ServiceDirectory} – Community's one virtual service whose
 * server accounts are the synced projects – and `/services/{id}/…` accept only
 * the user's own service ids.
 */
final class ServiceController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly ServicePresenter $presenter,
        private readonly ServiceDirectory $services,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $applications = array_values($this->applications->forUser($user)->all());

        $data = [];
        foreach ($this->services->forUser($user) as $service) {
            $data[] = $this->presenter->present($user, $service, $this->services->applicationsOf($service, $applications));
        }

        return response()->json(['data' => $data]);
    }

    public function instanceOptions(Request $request, int $service): JsonResponse
    {
        abort_if($this->services->findForUser($this->authenticatedUser($request), $service) === null, 404);

        return response()->json(['data' => ['user_configurable_options' => []]]);
    }
}
