<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The Engine proxy terminates TLS and forwards
 * `X-Forwarded-Proto`. nginx forwards that header only from a trusted front
 * proxy (an untrusted peer's value is replaced with the real scheme), the host
 * app trusts it only from the container nginx (loopback), and the session
 * cookie is Secure when the request is https.
 *
 * The spoof is proven here and in the real image by
 * `backend/scripts/check-container-config.sh`; the client-area build must not
 * bake a build-time websocket host (`packages/client-area/src/main.js:22-32`
 * reads it from `window.location` at runtime).
 *
 * @see src/config/nginx.conf
 * @see src/backend/bootstrap/app.php
 * @see src/backend/app/Http/Middleware/SetSecureSessionCookie.php
 */
final class ForwardedProtoTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The SPA's same-origin calls reach a stateful API.
        config(['sanctum.stateful' => [TestNetwork::LOOPBACK]]);
    }

    private function sessionCookie(TestResponse $response): ?Cookie
    {
        return collect($response->headers->getCookies())
            ->first(fn (Cookie $cookie): bool => $cookie->getName() === config('session.cookie'));
    }

    public function test_a_spoofed_forwarded_proto_from_an_untrusted_peer_is_ignored(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50 (same-origin /home)
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::public(7)]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', [
            'Origin' => 'http://'.TestNetwork::LOOPBACK,
            'X-Forwarded-Proto' => 'https',
        ])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie, 'a stateful request must start a session');
        $this->assertFalse($cookie->isSecure(), 'an untrusted X-Forwarded-Proto must not mark the cookie Secure');
    }

    public function test_a_spoofed_forwarded_for_cannot_make_an_untrusted_peer_look_trusted(): void
    {
        // The spoof the review-14 N1 probe closed: a public peer claims its own
        // address is loopback and then sends https. Both headers are ignored.
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::public(7)]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', [
            'Origin' => 'http://'.TestNetwork::LOOPBACK,
            'X-Forwarded-For' => TestNetwork::LOOPBACK,
            'X-Forwarded-Proto' => 'https',
        ])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie);
        $this->assertFalse($cookie->isSecure());
    }

    public function test_a_trusted_proxy_https_is_honoured(): void
    {
        // The container nginx is the only trusted peer.
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::LOOPBACK]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', [
            'Origin' => 'http://'.TestNetwork::LOOPBACK,
            'X-Forwarded-For' => TestNetwork::public(9),
            'X-Forwarded-Proto' => 'https',
        ])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isSecure(), 'a trusted proxy https must mark the session cookie Secure');
    }

    public function test_a_trusted_proxy_without_forwarded_proto_stays_http(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::LOOPBACK]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', [
            'Origin' => 'http://'.TestNetwork::LOOPBACK,
            'X-Forwarded-For' => TestNetwork::public(9),
        ])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie);
        $this->assertFalse($cookie->isSecure(), 'without X-Forwarded-Proto the request is http');
    }

    public function test_an_explicit_session_secure_setting_is_kept(): void
    {
        // An operator's SESSION_SECURE_COOKIE=true is not overridden by an
        // untrusted peer's http.
        config(['session.secure' => true]);
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::public(7)]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', ['Origin' => 'http://'.TestNetwork::LOOPBACK])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isSecure());
    }

    public function test_an_explicit_insecure_session_setting_is_kept(): void
    {
        // An operator's SESSION_SECURE_COOKIE=false must not be flipped to
        // Secure by the trusted X-Forwarded-Proto: an explicit value wins.
        config(['session.secure' => false]);
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::LOOPBACK]);
        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home', [
            'Origin' => 'http://'.TestNetwork::LOOPBACK,
            'X-Forwarded-For' => TestNetwork::public(9),
            'X-Forwarded-Proto' => 'https',
        ])->assertOk();

        $cookie = $this->sessionCookie($response);
        $this->assertNotNull($cookie);
        $this->assertFalse($cookie->isSecure(), 'an explicit SESSION_SECURE_COOKIE=false must keep the cookie insecure');
    }

    public function test_the_panel_trusts_the_proto_header_only_from_loopback(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')->assertOk();

        $this->assertSame(
            Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO,
            SymfonyRequest::getTrustedHeaderSet(),
        );
    }

    public function test_no_host_is_baked_into_the_client_area_build(): void
    {
        // The Client Area (src/frontend/client-area) reads the websocket host and
        // port from window.location (src/shared/realtime/echo-client.ts) unless a
        // VITE_WEBSOCKET_* is baked in at build time.
        $dockerfile = (string) file_get_contents(base_path('../../Dockerfile'));
        $start = (int) strpos($dockerfile, 'AS client-area');
        $end = (int) strpos($dockerfile, 'AS backend-deps');
        $stage = substr($dockerfile, $start, $end - $start);

        foreach (['VITE_API_URL', 'VITE_WEBSOCKET_HOST', 'VITE_WEBSOCKET_PORT', 'VITE_WEBSOCKET_PATH'] as $key) {
            $this->assertStringContainsString('test -z "${'.$key.':-}"', $stage);
            $this->assertStringNotContainsString($key.'=', $stage, "no build-time {$key} may be baked in");
        }
        $this->assertStringNotContainsString('ENV VITE_', $stage);
        $this->assertStringNotContainsString('ARG VITE_', $stage);
    }
}
