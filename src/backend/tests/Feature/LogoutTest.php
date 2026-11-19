<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * @see packages/api/routes/api.php:135 (old /logout)
 * @see packages/client-area/src/apis/Auth.js:273
 */
class LogoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_logout_forgets_the_session_and_returns_success(): void
    {
        $user = User::factory()->create();

        // Origin makes Sanctum's stateful middleware start the session.
        // CA: packages/client-area/src/apis/Auth.js:273 (`Api.post('/logout')`)
        // CA reads: packages/client-area/src/apis/Auth.js:273 (the CA clears local state on success)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/logout')
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertGuest();
    }

    public function test_logout_requires_authentication(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:273 (`Api.post('/logout')`)
        $this->postJson('/api/logout')->assertUnauthorized();
    }
}
