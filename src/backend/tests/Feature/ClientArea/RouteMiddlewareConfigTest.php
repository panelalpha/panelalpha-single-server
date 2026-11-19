<?php

namespace Tests\Feature\ClientArea;

use PanelAlpha\ClientArea\Http\ClientAreaRoutes;
use Tests\TestCase;

/**
 * The package `/api` route middleware is taken from
 * `client-area.route_middleware`. A string or null override passes through
 * unchanged, while a list is normalized to its **string** entries – a non-string
 * entry such as a middleware instance is dropped (the old `->middleware(config(...))`
 * passed the list as-is).
 *
 * The normaliser moved to `ClientAreaRoutes::middleware()`,
 * where the controller and legacy route files share it; this test follows it.
 */
class RouteMiddlewareConfigTest extends TestCase
{
    public function test_the_configured_list_is_passed_through_unchanged(): void
    {
        config(['client-area.route_middleware' => ['api', 'auth', 'activity']]);

        $this->assertSame(['api', 'auth', 'activity'], $this->routeMiddleware());
    }

    public function test_a_string_override_is_passed_through(): void
    {
        config(['client-area.route_middleware' => 'auth']);

        $this->assertSame('auth', $this->routeMiddleware());
    }

    public function test_a_null_override_is_passed_through(): void
    {
        config(['client-area.route_middleware' => null]);

        $this->assertNull($this->routeMiddleware());
    }

    public function test_an_array_override_is_filtered_to_its_string_entries(): void
    {
        // `Payload::strings()` drops a non-string entry (a middleware instance),
        // which the old `->middleware(config(...))` would have received.
        $instance = new class
        {
            public function handle(): void {}
        };
        config(['client-area.route_middleware' => ['api', $instance, 'auth']]);

        $this->assertSame(['api', 'auth'], $this->routeMiddleware());
    }

    private function routeMiddleware(): array|string|null
    {
        return ClientAreaRoutes::middleware();
    }
}
