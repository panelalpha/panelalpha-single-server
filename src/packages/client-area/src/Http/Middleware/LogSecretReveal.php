<?php

namespace PanelAlpha\ClientArea\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use PanelAlpha\ClientArea\Contracts\ActingAdmin;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records the refused requests of the secret reveal route – stopped by the
 * privilege, the password confirmation or the throttle – so the project's Logs
 * tab shows every attempt: user, project, the secret asked for, the IP, the
 * user agent and whether the answer carried the value. The value is never
 * written, and a granted request is recorded by `LogActivity` with the payload
 * the controller attaches.
 *
 * It wraps the route's other guards (it is the first middleware of the route),
 * so it sees the answer of each of them, and the value stays out of the entry
 * either way. The throttle answers ahead of it and throws: that refusal is
 * recorded by the limiter's own response callback, {@see refused()}.
 */
final class LogSecretReveal
{
    public const ACTION = 'user.instance.secret.reveal';

    /**
     * The payload of the granted entry, which the controller attaches for `LogActivity`.
     *
     * @return array{secret: string|null, granted: bool, user_agent: string}
     */
    public static function grantedPayload(Request $request): array
    {
        return [
            'secret' => Payload::nullableString($request->input('secret')),
            'granted' => true,
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ];
    }

    public function __construct(
        private readonly ActingAdmin $actingAdmin,
        private readonly ApplicationRepository $applications,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $status = $response->getStatusCode();
        if ($status < 200 || $status >= 300) {
            $this->record($request, $status);
        }

        return $response;
    }

    /**
     * Records a refusal answered before this middleware runs – the throttle's.
     */
    public function refused(Request $request, int $status): void
    {
        $this->record($request, $status);
    }

    private function record(Request $request, int $status): void
    {
        /** @var mixed $route */
        $route = $request->route();
        $user = $request->user();

        if (! $route instanceof Route || $user === null) {
            return;
        }

        $admin = $this->actingAdmin->of($request);

        try {
            ActivityLog::query()->create([
                'admin_as_user' => $admin !== null ? true : null,
                'admin_id' => $admin['admin_id'] ?? null,
                'action' => self::ACTION,
                'user_id' => $user->getAuthIdentifier(),
                'application_id' => $this->applicationId($request, $route),
                'request_method' => $request->method(),
                'request_uri' => mb_substr($request->getPathInfo(), 0, 255),
                'ip_address' => $request->ip(),
                'payload' => [
                    'secret' => Payload::nullableString($request->input('secret')),
                    'granted' => false,
                    'status' => $status,
                    'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * The project the request names. The throttle answers before the route
     * binding, so a request it refuses still carries the raw id.
     */
    private function applicationId(Request $request, Route $route): ?int
    {
        $parameter = $route->parameter('application');

        if ($parameter instanceof Application) {
            return $parameter->id;
        }

        $user = $request->user();

        if ($user === null || ! is_string($parameter) || ! ctype_digit($parameter)) {
            return null;
        }

        // The local mirror only: a refused request must not wait on the Engine.
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            if ($application->id === (int) $parameter) {
                return $application->id;
            }
        }

        return null;
    }
}
