<?php

namespace Tests\Feature\Legacy\User;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/AuthTest.php. The old
 * `hasConfig('user')` skip and `authAsUser()`
 * helper are replaced by a v1 factory user; the requests and the response
 * assertions stay as written.
 */
class AuthTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_user_login(): void
    {
        // Legacy: AuthTest.php:18-21 (`hasConfig('user')` skip) → v1 supplies the
        // test user with the factory.
        $user = User::factory()->create([
            'email' => 'legacy-user@example.com',
            'password' => 'password123',
        ]);

        // Legacy: AuthTest.php:27 assertGuest('web-user') → v1's default guard.
        $this->assertGuest();

        // Legacy: AuthTest.php:29-32 getConfig('user.email')/('user.password')
        // → the factory user's credentials.
        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->post('/api/login', [
                'email' => $user->email,
                'password' => 'password123',
            ]);

        // Legacy: AuthTest.php:50 assertStatus(200) kept.
        $response->assertStatus(200);

        // Legacy: AuthTest.php:52 assertAuthenticated('web-user') → v1's default guard.
        $this->assertAuthenticated();
    }

    public function test_user_logout(): void
    {
        // Legacy: AuthTest.php:63-66 (`hasConfig('user')` skip) → factory user.
        $user = User::factory()->create();

        // Legacy: AuthTest.php:68 authAsUser() → actingAs($user).
        $this->actingAs($user);
        // Legacy: AuthTest.php:69 assertAuthenticated('web-user') → default guard.
        $this->assertAuthenticated();

        // CA: packages/client-area/src/apis/Auth.js:273 (`Api.post('/logout')`)
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->post('/api/logout');

        // Legacy: AuthTest.php:71 assertGuest('web-user') → default guard.
        $this->assertGuest();
        // Legacy: AuthTest.php:72 assertStatus(200) kept.
        $response->assertStatus(200);
    }

    public function test_user_websocket_connect(): void
    {
        // Legacy: AuthTest.php:75-102 – the handshake host is hard-coded and the
        // test asserts only `assertTrue(true)`; v1 has no CA HTTP contract for a
        // raw websocket handshake. The authenticated channel side is covered by
        // tests/Feature/BroadcastingAuthTest.php (POST /broadcasting/auth).
        $this->markTestSkipped('Legacy N/A: raw websocket handshake, no CA route');
    }
}
