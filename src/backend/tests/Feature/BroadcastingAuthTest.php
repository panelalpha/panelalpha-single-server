<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * @see packages/client-area/src/apis/Api.js (Echo authorisation), routes/channels.php
 * @see Architecture §4.4 step 5 (channel auth on the session)
 */
class BroadcastingAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_authenticate_broadcast(): void
    {
        // CA: packages/client-area/src/main.js:27 (the Echo endpoint `${apiUrl}/broadcasting/auth`)
        $this->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-user.deadbeef',
        ])->assertUnauthorized();
    }

    public function test_user_can_authenticate_own_channel(): void
    {
        $user = User::factory()->create([
            'email' => 'ws@example.com',
        ]);

        $hash = $user->gravatarHash();

        // CA: packages/client-area/src/main.js:27 (the Echo endpoint `${apiUrl}/broadcasting/auth`)
        // CA reads: packages/client-area/src/main.js:27 (Echo expects the `{auth}` envelope)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/broadcasting/auth', [
                'socket_id' => '1234.5678',
                'channel_name' => 'private-user.'.$hash,
            ])
            ->assertOk()
            ->assertJsonStructure(['auth']);
    }

    public function test_user_cannot_authenticate_foreign_channel(): void
    {
        $user = User::factory()->create([
            'email' => 'ws@example.com',
        ]);

        // CA: packages/client-area/src/main.js:27 (the Echo endpoint `${apiUrl}/broadcasting/auth`)
        $response = $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/broadcasting/auth', [
                'socket_id' => '1234.5678',
                'channel_name' => 'private-user.not-my-hash',
            ]);

        $response->assertForbidden();
    }
}
