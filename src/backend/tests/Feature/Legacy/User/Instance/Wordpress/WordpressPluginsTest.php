<?php

namespace Tests\Feature\Legacy\User\Instance\Wordpress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from
 * packages/api/tests/Feature/User/Instance/Wordpress/WordpressPluginsTest.php.
 * The old `authAsUser(1)` and the five application-id provider rows become one v1
 * Engine project fixture, and the `@depends` ordering becomes an explicit
 * per-test fixture. The old `/api/instances/...` path is the CA's axios call,
 * rewritten to `/api/projects/...` in single-server mode – the only path v1
 * registers.
 */
class WordpressPluginsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private string $pluginName = 'jetpack';

    private function wordpressApplication(User $user): Application
    {
        // Legacy: WordpressPluginsTest.php:43 authAsUser(1) → actingAs($user);
        // the `dataProvider` rows at :12-31 are pure old fixture ids → one v1
        // Engine project fixture.
        $application = $this->syncedApplication($user, 'wpsite');
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    public function test_list_wordpress_plugins(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => [
            ['name' => 'jetpack', 'status' => 'active', 'version' => '13.0', 'update' => 'none', 'update_version' => null],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressPluginsTest.php:44 request kept (GET); the old
        // `/api/instances` path is rewritten to `/api/projects` by the CA.
        // CA: packages/client-area/src/router/fetchData.js:145
        // CA reads: packages/client-area/src/router/fetchData.js:145
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/plugins")
            ->assertStatus(200)
            ->assertJsonStructure(['data']);

        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && str_contains($request->url(), '/wp/plugins')
            && ($request['skip_plugins'] ?? null) == 1);
    }

    public function test_activate_plugin(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:339
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/jetpack/activate' => Http::response(['data' => []])]);

        // Legacy: WordpressPluginsTest.php:61 request kept (PUT); :53 @depends
        // test_install_plugin → explicit per-test fixture.
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:161
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/{$this->pluginName}/activate")
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_deactivate_plugin(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        Http::fake([
            // The old `isInstalled` short-circuit: WordPress has the plugin.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            'engine.example.com/api/projects/wpsite/wp/plugins/jetpack/installed*' => Http::response(['data' => ['plugin' => 'jetpack', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:381
            'engine.example.com/api/projects/wpsite/wp/plugins/jetpack/deactivate' => Http::response(['data' => []]),
        ]);

        // Legacy: WordpressPluginsTest.php:78 request kept (PUT); :69 @depends
        // test_activate_plugin → explicit per-test fixture.
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:278
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/{$this->pluginName}/deactivate")
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_update_plugin(): void
    {
        // The old test asserted a synchronous 200; v1 queues the Engine update
        // and answers 202, so the test
        // asserts the dispatched job instead of the Engine call.
        Queue::fake();

        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressPluginsTest.php:95 request kept (PUT); :87 @depends
        // test_install_plugin → explicit per-test fixture.
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:362
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:362
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/{$this->pluginName}/update")
            ->assertStatus(202)
            ->assertJson(['success' => true]);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::PLUGIN_UPDATE
            && $job->finishedType === 'user.instance.plugin.update_finished');
    }

    public function test_delete_plugin(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        Http::fake([
            // The old `isInstalled` short-circuit: WordPress has the plugin.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            'engine.example.com/api/projects/wpsite/wp/plugins/jetpack/installed*' => Http::response(['data' => ['plugin' => 'jetpack', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:471
            'engine.example.com/api/projects/wpsite/wp/plugins/jetpack' => Http::response(['data' => ['plugin' => 'jetpack', 'message' => "Success: Deleted plugin 'jetpack'."]]),
            // The refreshed plugin list the old `PluginCollection::fromRemoteApp` returned.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []]),
        ]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressPluginsTest.php:112 request kept (DELETE); :103
        // @depends test_deactivate_plugin → explicit per-test fixture.
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:516
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/plugins/{$this->pluginName}")
            ->assertStatus(200);

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/wp/plugins/jetpack'));
    }

    public function test_search_plugins(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:136
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/search*' => Http::response(['data' => [
            ['name' => 'Hello Dolly', 'slug' => 'hello-dolly', 'rating' => 90, 'active_installs' => 1000000, 'short_description' => 'A plugin', 'tested' => '6.6'],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressPluginsTest.php:127 request kept (GET); the old term
        // `hello` is kept verbatim.
        // CA: packages/client-area/src/router/fetchData.js:159
        // CA reads: packages/client-area/src/router/fetchData.js:159
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/plugins/new/search/hello")
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_install_plugin(): void
    {
        // Legacy: WordpressPluginsTest.php:146 `sleep(30)` dropped – the test asserts
        // the queued job instead of
        // waiting for the worker; v1 answers 202.
        Queue::fake();

        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressPluginsTest.php:144 request kept (POST); :135
        // @depends test_list_wordpress_plugins → explicit per-test fixture.
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:38
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:38
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/plugins/new/{$this->pluginName}/install")
            ->assertStatus(202)
            ->assertJson(['success' => true]);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::PLUGIN_INSTALL
            && $job->payload['slug'] === $this->pluginName);
    }
}
