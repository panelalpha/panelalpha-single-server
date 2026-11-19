<?php

namespace App\Actions\Fortify;

use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Actions\ConfirmTwoFactorAuthentication as FortifyConfirmTwoFactorAuthentication;

/**
 * POST /api/user/confirmed-two-factor-authentication: Fortify's check, with the
 * message the guide quotes for a wrong code ("The entered code is invalid.",
 * see {@see \App\Http\Responses\TwoFactorCodeRefusedResponse}). The parent keeps
 * the whole verification and success path; only its validation error is
 * replaced, so the same code answers the same words on every 2FA screen.
 */
final class ConfirmTwoFactorAuthentication extends FortifyConfirmTwoFactorAuthentication
{
    public const MESSAGE = 'The entered code is invalid.';

    /**
     * @param  mixed  $user
     * @param  string  $code
     *
     * @throws ValidationException
     */
    public function __invoke($user, $code)
    {
        try {
            parent::__invoke($user, $code);
        } catch (ValidationException) {
            throw ValidationException::withMessages([
                'code' => [self::MESSAGE],
            ])->errorBag('confirmTwoFactorAuthentication');
        }
    }
}
