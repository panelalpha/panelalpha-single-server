<?php

namespace App\Http\Middleware;

use App\Services\Auth\LoginService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * `POST /two-factor-challenge` reads the challenged user `POST /login` left in
 * the session (`login.id`). Sanctum starts no session for a request without a
 * stateful origin, so refuse such a request the way `/login` does instead of
 * letting Fortify and the throttle limiter call `session()`.
 */
final class RequireLoginSession
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->hasSession()) {
            throw ValidationException::withMessages([
                $request->filled('recovery_code') ? 'recovery_code' : 'code' => [LoginService::SESSION_EXPIRED_MESSAGE],
            ]);
        }

        return $next($request);
    }
}
