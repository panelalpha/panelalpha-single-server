<?php

namespace PanelAlpha\ClientArea\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Models\Application;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware `privilege:<name>` – the server-side twin of the CA's
 * privileges.includes(<name>) checks.
 *
 *   Route::put('/projects/{application}/wordpress/plugins/{plugin}/activate', ...)
 *       ->middleware('privilege:wordpress.manage_plugins');
 *
 * Needs the {application} route parameter (already resolved and scoped to the
 * user by ApplicationRepository through route binding).
 */
final class EnsureApplicationPrivilege
{
    public function __construct(private readonly AccessResolver $access) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $privilege): Response
    {
        $application = $request->route('application');
        $user = $request->user();

        if (! $application instanceof Application || $user === null) {
            abort(403);
        }

        if (! $this->access->allows($user, $application, $privilege)) {
            abort(403, 'You do not have permission to perform this action.');
        }

        return $next($request);
    }
}
