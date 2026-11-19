<?php

namespace App\Http\Controllers;

use App\Http\Requests\Account\EmailUpdateRequest;
use App\Http\Requests\Account\ProfileUpdateRequest;
use App\Models\User;
use App\Services\Account\AccountService;
use Illuminate\Http\JsonResponse;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * My-account profile endpoints. Validation in the
 * FormRequests; the password-confirmation and persistence rules live in
 * AccountService.
 */
class AccountController extends Controller
{
    public function __construct(private readonly AccountService $accounts) {}

    /**
     * PUT /api/user/edit – first/last/company name, language, device detection.
     */
    public function update(ProfileUpdateRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->authenticatedUser($request);
        $this->accounts->update($user, $request->validated());

        return response()->json(['success' => true]);
    }

    /**
     * PUT /api/user/edit/email – change the e-mail after confirming the password.
     *
     * The old panel returned `success:false` on success (a bug); v1 returns the
     * correct value.
     */
    public function updateEmail(EmailUpdateRequest $request): JsonResponse
    {
        $validated = $request->validated();

        /** @var User $user */
        $user = $this->authenticatedUser($request);
        $this->accounts->updateEmail(
            $user,
            Payload::string($validated['email'] ?? ''),
            Payload::string($validated['password'] ?? ''),
        );

        return response()->json(['success' => true]);
    }
}
