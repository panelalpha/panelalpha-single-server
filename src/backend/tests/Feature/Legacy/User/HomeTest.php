<?php

namespace Tests\Feature\Legacy\User;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/HomeTest.php. The old
 * `ConnectionLog` counter is replaced by v1's
 * Engine HTTP assertion: `/home` never calls the Engine on the request path
 *The response assertion and the request are kept as written.
 *
 * The old bound (fewer than 25 queries) holds again. v1 had
 * answered 26 because every setting was its own query; `Setting::get` now
 * reads the settings map once per request, and the test pins the four
 * queries left by name.
 */
class HomeTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_home_endpoint_execution(): void
    {
        // Legacy: HomeTest.php:19-21 User::first() + authAsUser() → v1 factory user.
        $user = User::factory()->create();
        $this->actingAs($user);

        // Legacy: HomeTest.php:23 ConnectionLog counter → v1's Engine HTTP fake:
        // /home never calls the Engine on the request path, so nothing is sent.
        Http::fake();

        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        $startTime = microtime(true);
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.get('/home')`)
        $response = $this->get('/api/home');
        $endTime = microtime(true);

        $executionTime = $endTime - $startTime;

        // Legacy: HomeTest.php:37 assertStatus(200) kept.
        $response->assertStatus(200);
        // Legacy: HomeTest.php:38 ConnectionLog equality → no Engine call.
        Http::assertNothingSent();
        // Legacy: HomeTest.php:39 assertLessThan(0.5, …) kept.
        $this->assertLessThan(0.5, $executionTime, 'Response time exceeds 500ms');

        // Legacy: HomeTest.php:40 assertLessThan(25, …) kept.
        $this->assertLessThan(25, count($queries), 'The number of SQL queries exceeds 25');

        // The v1 budget, each query named. The settings are read
        // once per request (`Setting::get`, one map for every key) instead of
        // one query per key (23 before); the never-synced check and its
        // SyncEnginesJob dispatch are by design (/home
        // never calls the Engine, it queues the first sync).
        $this->assertSame([
            'select "value", "name" from "settings"',
            // `excludingSelf`: the panel's own project and every project that runs a panel are out.
            'select * from "applications" where "engine_id" = ? and (json_extract("engine_payload", \'$."details"."deploy_platform"\') is null or json_extract("engine_payload", \'$."details"."deploy_platform"\') not in (?, ?)) and (json_extract("engine_payload", \'$."details"."env_override_keys"\') is null or not exists (select 1 from json_each("engine_payload", \'$."details"."env_override_keys"\') where "json_each"."value" is ?)) order by "id" asc',
            'select exists(select * from "engine_sync_states" where "engine_id" = ? and "synced_at" is not null) as "exists"',
            'insert into "jobs" ("queue", "attempts", "reserved_at", "available_at", "created_at", "payload") values (?, ?, ?, ?, ?, ?)',
        ], $queries);
    }
}
