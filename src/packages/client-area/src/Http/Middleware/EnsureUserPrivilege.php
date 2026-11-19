<?php

namespace PanelAlpha\ClientArea\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware `privilege-user:<name>` – the old panel's privilege
 * middleware for routes that are not tied to one application:
 * the onboarding domain step and the onboarding deploy. It is a
 * *route* middleware, so the privilege is checked **before** the FormRequest
 * validation, exactly as the old `privilege:` middleware ran before the
 * controller.
 *
 *   Route::post('/projects/deploy', ...)
 *       ->middleware('privilege-user:service.create_instance');
 *
 * The application-scoped counterpart is EnsureApplicationPrivilege (`privilege:`).
 */
final class EnsureUserPrivilege
{
    public function __construct(private readonly AccessResolver $access) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $privilege): Response
    {
        $user = $request->user();

        if ($user === null || ! $this->access->allowsUser($user, $privilege)) {
            abort(403, 'You do not have permission to perform this action.');
        }

        return $next($request);
    }
}
