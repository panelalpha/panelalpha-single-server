<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The General page's Installation card shows "Not Installed" unless the
 * project answer carries the WordPress version (`version`), the core versions
 * it can be updated to (`update_details.available_updates`) and the plugin
 * list (`plugin_details`, WooCommerce's version): the CA builds
 * `status.wordpress`, `status.wordpress_available` and `status.woocommerce`
 * from them (`InstanceResource` in `Instances.js`; `InstallationInfoCard.vue`).
 * The single project answer reads them from the cache a queued refresh fills;
 * it never calls the Engine itself, and the list never carries
 * them.
 */
final class ProjectWordPressDetailsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function wordpressApplication(User $user): Application
    {
        $application = $this->syncedApplication($user, 'wpsite');
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    private function fakeWordPress(string $version = '6.5', array $updates = ['6.6'], array $plugins = []): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112 (a list)
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => array_map(
                static fn (string $v): array => ['version' => $v, 'update_type' => 'minor', 'package_url' => 'https://x'],
                $updates,
            )]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => $version, 'state' => 'installed']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => $plugins]),
        ]);
    }

    private function queuedRefreshes(): int
    {
        return DB::table('jobs')->where('payload', 'like', '%RefreshProjectWordPressJob%')->count();
    }

    public function test_a_first_view_queues_the_refresh_and_calls_no_engine_endpoint(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        Http::fake();

        // CA: packages/client-area/src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress, the card's default until the refresh ran)
        $project->assertJsonPath('data.version', null);
        Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), '/wp/'));
        $this->assertSame(1, $this->queuedRefreshes());
    }

    public function test_after_the_refresh_the_project_carries_version_updates_and_plugins(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        $this->fakeWordPress('6.5', ['6.6', '6.5.1'], [
            ['name' => 'woocommerce', 'title' => 'WooCommerce', 'status' => 'active', 'update' => 'available', 'version' => '9.0', 'update_version' => '9.1'],
        ]);

        RefreshProjectWordPressJob::dispatchSync($application->id);
        // CA: packages/client-area/src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress)
        $project->assertJsonPath('data.version', '6.5');
        // CA reads: packages/client-area/src/apis/Instances.js:498 (update_details.available_updates -> status.wordpress_available)
        $project->assertJsonPath('data.update_details.available_updates', ['6.6', '6.5.1']);
        // CA reads: packages/client-area/src/apis/Instances.js:332 (setPluginsData: the `woocommerce` row)
        $project->assertJsonPath('data.plugin_details.0.name', 'woocommerce');
        // CA reads: packages/client-area/src/apis/Instances.js:332 (status.woocommerce)
        $project->assertJsonPath('data.plugin_details.0.version', '9.0');
        // CA reads: packages/client-area/src/apis/Instances.js:332 (status.woocommerce_available)
        $project->assertJsonPath('data.plugin_details.0.update_version', '9.1');
        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_stale_facts_are_shown_while_a_refresh_is_queued(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        $this->fakeWordPress('6.5');
        RefreshProjectWordPressJob::dispatchSync($application->id);

        $this->travel(ProjectWordPressDetails::FRESH_SECONDS + 1)->seconds();
        // CA: packages/client-area/src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress)
        $project->assertJsonPath('data.version', '6.5');
        $this->assertSame(1, $this->queuedRefreshes());
    }

    public function test_a_failing_engine_read_keeps_the_previous_facts_and_still_backs_off(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        $this->fakeWordPress('6.5');
        RefreshProjectWordPressJob::dispatchSync($application->id);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 (any failing read answers a 500)
        Http::fake(['engine.example.com/api/projects/wpsite/wp/*' => Http::response(['message' => 'boom'], 500)]);
        $this->travel(ProjectWordPressDetails::FRESH_SECONDS + 1)->seconds();
        RefreshProjectWordPressJob::dispatchSync($application->id);
        // CA: packages/client-area/src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress)
        $project->assertJsonPath('data.version', '6.5');
        $this->assertSame(0, $this->queuedRefreshes(), 'the failed refresh still moved the timestamp, so the view does not queue another');
    }

    public function test_a_project_that_is_not_wordpress_is_left_alone(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'wpsite');
        $application->update(['type' => Application::TYPE_CUSTOM]);
        Http::fake();

        // CA: packages/client-area/src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress, not a WordPress project)
        $project->assertJsonPath('data.version', null);
        $this->assertSame(0, $this->queuedRefreshes());
        $this->assertFalse(Cache::has(ProjectWordPressDetails::cacheKey($application)));
    }

    public function test_the_list_never_carries_the_facts_nor_queues_the_refresh(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        $this->fakeWordPress('6.5');
        RefreshProjectWordPressJob::dispatchSync($application->id);

        // CA: packages/client-area/src/apis/Instances.js:76
        $list = $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA reads: packages/client-area/src/apis/Instances.js:496 (app.version of a listed project)
        $list->assertJsonPath('data.0.version', null);
        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_a_sync_queues_the_refresh_of_a_wordpress_project_without_a_cache_entry(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        Http::fake();
        $this->assertSame(0, $this->queuedRefreshes());

        EngineProjectsSynced::dispatch((int) $application->engine_id);

        $this->assertSame(1, $this->queuedRefreshes());
        Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), '/wp/'));
    }

    public function test_a_sync_leaves_cached_wordpress_projects_and_other_projects_alone(): void
    {
        $user = User::factory()->create();
        $wordpress = $this->wordpressApplication($user);
        Cache::put(ProjectWordPressDetails::cacheKey($wordpress), ['facts' => [], 'refreshed_at' => now()->getTimestamp()], ProjectWordPressDetails::KEEP_SECONDS);
        Application::query()->create([
            'engine_id' => $wordpress->engine_id,
            'engine_username' => 'appsite',
            'name' => 'appsite',
            'domain' => 'appsite.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
        ]);
        Http::fake();

        EngineProjectsSynced::dispatch((int) $wordpress->engine_id);

        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_a_removed_plugin_leaves_the_project_answer_at_once(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        Cache::put(ProjectWordPressDetails::cacheKey($application), [
            'facts' => [
                'version' => '6.5',
                'available_updates' => ['6.6'],
                'plugins' => [
                    ['name' => 'akismet', 'version' => '5.0'],
                    ['name' => 'woocommerce', 'version' => '9.0'],
                ],
            ],
            'refreshed_at' => now()->getTimestamp(),
        ], ProjectWordPressDetails::KEEP_SECONDS);

        Http::fake([
            // Delete asks first whether WordPress has the plugin.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244 -> WpPluginController::installed
            'engine.example.com/api/projects/wpsite/wp/plugins/woocommerce/installed*' => Http::response(['data' => ['plugin' => 'woocommerce', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:471 -> WpPluginController::destroy
            'engine.example.com/api/projects/wpsite/wp/plugins/woocommerce' => Http::response(['data' => ['plugin' => 'woocommerce', 'message' => "Success: Deleted plugin 'woocommerce'."]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74 (the list without it)
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => [['name' => 'akismet', 'title' => 'Akismet', 'status' => 'active', 'version' => '5.0', 'update' => 'none']]]),
        ]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:516 (the answer is the refreshed list)
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:523 (the plugin table)
        $response = $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/plugins/woocommerce")
            ->assertOk();
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:523 (setPluginsData: the refreshed rows)
        $response->assertJsonCount(1, 'data');
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:523 (the row's name)
        $response->assertJsonPath('data.0.name', 'akismet');

        // CA: packages/client-area/src/apis/Instances.js:17 (the project answer the CA reloads after an action)
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: packages/client-area/src/apis/Instances.js:332 (setPluginsData -> status.woocommerce)
        $project->assertJsonCount(1, 'data.plugin_details');
        // CA reads: packages/client-area/src/apis/Instances.js:332 (status.woocommerce, the plugin's name)
        $project->assertJsonPath('data.plugin_details.0.name', 'akismet');
        // CA reads: packages/client-area/src/components/cards/InstallationInfoCard.vue:160 (status.wordpress, unchanged by the removal)
        $project->assertJsonPath('data.version', '6.5');
        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_a_refresh_that_read_the_engine_before_a_plugin_change_keeps_the_newer_list(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);
        Cache::put(ProjectWordPressDetails::cacheKey($application), [
            'facts' => ['version' => '6.5', 'available_updates' => [], 'plugins' => []],
            'refreshed_at' => now()->getTimestamp(),
        ], ProjectWordPressDetails::KEEP_SECONDS);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112 (a list)
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74: the read a refresh that
            // started before the install makes; the install finishes while it is out.
            'engine.example.com/api/projects/wpsite/wp/plugins*' => function () use ($application) {
                app(ProjectWordPressDetails::class)->pluginsChanged($application, [
                    ['name' => 'woocommerce', 'version' => '9.0'],
                ]);

                // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
                return Http::response(['data' => []]);
            },
        ]);

        app(ProjectWordPressDetails::class)->refresh($application);

        // CA: packages/client-area/src/apis/Instances.js:17 (the project answer the CA reloads after an action)
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: packages/client-area/src/apis/Instances.js:332 (setPluginsData -> status.woocommerce)
        $project->assertJsonCount(1, 'data.plugin_details');
        // CA reads: packages/client-area/src/apis/Instances.js:332 (status.woocommerce, the plugin's name)
        $project->assertJsonPath('data.plugin_details.0.name', 'woocommerce');
        $this->assertSame(0, $this->queuedRefreshes());
    }
}
