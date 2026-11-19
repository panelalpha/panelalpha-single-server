<?php

namespace Tests\Feature\ClientArea\Projects;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The `resources` block of `GET /projects/{id}` (project-usage, phase 1): the
 * latest usage sample, the disk measurement, the six limits a client may change
 * and their ceilings, all read from the synced Engine project.
 *
 * Contract:
 * - Engine: the project resource puts `usage` (`cpu_percent`, `memory_bytes`,
 *   `memory_limit_bytes`, `sampled_at`; null when the sample is older than 300 s),
 *   `disk` (`core/app/Http/Resources/UserResource.php:59-66`) and `config` (the
 *   limits; -1 unlimited, null not set) on every item of `GET /projects/all`.
 * - Community binds no ceiling: every ceiling is null.
 */
final class ProjectResourcesPayloadTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const KEYS = ['memory_limit', 'cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps'];

    /**
     * Sync the given Engine project and read the project page.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function page(array $overrides): array
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', $overrides),
        ]])]);
        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        /** @var array<string, mixed> $item */
        // CA: packages/client-area/src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        return $item;
    }

    public function test_a_full_payload_carries_usage_disk_limits_and_no_ceilings(): void
    {
        $item = $this->page([
            'usage' => [
                'cpu_percent' => 37.5,
                'memory_bytes' => 268435456,
                'memory_limit_bytes' => 536870912,
                'sampled_at' => '2026-11-17T09:59:00Z',
            ],
            'disk' => [
                'files_bytes' => 52428800,
                'docker_bytes' => 1048576000,
                'total_bytes' => 1101004800,
                'limit_bytes' => 10737418240,
                'measured_at' => '2026-11-17T09:45:00Z',
            ],
            'config' => [
                'memory_limit' => 512,
                'cpu_limit' => 1.5,
                'disk_space_limit' => 10240,
                'inodes_limit' => 500000,
                'device_read_bps' => 10485760,
                'device_write_bps' => 5242880,
                'bandwidth_limit' => 100,
            ],
        ]);

        $this->assertSame([
            'usage' => [
                'cpu_percent' => 37.5,
                'memory_bytes' => 268435456,
                'memory_limit_bytes' => 536870912,
                'sampled_at' => '2026-11-17T09:59:00Z',
            ],
            'disk' => [
                'total_bytes' => 1101004800,
                'limit_bytes' => 10737418240,
                'measured_at' => '2026-11-17T09:45:00Z',
            ],
            'limits' => [
                'memory_limit' => 512,
                'cpu_limit' => 1.5,
                'disk_space_limit' => 10240,
                'inodes_limit' => 500000,
                'device_read_bps' => 10485760,
                'device_write_bps' => 5242880,
            ],
            'ceilings' => array_fill_keys(self::KEYS, null),
        ], $item['resources']);
    }

    public function test_a_stale_sample_gives_usage_null_and_keeps_disk_and_limits(): void
    {
        $item = $this->page([
            'usage' => null,
            'disk' => ['total_bytes' => 2048, 'limit_bytes' => 4096, 'measured_at' => '2026-11-17T09:45:00Z'],
            'config' => ['memory_limit' => 256],
        ]);

        $this->assertNull($item['resources']['usage']);
        $this->assertSame(['total_bytes' => 2048, 'limit_bytes' => 4096, 'measured_at' => '2026-11-17T09:45:00Z'], $item['resources']['disk']);
        $this->assertSame(256, $item['resources']['limits']['memory_limit']);
    }

    public function test_a_missing_disk_block_gives_disk_null(): void
    {
        $item = $this->page([
            'usage' => ['cpu_percent' => 1.0, 'memory_bytes' => 1024, 'memory_limit_bytes' => 2048, 'sampled_at' => '2026-11-17T09:59:00Z'],
            'config' => ['memory_limit' => 256],
        ]);

        $this->assertNull($item['resources']['disk']);
        $this->assertSame(1024, $item['resources']['usage']['memory_bytes']);
    }

    public function test_unlimited_values_stay_raw_and_unset_ones_are_null(): void
    {
        $item = $this->page([
            'disk' => ['total_bytes' => 2048, 'limit_bytes' => -1, 'measured_at' => null],
            'config' => [
                'memory_limit' => 512,
                'cpu_limit' => -1,
                'disk_space_limit' => -1,
                'inodes_limit' => -1,
                'device_read_bps' => null,
            ],
        ]);

        $this->assertSame(-1, $item['resources']['disk']['limit_bytes']);
        $this->assertNull($item['resources']['disk']['measured_at']);
        $this->assertSame([
            'memory_limit' => 512,
            'cpu_limit' => -1,
            'disk_space_limit' => -1,
            'inodes_limit' => -1,
            'device_read_bps' => null,
            'device_write_bps' => null,
        ], $item['resources']['limits']);
    }

    public function test_a_project_without_an_engine_payload_has_no_resources(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);
        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site2',
            'domain' => 'site2.example.com',
            'type' => Application::TYPE_CUSTOM,
            'status' => 'active',
        ]);
        $this->assertNull($application->engine_payload);

        // CA: packages/client-area/src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        $this->assertArrayHasKey('resources', $item);
        $this->assertNull($item['resources']);
    }
}
