<?php

namespace PanelAlpha\ClientArea\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use PanelAlpha\ClientArea\Contracts\ActingAdmin;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Models\ActivityLog;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records a panel-side activity entry for every successful mutating Client
 * Area request. The Client Area shows these on the project
 * Logs tab; the Engine keeps no history.
 *
 * `action` is the route name; the CA translates it (or prettifies it). A
 * controller can attach extra data with `$request->attributes->set('activity',
 * [...])` (labels, plugin/theme names, changed values) – it becomes `payload`.
 *
 * Read-only requests are skipped, and a failing log write never fails the
 * request it describes.
 *
 * The `activity` middleware alias: the activity log is a Client Area feature
 *So the controller registers it directly.
 *
 * An admin signed in as the user ("login as user", the paid edition's
 * `ActingAdmin`) is recorded with the entry – `admin_as_user` true and the
 * admin's id – so the user's own logs and last activity leave it out (old
 * `LogRequests`); the user's own entries leave both null.
 */
final class LogActivity
{
    private const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(private readonly ActingAdmin $actingAdmin) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (in_array($request->method(), self::MUTATING, true)
            && $response->getStatusCode() >= 200
            && $response->getStatusCode() < 300
        ) {
            $this->record($request);
        }

        return $response;
    }

    private function record(Request $request): void
    {
        /** @var mixed $route */
        $route = $request->route();
        $user = $request->user();

        if (! $route instanceof Route || $user === null) {
            return;
        }

        // The CA translates and switches on the **old** action name: a
        // controller override wins (a route registered for two path segments
        // logs under a different old name in each), then a route default, then
        // the map. A route in neither logs nothing – the CA cannot translate a
        // v1 name, so there is no fallback.
        $override = Payload::nullableString($request->attributes->get('activity_action'));
        $routeAction = Payload::nullableString($route->defaults['activity'] ?? null) ?? ActivityActionMap::for($route->getName());
        $action = $override !== null && $override !== '' ? $override : $routeAction;
        if ($action === null) {
            return;
        }

        $application = $route->parameter('application');
        $applicationId = $application instanceof Application ? $application->id : null;
        $payload = is_array($request->attributes->get('activity'))
            ? Payload::object($request->attributes->get('activity'))
            : null;

        // The request deleted its own application row: keep the FK out of it and
        // snapshot what was deleted, so the entry survives. The lookup is
        // id-scoped by design; this line is on ApplicationQueryRule's id-scoped
        // allow-list.
        if ($application instanceof Application
            && $applicationId !== null
            && $request->method() === 'DELETE'
            && ! Application::query()->whereKey($applicationId)->exists()
        ) {
            $payload = is_array($payload) ? $payload : [];
            $payload['App\\Models\\Application:'.$applicationId] = [
                'id' => $applicationId,
                'name' => $application->name,
                'domain' => $application->presentedDomain(),
                'type' => $application->type,
            ];
            $applicationId = null;
        }

        $admin = $this->actingAdmin->of($request);

        try {
            ActivityLog::query()->create([
                'admin_as_user' => $admin !== null ? true : null,
                'admin_id' => $admin['admin_id'] ?? null,
                'action' => $action,
                'user_id' => $user->getAuthIdentifier(),
                'application_id' => $applicationId,
                'request_method' => $request->method(),
                'request_uri' => mb_substr($request->getPathInfo(), 0, 255),
                'ip_address' => $request->ip(),
                'payload' => is_array($payload) ? $payload : null,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
