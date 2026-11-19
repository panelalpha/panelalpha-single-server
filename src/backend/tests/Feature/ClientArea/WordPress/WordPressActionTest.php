<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\InstallAssetRequest;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\WordPressService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * WordPress plugin/theme/core write operations – sync
 * activate/delete and queued install/update.
 * @see packages/client-area/src/mixins/{PluginsActionsMixin,UsersActionsMixin}.js
 * @see Engine core/routes/api.php:265-297 (wp/*)
 */
class WordPressActionTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'wpsite'),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'wpsite')->firstOrFail();
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    public function test_activate_and_deactivate_plugin_hit_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Deactivate asks first whether WordPress has the plugin.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244 -> WpPluginController::installed
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:339 -> WpPluginController::activate
            'engine.example.com/api/projects/wpsite/wp/plugins/*' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/activate")
            ->assertOk();

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/deactivate")
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/wp/plugins/akismet/activate'));
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/wp/plugins/akismet/deactivate'));
    }

    public function test_update_plugin_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:362
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/update")
            ->assertStatus(202);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::PLUGIN_UPDATE
            && $job->finishedType === 'user.instance.plugin.update_finished');
    }

    public function test_install_plugin_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:38 (`{slug}`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/plugins/new/woocommerce/install")
            ->assertStatus(202);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::PLUGIN_INSTALL
            && $job->payload['slug'] === 'woocommerce');
    }

    /**
     * The Engine installs by slug only and drops unknown fields, so a `url`
     * would install the latest release of the slug instead of the archive
     * (found by the live suite, 2026-11-04). The old route read no body.
     */
    public function test_an_install_from_a_url_is_refused_and_force_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        foreach (['plugins/new/hello-dolly', 'themes/new/astra'] as $path) {
            $this->actingAs($user)
// CA: packages/client-area/src/mixins/PluginsActionsMixin.js:38 (the CA sends no body; an API client's `url`)
                ->postJson("/api/projects/{$application->id}/wordpress/{$path}/install", ['url' => 'https://downloads.wordpress.org/plugin/hello-dolly.1.6.zip'])
                ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:51 (`Api.getErrorMessage(error)`)
                ->assertJsonPath('errors.url.0', InstallAssetRequest::URL_REFUSAL);
        }
        Queue::assertNothingPushed();

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/PluginsActionsMixin.js:38
            ->postJson("/api/projects/{$application->id}/wordpress/plugins/new/hello-dolly/install", ['force' => true])
            ->assertStatus(202);
        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::PLUGIN_INSTALL
            && $job->payload['slug'] === 'hello-dolly' && $job->payload['force'] === true);
    }

    public function test_activate_theme_hits_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:339 → WpThemeController::activate,
        // 200 `{data:{theme,message}}`.
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes/*' => Http::response(['data' => ['theme' => 'astra', 'message' => 'Success: Switched to \'astra\'.']])]);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:104
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/themes/astra/activate")
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/wp/themes/astra/activate'));
    }

    public function test_delete_theme_hits_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
        $this->fakeEngineWordPressCore('wpsite');
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74 -> WpThemeController::index
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes?*' => Http::response(['data' => [
            ['name' => 'twentytwentyfour', 'status' => 'active'],
            ['name' => 'astra', 'status' => 'inactive'],
        ]])]);
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:427 → WpThemeController::destroy,
        // 200 `{data:{theme,message}}`.
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes/astra' => Http::response(['data' => ['theme' => 'astra', 'message' => "Success: Deleted theme 'astra'."]])]);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:355
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/themes/astra")
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/wp/themes/astra'));
    }

    public function test_the_active_theme_is_refused_in_the_panels_words(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
        $this->fakeEngineWordPressCore('wpsite');
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74 -> WpThemeController::index
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes?*' => Http::response(['data' => [
            ['name' => 'astra', 'status' => 'active'],
            ['name' => 'twentytwentyfour', 'status' => 'inactive'],
        ]])]);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:355
        // CA reads: packages/client-area/src/apis/Api.js:67 (the CA shows the refusal's `message`)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/themes/astra")
            ->assertStatus(422)
            ->assertJsonPath('message', WordPressService::ACTIVE_THEME_REFUSAL)
            ->assertJsonPath('errors.theme.0', WordPressService::ACTIVE_THEME_REFUSAL);

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
    }

    public function test_the_engine_answer_is_kept_when_the_theme_list_cannot_be_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status (database down)
        $this->fakeEngineWordPressCore('wpsite', ['state' => 'db_unreachable']);
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:427 -> WpThemeController::destroy
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes/astra' => Http::response(['message' => "Error: The 'astra' theme is not installed."], 422)]);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:355
        // CA reads: packages/client-area/src/apis/Api.js:67 (the CA shows the refusal's `message`)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/themes/astra")
            ->assertStatus(422)
            ->assertJsonPath('message', "Error: The 'astra' theme is not installed.");

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/wp/themes/astra'));
        Http::assertNotSent(fn ($r) => $r->method() === 'GET' && str_contains($r->url(), '/wp/themes'));
    }

    public function test_an_unreadable_theme_list_lets_the_engine_answer_the_delete(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
        $this->fakeEngineWordPressCore('wpsite');
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74 -> WpThemeController::index (WP-CLI cannot run)
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes?*' => Http::response(['message' => 'Error: Error establishing a database connection.'], 422)]);
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:427 -> WpThemeController::destroy
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes/astra' => Http::response(['message' => 'Error: Error establishing a database connection.'], 422)]);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:355
        // CA reads: packages/client-area/src/apis/Api.js:67 (the CA shows the refusal's `message`)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/themes/astra")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Error: Error establishing a database connection.');

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/wp/themes/astra'));
    }

    public function test_update_theme_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:229
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/themes/astra/update")
            ->assertStatus(202);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::THEME_UPDATE
            && $job->finishedType === 'user.instance.theme.update_finished'
            && $job->itemName === 'astra');
    }

    public function test_install_theme_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/ThemesActionsMixin.js:30 (`POST themes/new/{slug}/install`, no body)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/themes/new/astra/install")
            ->assertStatus(202);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::THEME_INSTALL
            && $job->finishedType === 'user.instance.theme.install_finished'
            && $job->payload['slug'] === 'astra');
    }

    public function test_delete_plugin_returns_the_refreshed_plugin_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Delete asks first whether WordPress has the plugin.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244 -> WpPluginController::installed
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:471 → WpPluginController::destroy,
            // 200 `{data:{plugin,message}}`.
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet' => Http::response(['data' => ['plugin' => 'akismet', 'message' => "Success: Deleted plugin 'akismet'."]]),
            // The refreshed list the old panel returned (`PluginCollection::fromRemoteApp`).
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []]),
        ]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:516 (`response.data.data` is the new plugin list)
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:523
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/plugins/akismet")
            ->assertOk()
            ->assertJsonPath('data', []);

        Http::assertSent(fn ($r) => $r->method() === 'DELETE' && str_ends_with($r->url(), '/wp/plugins/akismet'));
        Http::assertSent(fn ($r) => $r->method() === 'GET' && str_contains($r->url(), '/wp/plugins'));
    }

    public function test_core_update_is_queued(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (`{version}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6'])
            ->assertStatus(202);

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job) => $job->action === RunWordPressActionJob::CORE_UPDATE
            && $job->payload['version'] === '6.6');
    }

    public function test_wordpress_actions_require_authentication(): void
    {
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161 (the CA calls the action authenticated)
        $this->putJson('/api/projects/1/wordpress/plugins/akismet/activate')->assertUnauthorized();
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (the CA calls the update authenticated)
        $this->putJson('/api/projects/1/wordpress/update')->assertUnauthorized();
    }
}
