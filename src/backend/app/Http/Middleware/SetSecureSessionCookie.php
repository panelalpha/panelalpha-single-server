<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Make the session cookie Secure when the request is https. The panel runs
 * behind the Engine's TLS-terminating proxy, which
 * sends `X-Forwarded-Proto: https`; `TrustProxies` trusts that header only from
 * the container nginx (loopback), so `$request->isSecure()` is true there and
 * false for a client that spoofs the header from an untrusted peer.
 *
 * Laravel builds the session cookie from `config('session.secure')` directly
 * (`StartSession::addCookieToResponse`), and a `null` value never becomes
 * Secure, so the request scheme is folded in here. An explicit
 * `SESSION_SECURE_COOKIE` still wins. Registered at the front of the `api`
 * group, before Sanctum starts the session.
 */
final class SetSecureSessionCookie
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (config('session.secure') === null) {
            config(['session.secure' => $request->isSecure()]);
        }

        return $next($request);
    }
}
