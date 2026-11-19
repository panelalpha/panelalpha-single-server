<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\SuccessfulPasswordResetLinkRequestResponse;

/**
 * The answer of POST /forgot-password, the same whether or not the address has
 * an account: the form must not tell a visitor which addresses are registered.
 */
final class PasswordResetLinkSentResponse implements SuccessfulPasswordResetLinkRequestResponse
{
    public const MESSAGE = 'If an account exists for that e-mail address, we have sent it a link to reset the password.';

    /**
     * @param  \Illuminate\Http\Request  $request
     */
    public function toResponse($request): JsonResponse
    {
        return new JsonResponse(['message' => self::MESSAGE]);
    }
}
