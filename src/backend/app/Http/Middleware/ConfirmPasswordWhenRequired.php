<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Middleware\RequirePassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate a route behind a recent password confirmation while
 * `auth.require_password_for_2fa` is on (the default).
 *
 * Delegates to Laravel's `password.confirm` (`RequirePassword`): JSON `423`
 * while unconfirmed. A password login and a 2FA challenge confirm the session.
 * The Client Area has no password prompt for the 423 yet and shows its message
 * as is, so the message names what to do: sign in again with the password.
 */
class ConfirmPasswordWhenRequired
{
    public const string SIGN_IN_AGAIN = 'Sign in again with your password to change two-factor authentication.';

    public function __construct(private readonly RequirePassword $requirePassword) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, int|string|null $timeout = null): Response
    {
        if (! config('auth.require_password_for_2fa')) {
            return $next($request);
        }

        $response = self::asResponse($this->requirePassword->handle(
            $request,
            $next,
            null,
            $timeout ?? Payload::int(config('auth.password_confirm_2fa_seconds')) ?? 900,
        ));

        // No 2FA controller answers 423, so a 423 here is the gate's own.
        if ($response instanceof JsonResponse && $response->getStatusCode() === 423) {
            $response->setData(['message' => self::SIGN_IN_AGAIN]);
        }

        return $response;
    }

    private static function asResponse(mixed $response): Response
    {
        return $response instanceof Response ? $response : new Response();
    }
}
