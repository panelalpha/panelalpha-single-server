<?php

namespace App\Http\Controllers;

use App\Http\Presenters\Account\DevicePresenter;
use App\Models\User;
use App\Services\Account\DeviceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Logged-in devices / session management (section B). Session↔device matching
 * and the forget/logout rules live in DeviceService; the row shape in
 * DevicePresenter.
 */
class DeviceController extends Controller
{
    public function __construct(
        private readonly DeviceService $devices,
        private readonly DevicePresenter $presenter,
    ) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->authenticatedUser($request);

        return response()->json([
            'data' => $this->presenter->presentList(
                $this->devices->forUser($user, $request->session()->getId()),
            ),
        ]);
    }

    /**
     * POST /api/user/device/forget – remove a remembered device and end its session.
     */
    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate(['deviceId' => ['required', 'integer']]);

        /** @var User $user */
        $user = $this->authenticatedUser($request);

        $wasCurrent = $this->devices->forget($user, (int) $validated['deviceId'], $request->session()->getId());

        return $this->respond($request, $wasCurrent);
    }

    /**
     * POST /api/user/device/logout – end one session by id.
     */
    public function logout(Request $request): JsonResponse
    {
        $validated = $request->validate(['session_id' => ['required', 'string']]);

        /** @var User $user */
        $user = $this->authenticatedUser($request);

        $wasCurrent = $this->devices->logout($user, $validated['session_id'], $request->session()->getId());

        return $this->respond($request, $wasCurrent);
    }

    /**
     * When the ended session is the caller's own, end its login too and
     * invalidate the session.
     */
    private function respond(Request $request, bool $wasCurrent): JsonResponse
    {
        if ($wasCurrent) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
        }

        return response()->json(['success' => true], $wasCurrent ? 204 : 200);
    }
}
