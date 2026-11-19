<?php

namespace Tests\Feature;

use Illuminate\Encryption\Encrypter;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * @see Architecture §4.4 step 2 ("GET /api/csrf-cookie") and the real-CSRF recipe
 */
class CsrfCookieTest extends TestCase
{
    use RefreshDatabase;

    public function test_csrf_cookie_sets_xsrf_and_session_cookies(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:315 (`Api.get('/csrf-cookie')`)
        $response = $this->get('/api/csrf-cookie');

        $response->assertNoContent();

        $cookies = $response->headers->getCookies();
        $names = array_map(fn ($cookie) => $cookie->getName(), $cookies);

        $this->assertContains('XSRF-TOKEN', $names);
        $this->assertTrue(
            collect($names)->contains(fn (string $name) => str_contains($name, 'session')),
            'Expected a session cookie among: '.implode(', ', $names)
        );
    }

    /**
     * The one real-CSRF test: Laravel skips CSRF under
     * PHPUnit, so a subclass with the skip off proves the stateful request is
     * really verified – 419 without the token, through with it.
     */
    public function test_a_stateful_request_requires_the_xsrf_token(): void
    {
        $this->app->bind(PreventRequestForgery::class, fn ($app) => new class($app, $app->make(Encrypter::class)) extends PreventRequestForgery
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        });

        // Sanctum treats the request as stateful for this origin.
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080');

        // No token: rejected before the controller (and so before any Engine).
        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'secret'])
            ->assertStatus(419);

        // With the session's token (the value the XSRF-TOKEN cookie carries)
        // the request reaches the controller – the login step, never a 419.
        // CA: packages/client-area/src/apis/Auth.js:315 (`Api.get('/csrf-cookie')`)
        $this->get('/api/csrf-cookie');
        $token = (string) $this->app['session.store']->token();

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->withHeader('X-CSRF-TOKEN', $token)
            ->postJson('/api/login', ['email' => 'user@example.com'])
            ->assertOk();
    }
}
