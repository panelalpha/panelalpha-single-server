<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * @see packages/client-area/src/apis/Instances.js:53-71 (the list query)
 * @see Engine core/routes/api.php:141 (GET /projects/all)
 */
class ProjectsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_guest_cannot_list_projects(): void
    {
        // CA: src/apis/Instances.js:76
        $this->getJson('/api/projects')->assertUnauthorized();
    }

    public function test_missing_engine_settings_returns_service_unavailable(): void
    {
        $user = User::factory()->create();

        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $this->actingAs($user)
            ->getJson('/api/projects')
            ->assertStatus(503)
            ->assertJsonFragment([
                'message' => 'Engine connection is not configured. Set engine-api-url and engine-api-token via settings:set.',
            ]);
    }

    public function test_an_unreachable_engine_is_503_when_never_synced(): void
    {
        config(['client-area.sync_ttl' => 0]);
        $this->configureEngine();
        $user = User::factory()->create();

        // Never synced + connection error: nothing cached, the Engine error bubbles (503).
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => fn () => throw new ConnectionException('Engine down')]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertStatus(503);
    }

    public function test_an_engine_5xx_is_502_when_never_synced(): void
    {
        config(['client-area.sync_ttl' => 0]);
        $this->configureEngine();
        $user = User::factory()->create();

        // A 5xx is the Engine's fault, not the user's -> 502.
        // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's 5xx body)
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['message' => 'boom'], 500)]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertStatus(502);
    }

    public function test_a_cached_mirror_is_served_when_the_engine_is_down(): void
    {
        config(['client-area.sync_ttl' => 0]);
        $this->configureEngine();
        $user = User::factory()->create();

        // A previous successful sync left a mirror row and the persistent marker.
        Application::create([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'synced_at' => now(),
        ]);
        \PanelAlpha\ClientArea\Models\EngineSyncState::query()->create([
            'engine_id' => 1,
            'synced_at' => now(),
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => fn () => throw new ConnectionException('Engine down')]);

        // syncIfStale reports the failure and serves the mirror (ApplicationSynchronizer::syncIfStale).
        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $this->actingAs($user)
            ->getJson('/api/projects')
            ->assertOk()
            ->assertJsonPath('data.0.domain', 'site1.example.com');
    }

    public function test_lists_projects_from_engine_with_pagination_meta(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response([
                'data' => [
                    [
                        'id' => 10,
                        'username' => 'site1',
                        'domain' => 'site1.example.com',
                        'name' => 'Site One',
                        'email' => 'a@example.com',
                        'status' => 'active',
                        'staging_of' => null,
                        'staging' => 'site1-stg',
                        'details' => [],
                        'config' => [],
                        'created_at' => '2026-01-02T00:00:00.000000Z',
                        'updated_at' => '2026-01-02T00:00:00.000000Z',
                        'domain_names' => ['site1.example.com'],
                    ],
                    [
                        'id' => 11,
                        'username' => 'site1-stg',
                        'domain' => 'stg.site1.example.com',
                        'name' => 'Site One Staging',
                        'email' => 'a@example.com',
                        'status' => 'active',
                        'staging_of' => 'site1',
                        'staging' => null,
                        'details' => [],
                        'config' => [],
                        'created_at' => '2026-01-03T00:00:00.000000Z',
                        'updated_at' => '2026-01-03T00:00:00.000000Z',
                        'domain_names' => ['stg.site1.example.com'],
                    ],
                    [
                        'id' => 12,
                        'username' => 'site2',
                        'domain' => 'site2.example.com',
                        'name' => 'Site Two',
                        'email' => 'b@example.com',
                        'status' => 'suspended',
                        'staging_of' => null,
                        'staging' => null,
                        'details' => [],
                        'config' => [],
                        'created_at' => '2026-01-01T00:00:00.000000Z',
                        'updated_at' => '2026-01-01T00:00:00.000000Z',
                        'domain_names' => ['site2.example.com'],
                    ],
                ],
            ], 200),
        ]);

        $user = User::factory()->create();

        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80 (meta), instanceResource (data)
        $response = $this->actingAs($user)
            ->getJson('/api/projects?page=1&per_page=10&sort_by=domain&sort_dir=asc');

        // CA reads: src/apis/Instances.js:77-80 (meta), instanceResource (data)
        $response
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.sort_by', 'domain')
            ->assertJsonPath('meta.sort_dir', 'asc')
            ->assertJsonPath('data.0.domain', 'site1.example.com')
            ->assertJsonPath('data.0.url', 'https://site1.example.com')
            ->assertJsonPath('data.0.name', 'Site One')
            // The panel's own schedule: the CA shows the Automatic Backups
            // switch (src/views/instance/Backups.vue:24), editable on Community
            // (src/components/backups/BackupAutomaticSwitcher.vue:79), and
            // does not warn about a schedule it has not read yet
            // (src/apis/Instances.js:325-333).
            ->assertJsonPath('data.0.server_settings.uses_own_backup_system', false)
            ->assertJsonPath('data.0.automatic_backups_editable', true)
            ->assertJsonPath('data.0.has_automatic_backup', null)
            ->assertJsonPath('data.0.privileges.0', 'general.manage_labels')
            ->assertJsonPath('data.0.staging_apps.0.domain', 'stg.site1.example.com')
            ->assertJsonPath('data.1.domain', 'site2.example.com');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/projects/all')
                && $request->hasHeader('Authorization', 'Bearer 1|test-token');
        });
    }

    public function test_search_term_filters_projects(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response([
                'data' => [
                    [
                        'id' => 1,
                        'username' => 'alpha',
                        'domain' => 'alpha.test',
                        'name' => 'Alpha',
                        'status' => 'active',
                        'staging_of' => null,
                        'staging' => null,
                        'created_at' => '2026-01-01T00:00:00.000000Z',
                    ],
                    [
                        'id' => 2,
                        'username' => 'beta',
                        'domain' => 'beta.test',
                        'name' => 'Beta',
                        'status' => 'active',
                        'staging_of' => null,
                        'staging' => null,
                        'created_at' => '2026-01-02T00:00:00.000000Z',
                    ],
                ],
            ], 200),
        ]);

        $user = User::factory()->create();

        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $this->actingAs($user)
            ->getJson('/api/projects?search_term=beta')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.domain', 'beta.test');
    }

    public function test_labels_and_server_account_filters(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                ['id' => 1, 'username' => 'alpha', 'domain' => 'alpha.test', 'name' => 'Alpha', 'status' => 'active', 'staging_of' => null, 'staging' => null],
                ['id' => 2, 'username' => 'beta', 'domain' => 'beta.test', 'name' => 'Beta', 'status' => 'active', 'staging_of' => null, 'staging' => null],
            ]]),
        ]);

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $alpha = Application::query()->where('engine_username', 'alpha')->firstOrFail();
        $beta = Application::query()->where('engine_username', 'beta')->firstOrFail();
        ApplicationLabel::query()->create(['application_id' => $alpha->id, 'title' => 'Prod', 'color' => '#ff0000']);

        // `labels=Prod` keeps the projects carrying any of them.
        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $this->actingAs($user)
            ->getJson('/api/projects?labels=Prod')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.domain', 'alpha.test');

        // `server_account_id` is the project id in single-server mode.
        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $this->actingAs($user)
            ->getJson('/api/projects?server_account_id='.$beta->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.domain', 'beta.test');
    }
}
