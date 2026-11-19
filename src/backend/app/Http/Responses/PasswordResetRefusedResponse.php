<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\FailedPasswordResetResponse;

/**
 * The answer of POST /reset-password when the broker refuses the request.
 *
 * Laravel's broker tells an unknown address (`passwords.user`) from a bad or
 * expired token (`passwords.invalid`), so the stock Fortify response lets an
 * unauthenticated caller test which addresses have an account. Both get this
 * one message instead, the neutral answer the forgotten-password form gives
 * (`PasswordResetLinkSentResponse`).
 */
final class PasswordResetRefusedResponse implements FailedPasswordResetResponse
{
    public const MESSAGE = 'This password reset token is invalid.';

    /**
     * The route serves only the Client Area and API clients: JSON whatever Accept says.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    public function toResponse($request): JsonResponse
    {
        return new JsonResponse([
            'message' => self::MESSAGE,
            'errors' => ['email' => [self::MESSAGE]],
        ], 422);
    }
}
