<?php

namespace Tests\Feature\Legacy\User\Instance\Wordpress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/Instance/Wordpress/WpConfigTest.php.
 * The old method made no HTTP request: it called `->wordpress()->config()->set()/list()` through the
 * hosting integration and asserted a filesystem path. The port re-expresses the same
 * set-then-read intent as the v1 config routes (`GET/POST
 * /api/projects/{id}/wordpress/config`) and asserts the CA shape.
 */
class WpConfigTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function wordpressApplication(User $user): Application
    {
        // Legacy: WpConfigTest.php:40-43 `Application::find($applicationId)` +
        // `markTestSkipped('Application not found')` → the v1 fixture always
        // exists; the provider row at :21-23 is a pure old fixture id.
        $application = $this->syncedApplication($user, 'wpsite');
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    public function test_create_wp_temp_dir_config(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WpConfigTest.php:45 `->config()->set('WP_TEMP_DIR', "dirname(__FILE__) . '/wp-content/temp/'", ['--raw'])`
        // → the v1 config create route (which maps an added constant to an Engine
        // PUT); the raw value is kept verbatim.
        $value = "dirname(__FILE__) . '/wp-content/temp/'";

        // Legacy: WpConfigTest.php:47 fileManager()->getFullPath() + :49-56
        // `->config()->list()` + assertEquals($path, $wpTempDir) → the v1 config
        // read; the set-then-read intent is kept (the list carries the value).
        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:258
        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
        Http::fake([
            'engine.example.com/api/projects/wpsite/wp/config/WP_TEMP_DIR' => Http::response(['data' => ['constant' => 'WP_TEMP_DIR', 'value' => $value]]),
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'WP_TEMP_DIR', 'value' => $value, 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:121
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/config", [
                'name' => 'WP_TEMP_DIR',
                'value' => $value,
                'type' => 'constant',
            ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);

        // CA: packages/client-area/src/router/fetchData.js:224
        // CA reads: packages/client-area/src/router/fetchData.js:225
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/config")
            ->assertStatus(200)
            ->assertJsonPath('data.0.name', 'WP_TEMP_DIR')
            ->assertJsonPath('data.0.value', $value)
            ->assertJsonPath('data.0.type', 'constant');

        // The write reached the Engine as the constant the read returns.
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/wp/config/WP_TEMP_DIR')
            && $request['value'] === $value
            && $request['type'] === 'constant');
    }
}
