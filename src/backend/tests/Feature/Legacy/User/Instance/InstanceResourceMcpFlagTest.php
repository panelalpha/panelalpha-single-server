<?php

namespace Tests\Feature\Legacy\User\Instance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Port of packages/api/tests/Feature/User/Instance/InstanceResourceMcpFlagTest.php.
 *
 * The old test built `InstanceResource($application)->toArray()` directly.
 * The port replaces that old class with the v1 read that carries
 * the same field: the project show payload (`GET /api/projects/{id}`), whose
 * `ProjectPresenter` emits `plan_settings.wordpress_mcp_enabled` hard-coded
 * `false` because the Engine has no WordPress MCP support (ProjectPresenter.php:185-194).
 */
class InstanceResourceMcpFlagTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_plan_settings_includes_wordpress_mcp_enabled(): void
    {
        $user = User::factory()->create();

        // Legacy: InstanceResourceMcpFlagTest.php:13-23 Application query with related plan + :29 authAsUser($application->user_id)
        //   → a v1 synced Engine project (EngineFixtures::syncedApplication)
        $application = $this->syncedApplication($user);

        // Legacy: InstanceResourceMcpFlagTest.php:31 (new InstanceResource($application))->toArray(request())
        //   → the v1 project show payload (ProjectPresenter)
        $payload = $this->actingAs($user)
            // CA: src/apis/Instances.js:17
            ->getJson("/api/projects/{$application->id}")
            ->assertOk()
            ->json('data');

        $this->assertIsArray($payload);
        $this->assertArrayHasKey('plan_settings', $payload);
        $this->assertArrayHasKey('wordpress_mcp_enabled', $payload['plan_settings']);
        $this->assertIsBool($payload['plan_settings']['wordpress_mcp_enabled']);
    }
}
