<?php

namespace Tests\Feature\Account;

use App\Http\Controllers\DeviceController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The device routes: /user/devices, /user/device/forget, /user/device/logout.
 * @see packages/api/routes/api.php:719-721 (old /user/devices routes)
 * @see packages/client-area/src/apis/Auth.js (device list/forget)
 */
class DeviceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_lists_sessions_as_devices(): void
    {
        $user = User::factory()->create();

        DB::table('sessions')->insert([
            'id' => 'session-1',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(5),
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        // CA: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:408 (`Api.get('/user/devices')`)
        $response = $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->getJson('/api/user/devices')
            ->assertOk();

        $device = $response->json('data.0');
        $this->assertSame('Chrome', $device['browser']);
        $this->assertSame('Windows', $device['device']);
        $this->assertSame('session-1', $device['session_id']);
        // CA reads: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:91 (`item.ip_address`)
        $this->assertSame(TestNetwork::public(5), $device['ip_address']);
        $this->assertIsInt($device['device_id']);
        $this->assertArrayHasKey('current_device', $device);
    }

    public function test_lists_a_remembered_device_without_a_live_session(): void
    {
        $user = User::factory()->create();

        DB::table('devices')->insert([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(9),
            'user_agent' => 'Mozilla/5.0 (X11; Linux) Firefox/120.0',
            'browser' => 'Firefox',
            'device' => 'Linux',
            'detection' => true,
            'last_login' => now()->subDays(3),
        ]);

        // The old index listed remembered devices even with an expired session.
        // CA: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:408 (`Api.get('/user/devices')`)
        // CA reads: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:409 (`response.data.data`)
        $response = $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->getJson('/api/user/devices')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->assertSame('Firefox', $response->json('data.0.browser'));
        // CA reads: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:91 (`item.ip_address`)
        $this->assertSame(TestNetwork::public(9), $response->json('data.0.ip_address'));
        // CA reads: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:121 (`item.last_login`)
        $this->assertSame('3 days ago', $response->json('data.0.last_login'));
        $this->assertNull($response->json('data.0.session_id'));
        $this->assertFalse($response->json('data.0.current_device'));
    }

    public function test_an_unrecognised_user_agent_has_no_browser_or_device_label(): void
    {
        // An API client's agent names neither a browser nor a system; nothing may
        // claim one (the Client Area prints its own fallback).
        $user = User::factory()->create();

        DB::table('sessions')->insert([
            'id' => 'session-api',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(12),
            'user_agent' => 't118-test/1.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        // CA: src/components/dataIterator/tables/DevicesTable.vue:408 (`Api.get('/user/devices')`)
        $response = $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->getJson('/api/user/devices')
            ->assertOk();

        // CA reads: src/components/dataIterator/tables/DevicesTable.vue:100 (`item.browser`)
        $this->assertNull($response->json('data.0.browser'));
        // CA reads: src/components/dataIterator/tables/DevicesTable.vue:109 (`item.device`)
        $this->assertNull($response->json('data.0.device'));
        $this->assertDatabaseHas('devices', [
            'authenticatable_id' => $user->id,
            'browser' => null,
            'device' => null,
        ]);
    }

    public function test_the_migration_clears_the_undefined_labels_of_older_devices(): void
    {
        $user = User::factory()->create();
        $deviceId = DB::table('devices')->insertGetId([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(13),
            'user_agent' => 't118-test/1.0',
            'browser' => 'Undefined',
            'device' => 'Undefined',
            'last_login' => now(),
        ]);

        $migration = require database_path('migrations/2026_11_13_100000_clear_undefined_device_labels.php');
        $migration->up();

        $device = DB::table('devices')->find($deviceId);
        $this->assertNull($device->browser);
        $this->assertNull($device->device);

        // The row still lists the device; it is only the labels that are gone.
        // CA: src/components/dataIterator/tables/DevicesTable.vue:408 (`Api.get('/user/devices')`)
        // CA reads: src/components/dataIterator/tables/DevicesTable.vue:409 (`response.data.data`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->getJson('/api/user/devices')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.browser', null)
            ->assertJsonPath('data.0.device', null);
    }

    public function test_logs_out_a_session(): void
    {
        $user = User::factory()->create();
        DB::table('sessions')->insert([
            'id' => 'session-2',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(6),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:169 (`Api.post('/user/device/logout', {session_id})`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/logout', ['session_id' => 'session-2'])
            ->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'session-2']);
    }

    public function test_forgetting_a_device_without_a_live_session_still_resets_the_remember_token(): void
    {
        // A remembered device whose session already expired must be logged out
        // too.
        $user = User::factory()->create(['remember_token' => 'remember-me-token']);

        $deviceId = DB::table('devices')->insertGetId([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(8),
            'user_agent' => 'Firefox/120.0',
            'browser' => 'Firefox',
            'device' => 'Other',
            'last_login' => now(),
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:75 (`Api.post('/user/device/forget', {deviceId})`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/forget', ['deviceId' => $deviceId])
            ->assertOk();

        $this->assertNull($user->fresh()->remember_token);
    }

    public function test_a_user_cannot_log_out_another_users_session(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        DB::table('sessions')->insert([
            'id' => 'owners-session',
            'user_id' => $owner->id,
            'ip_address' => TestNetwork::public(6),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:169 (`Api.post('/user/device/logout', {session_id})`)
        // CA reads: packages/client-area/src/mixins/DevicesActionsMixin.js:184 (`Api.getErrorMessage(error)`)
        $this->actingAs($other)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/logout', ['session_id' => 'owners-session'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('session_id');

        $this->assertDatabaseHas('sessions', ['id' => 'owners-session']);
    }

    public function test_logging_out_unknown_session_is_a_validation_error(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:169 (`Api.post('/user/device/logout', {session_id})`)
        // CA reads: packages/client-area/src/mixins/DevicesActionsMixin.js:184 (`Api.getErrorMessage(error)`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/logout', ['session_id' => 'nope'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('session_id');
    }

    public function test_forgetting_a_device_resets_the_remember_token(): void
    {
        $user = User::factory()->create(['remember_token' => 'remember-me-token']);
        DB::table('sessions')->insert([
            'id' => 'session-3',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(7),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        $deviceId = DB::table('devices')->insertGetId([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(7),
            'user_agent' => 'Firefox/120.0',
            'browser' => 'Firefox',
            'device' => 'Other',
            'last_login' => now(),
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:112 (`Api.post('/user/device/forget', {deviceId})`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/forget', ['deviceId' => $deviceId])
            ->assertOk();

        // The recaller cookie can no longer authenticate.
        $this->assertNull($user->fresh()->remember_token);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-3']);
    }

    public function test_forgetting_a_device_ends_every_session_of_that_device(): void
    {
        $user = User::factory()->create();

        foreach (['session-a', 'session-b', 'session-c'] as $id) {
            DB::table('sessions')->insert([
                'id' => $id,
                'user_id' => $user->id,
                'ip_address' => TestNetwork::public(7),
                'user_agent' => 'Firefox/120.0',
                'payload' => base64_encode(serialize([])),
                'last_activity' => now()->timestamp,
            ]);
        }
        // Another device's session must survive.
        DB::table('sessions')->insert([
            'id' => 'session-other',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(9),
            'user_agent' => 'Chrome/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        $deviceId = DB::table('devices')->insertGetId([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(7),
            'user_agent' => 'Firefox/120.0',
            'browser' => 'Firefox',
            'device' => 'Other',
            'last_login' => now(),
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:112 (`Api.post('/user/device/forget', {deviceId})`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/forget', ['deviceId' => $deviceId])
            ->assertOk();

        // Every session of the forgotten device ends, not only the first.
        $this->assertSame(0, DB::table('sessions')->whereIn('id', ['session-a', 'session-b', 'session-c'])->count());
        $this->assertDatabaseHas('sessions', ['id' => 'session-other']);
    }

    /**
     * Forgetting the device that owns the caller's own
     * session must report the current session as ended, so the controller logs
     * out and invalidates it (204), not only delete the row (200).
     */
    public function test_forgetting_the_device_of_your_own_session_logs_you_out(): void
    {
        $user = User::factory()->create(['remember_token' => 'remember-me-token']);
        $this->actingAs($user);

        // Laravel's Store::isValidId requires a 40-char id.
        $sessionId = str_repeat('b', 40);
        DB::table('sessions')->insert([
            'id' => $sessionId,
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(11),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);
        $deviceId = DB::table('devices')->insertGetId([
            'authenticatable_type' => $user::class,
            'authenticatable_id' => $user->id,
            'ip_address' => TestNetwork::public(11),
            'user_agent' => 'Firefox/120.0',
            'browser' => 'Firefox',
            'device' => 'Other',
            'last_login' => now(),
        ]);

        // Drive the controller with the session id being forgotten, like the
        // logout test, so the own-session branch is deterministic.
        $request = Request::create('/api/user/device/forget', 'POST', ['deviceId' => $deviceId]);
        $store = app('session')->driver();
        $store->setId($sessionId);
        $store->start();
        $request->setLaravelSession($store);
        $request->setUserResolver(fn () => $user);

        $this->assertSame($sessionId, $request->session()->getId());

        $response = app(DeviceController::class)->destroy($request);

        $this->assertSame(204, $response->getStatusCode());
        $this->assertGuest();
        $this->assertSame(0, DB::table('sessions')->where('id', $sessionId)->count());
    }

    public function test_logging_out_a_device_resets_the_remember_token(): void
    {
        $user = User::factory()->create(['remember_token' => 'remember-me-token']);
        DB::table('sessions')->insert([
            'id' => 'session-4',
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(8),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        // CA: packages/client-area/src/mixins/DevicesActionsMixin.js:169 (`Api.post('/user/device/logout', {session_id})`)
        $this->actingAs($user)
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/user/device/logout', ['session_id' => 'session-4'])
            ->assertOk();

        $this->assertNull($user->fresh()->remember_token);
    }

    public function test_ending_your_own_session_logs_you_out(): void
    {
        $user = User::factory()->create(['remember_token' => 'remember-me-token']);
        $this->actingAs($user);

        // Drive the controller directly with a request whose session id is the
        // one being logged out, so the own-session branch (204 + logout +
        // invalidate) is tested deterministically.
        // Laravel's Store::isValidId requires a 40-char id.
        $sessionId = str_repeat('a', 40);
        DB::table('sessions')->insert([
            'id' => $sessionId,
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(9),
            'user_agent' => 'Firefox/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);

        $request = Request::create('/api/user/device/logout', 'POST', ['session_id' => $sessionId]);
        $store = app('session')->driver();
        $store->setId($sessionId);
        $store->start();
        $request->setLaravelSession($store);
        $request->setUserResolver(fn () => $user);

        $actualId = $request->session()->getId();
        $this->assertSame($sessionId, $actualId, "session id was: {$actualId}");

        $response = app(DeviceController::class)->logout($request);

        $this->assertSame(204, $response->getStatusCode());
        $this->assertGuest();
        $this->assertNull($user->fresh()->remember_token);
    }

    public function test_devices_require_authentication(): void
    {
        // CA: packages/client-area/src/components/dataIterator/tables/DevicesTable.vue:408 (`Api.get('/user/devices')`)
        $this->getJson('/api/user/devices')->assertUnauthorized();
    }
}
