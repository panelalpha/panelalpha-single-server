<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\OriginMismatchException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\Response;

/**
 * A browser request that changes state must come from the panel's own origin;
 * one from another site is refused even when it carries the session cookie and
 * the CSRF token. `Origin` is the header a browser always sends on such a
 * request and it wins over `Referer`; a request with neither header is not a
 * browser (a script or a loopback call) and passes. The `api` group, so every
 * Client Area route is covered.
 */
final class RefuseForeignOrigin
{
    /** The methods Laravel's CSRF middleware treats as writes. */
    private const array STATE_CHANGING = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(private readonly PanelUrl $panelUrl) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->getMethod(), self::STATE_CHANGING, true)) {
            return $next($request);
        }

        $origin = $request->headers->get('origin');
        if ($origin === null || $origin === '') {
            $origin = $request->headers->get('referer');
        }

        if ($origin === null || $origin === '' || $this->isOwnOrigin($origin, $request)) {
            return $next($request);
        }

        throw new OriginMismatchException('Origin mismatch.');
    }

    private function isOwnOrigin(string $origin, Request $request): bool
    {
        $host = $this->host($origin);

        return $host !== '' && Str::is($this->ownHosts($request), $host);
    }

    /**
     * The origins the panel answers to: the host the browser used, its saved
     * URL (or `APP_URL`) and every host Sanctum already trusts as stateful.
     *
     * @return list<string>
     */
    private function ownHosts(Request $request): array
    {
        $hosts = [$request->getHttpHost(), Payload::string(config('app.url'))];

        try {
            $hosts[] = $this->panelUrl->base();
        } catch (QueryException) {
            // A fresh checkout before the migration has no stored URL.
        }

        foreach (Payload::strings(config('sanctum.stateful')) as $stateful) {
            $hosts[] = $stateful;
        }

        return array_values(array_filter(array_map(fn (string $value): string => $this->host($value), $hosts)));
    }

    /** `host[:port]` of a URL or a bare host, lower-cased, without a default port. */
    private function host(string $value): string
    {
        $value = strtolower(trim($value));
        if (! str_contains($value, '://')) {
            $value = 'http://'.$value;
        }

        $host = parse_url($value, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return '';
        }

        $port = parse_url($value, PHP_URL_PORT);
        $host = is_int($port) ? $host.':'.$port : $host;

        return (string) preg_replace('#:(80|443)$#', '', $host);
    }
}
