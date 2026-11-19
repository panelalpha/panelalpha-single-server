<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\Response;

/**
 * Let a browser on the saved panel URL keep its Sanctum session. Sanctum
 * matches the Referer/Origin host, port included, against
 * `sanctum.stateful`, so the stored `host[:port]` is appended for this request.
 * A no-op when no URL is stored. Registered in the `api` group before
 * `statefulApi()`.
 */
final class AddPanelUrlToStatefulDomains
{
    public function __construct(private readonly PanelUrl $panelUrl) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {
            $stored = $this->panelUrl->stored();
        } catch (QueryException) {
            // No settings table yet (a fresh checkout before the migration):
            // nothing is stored, so there is no host to add.
            $stored = null;
        }
        $host = $stored === null ? null : parse_url($stored, PHP_URL_HOST);

        if (is_string($host) && $host !== '') {
            $port = parse_url((string) $stored, PHP_URL_PORT);
            $entry = is_int($port) ? $host.':'.$port : $host;
            $stateful = Payload::strings(config('sanctum.stateful'));

            if (! in_array($entry, $stateful, true)) {
                config(['sanctum.stateful' => [...$stateful, $entry]]);
            }
        }

        return $next($request);
    }
}
