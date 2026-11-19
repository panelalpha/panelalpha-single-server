<?php

namespace PanelAlpha\ClientArea\Http;

use Closure;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The shared mount point of the Client Area route files: the controller and
 * the edition packages mount theirs through it, so every route is under `/api`
 * with exactly the configured middleware stack.
 */
final class ClientAreaRoutes
{
    /**
     * @param  Closure(): void  $routes
     */
    public static function group(Closure $routes): void
    {
        Route::prefix('api')
            ->middleware(self::middleware())
            ->group($routes);
    }

    /**
     * The `api` route middleware stack: the package config default is a list of
     * middleware names, but an app may override it with a single string or set it
     * to null (no extra middleware). A string or null passes through unchanged –
     * the old `->middleware(config(...))` never replaced an explicit null with an
     * empty middleware name. A list is normalized to its **string** entries
     * (`Payload::strings`), so a non-string entry such as a middleware instance is
     * dropped; any other value becomes null.
     *
     * @return array<array-key, string>|string|null
     */
    public static function middleware(): array|string|null
    {
        /** @var mixed $configured the host app may override the package default */
        $configured = config('client-area.route_middleware', ['api', 'auth']);

        if ($configured === null || is_string($configured)) {
            return $configured;
        }

        return is_array($configured) ? Payload::strings($configured) : null;
    }
}
