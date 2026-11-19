<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Access\Privileges;
use PanelAlpha\ClientArea\Access\SingleUserProjectSharing;
use PanelAlpha\ClientArea\Contracts\ProjectSharing;
use PanelAlpha\ClientArea\Models\Application;
use Tests\TestCase;

/**
 * @see packages/client-area/src/apis/Instances.js (project list/show)
 * @see Architecture §7.8 (visibility through the ApplicationRepository binding)
 */
class ProjectAccessTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['staging' => 'site1stg']),
            $this->engineProject(11, 'site1stg', ['staging_of' => 'site1']),
        ]])]);
    }

    public function test_show_returns_project_by_local_id(): void
    {
        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $id = Application::query()->where('engine_username', 'site1')->value('id');

        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/Instances.js:18,137-139,141
        $this->actingAs($user)
            ->getJson("/api/projects/{$id}")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.server_account_id', $id)
            // The old InstanceResource has no `username`; the Engine username
            // is panel-internal (review R14/U10d).
            ->assertJsonPath('data.name', 'Site1')
            ->assertJsonPath('data.type', 'custom')
            ->assertJsonPath('data.service_id', 1)
            ->assertJsonPath('data.staging_apps.0.name', 'Site1stg');
    }

    public function test_a_missing_project_404_never_names_the_model_class(): void
    {
        $user = User::factory()->create();

        // CA: src/apis/Instances.js:17 (a 404 reaches `Api.getErrorMessage`,
        // which reads `response.data.message`).
        $response = $this->actingAs($user)->getJson('/api/projects/999999');

        $response->assertNotFound();
        // The old panel answered a generic message, never the FQCN.
        $this->assertSame('Not found', $response->json('message'));
        $this->assertStringNotContainsString('PanelAlpha\\ClientArea\\Models\\Application', (string) $response->json('message'));
    }

    public function test_community_is_single_user_and_never_grants_shared_access(): void
    {
        $user = User::factory()->create();

        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:77-80
        $privileges = $this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data.0.privileges');

        $this->assertContains('general.manage_labels', $privileges);
        foreach (Privileges::MULTI_USER as $privilege) {
            $this->assertNotContains($privilege, $privileges);
        }

        // The controller's single-user `ProjectSharing` answers
        // what the payload always had – the user owns it, nobody shares it.
        $this->assertInstanceOf(SingleUserProjectSharing::class, app(ProjectSharing::class));
        // CA: src/apis/Instances.js:76
        // CA reads: src/apis/Instances.js:122-124 (shared_access, owner, owned)
        $this->actingAs($user)->getJson('/api/projects')->assertOk()
            ->assertJsonPath('data.0.owned', true)
            ->assertJsonPath('data.0.owner', null)
            ->assertJsonPath('data.0.shared_access', [])
            ->assertJsonPath('data.0.staging_apps.0.shared_access', []);
    }

    /**
     * The CA loads `wordpress/maintenance-mode` and `wordpress/debug-mode` on
     * every project page that grants them (views/instance/index.vue:297-298,
     * :441-470) and alerts the answer's message; a project that is not
     * WordPress answers 422 "This project is not a WordPress installation.",
     * so it is not given the WordPress-only privileges. Backups have their
     * own controller and stay; the WordPress error log goes too, as in the old
     * panel (app-lite#1).
     */
    public function test_a_project_that_is_not_wordpress_gets_no_wordpress_only_privileges(): void
    {
        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $id = Application::query()->where('engine_username', 'site1')->value('id');

        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/privileges/privilegeMethods.js:163-168 (privileges)
        $custom = $this->actingAs($user)->getJson("/api/projects/{$id}")->assertOk()->json('data.privileges');
        foreach (Privileges::WORDPRESS_ONLY as $privilege) {
            $this->assertNotContains($privilege, $custom);
        }
        $this->assertContains('wordpress.manage_backups', $custom);
        $this->assertNotContains('wordpress.view_logs', $custom);
        $this->assertContains('general.manage_users', $custom);

        Application::query()->whereKey($id)->update(['type' => Application::TYPE_WORDPRESS]);
        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/privileges/privilegeMethods.js:163-168 (privileges)
        $wordpress = $this->actingAs($user)->getJson("/api/projects/{$id}")->assertOk()->json('data.privileges');
        foreach (Privileges::WORDPRESS_ONLY as $privilege) {
            $this->assertContains($privilege, $wordpress);
        }
    }

    /**
     * app-lite#1: a container project (here a git deploy) showed "PHP Logs",
     * which reads the host PHP-FPM's log a container project never writes. A
     * classic project keeps it.
     */
    public function test_only_a_classic_project_gets_the_php_log(): void
    {
        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/privileges/privilegeMethods.js:98 (hasViewPhpLogsPrivilege, the PHP Logs tab)
        $classic = $this->actingAs($user)->getJson("/api/projects/{$application->id}")->assertOk()->json('data.privileges');
        $this->assertContains('general.view_php_logs', $classic);

        $application->forceFill(['engine_payload' => ['details' => ['git_repo' => 'https://github.com/acme/app.git']]])->save();
        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/privileges/privilegeMethods.js:98
        $container = $this->actingAs($user)->getJson("/api/projects/{$application->id}")->assertOk()->json('data.privileges');
        $this->assertNotContains('general.view_php_logs', $container);
        $this->assertContains('general.view_webserver_logs', $container);
    }

    /**
     * Every privilege a `WordPressController` route needs is WordPress-only,
     * because the controller refuses any project that is not WordPress.
     */
    public function test_every_wordpress_controller_privilege_is_wordpress_only(): void
    {
        $found = [];
        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with((string) $route->getActionName(), 'PanelAlpha\\ClientArea\\Http\\Controllers\\Project\\WordPressController@')) {
                continue;
            }
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'privilege:')) {
                    $found[] = substr($middleware, strlen('privilege:'));
                }
            }
        }

        $this->assertNotEmpty($found);
        $this->assertSame([], array_values(array_diff(array_unique($found), Privileges::WORDPRESS_ONLY)));
        $this->assertSame([], array_values(array_diff(Privileges::WORDPRESS_ONLY, Privileges::WORDPRESS)));
    }

    public function test_show_unknown_project_is_404(): void
    {
        // CA: src/apis/Instances.js:17
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/999')
            ->assertNotFound();
    }

    public function test_show_requires_authentication(): void
    {
        // CA: src/apis/Instances.js:17
        $this->getJson('/api/projects/1')->assertUnauthorized();
    }

    public function test_privilege_middleware_uses_the_access_resolver(): void
    {
        Route::middleware(['api', 'auth', 'privilege:wordpress.manage_plugins'])
            ->get('/api/test/projects/{application}/plugins', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth', 'privilege:general.manage_cdn'])
            ->get('/api/test/projects/{application}/cdn', fn () => response()->json(['ok' => true]));

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $id = Application::query()->where('engine_username', 'site1')->value('id');

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/test/projects/{$id}/plugins")->assertOk();
        // Engine-unsupported privileges are never granted (CA hides the feature).
        $this->assertNotContains('general.manage_cdn', Privileges::ALL);
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/test/projects/{$id}/cdn")->assertForbidden();
    }
}
