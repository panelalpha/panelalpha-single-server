<?php

namespace Tests\Feature\Legacy\User\Instance\Wordpress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from
 * packages/api/tests/Feature/User/Instance/Wordpress/WordpressGhostPluginsTest.php.
 * Regression for
 * panelalpha#2341: leftover async statuses must not show as ghost plugins, and
 * deactivating a plugin missing from WordPress must not 500.
 *
 * The old `AsyncStatus` model, the hard-coded `$applicationId = 9` and the
 * `assertDatabaseHas/Missing('async_statuses')` reads are replaced by v1's
 * `WordPressAsyncStatus` (`wordpress_async_status`) fixture and reads
 * v1 ports the old cleanup into the controller, which
 * owns the status rows: the list drops and deletes a failed ghost row and
 * appends pending/in-progress rows (old `PluginCollection::fromRemoteApp:56-64`,
 * now `WordPressService::plugins()` + `PluginPresenter::presentList()`), and
 * deactivate/delete ask the Engine whether WordPress has the plugin
 * (`GET wp/plugins/{p}/installed`, the old `isInstalled` short-circuit,
 * `PluginController::deactivate:138-142`, `::destroy:222-231`) and delete the
 * stale row (`deletePluginAsyncStatus:355-362`).
 */
class WordpressGhostPluginsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function wordpressApplication(User $user): Application
    {
        // Legacy: WordpressGhostPluginsTest.php:15 hard-coded application_id 9 →
        // one synced v1 Engine project fixture.
        $application = $this->syncedApplication($user, 'wpsite');
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    private function ghostSlug(): string
    {
        return 'ewww-image-optimizer-ghost-'.uniqid('', true);
    }

    /**
     * Legacy: WordpressGhostPluginsTest.php:22-36 (`AsyncStatus::create` with a
     * JSON `async_status` blob) → a v1 `WordPressAsyncStatus` row whose
     * action/status columns carry the single `['install' => 'failed']` pair.
     *
     * @param  array<string, string>  $asyncStatus  action => status
     */
    private function createGhostAsync(Application $application, string $slug, array $asyncStatus): WordPressAsyncStatus
    {
        $action = (string) array_key_first($asyncStatus);
        $status = (string) $asyncStatus[$action];

        return WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => WordPressAsyncStatus::PLUGIN,
            'name' => $slug,
            'action' => $action,
            'status' => $status,
        ]);
    }

    /**
     * @param  mixed  $payload
     * @return list<string>
     */
    private function pluginNamesFromListPayload($payload): array
    {
        if (! is_array($payload)) {
            return [];
        }

        $plugins = isset($payload['data']) && is_array($payload['data'])
            ? $payload['data']
            : $payload;

        return collect($plugins)->pluck('name')->filter()->values()->all();
    }

    public function test_list_drops_failed_ghost_plugin_async_status(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressGhostPluginsTest.php:57 authAsUser(1) → actingAs($user).
        $slug = $this->ghostSlug();
        // Legacy: WordpressGhostPluginsTest.php:59 createGhostAsync(..., ['install' => 'failed']).
        $this->createGhostAsync($application, $slug, ['install' => 'failed']);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []])]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressGhostPluginsTest.php:61 request kept (GET).
        // CA: packages/client-area/src/router/fetchData.js:145
        $response = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/plugins");

        // Legacy: WordpressGhostPluginsTest.php:63 assertStatus(200) kept.
        $response->assertStatus(200);
        // Legacy: WordpressGhostPluginsTest.php:64 assertNotContains kept (the
        // Engine list does not carry the ghost, so it is not in the payload).
        $this->assertNotContains($slug, $this->pluginNamesFromListPayload($response->json('data')));

        // Legacy: WordpressGhostPluginsTest.php:65-69 assertDatabaseMissing('async_statuses')
        // → the v1 `wordpress_async_status` read: the list deleted
        // the failed ghost row.
        $this->assertFalse(WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->where('name', $slug)
            ->exists());
    }

    public function test_list_keeps_pending_install_async_status(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressGhostPluginsTest.php:74 authAsUser(1) → actingAs($user).
        $slug = $this->ghostSlug();
        // Legacy: WordpressGhostPluginsTest.php:76 createGhostAsync(..., ['install' => 'pending']).
        $this->createGhostAsync($application, $slug, ['install' => 'pending']);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []])]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressGhostPluginsTest.php:79 request kept (GET).
        // CA: packages/client-area/src/router/fetchData.js:145
        $response = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/plugins");

        // Legacy: WordpressGhostPluginsTest.php:81 assertStatus(200) kept.
        $response->assertStatus(200);

        // Legacy: WordpressGhostPluginsTest.php:83-87 assertDatabaseHas('async_statuses')
        // → the v1 `wordpress_async_status` read: the pending row survives.
        $this->assertTrue(WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->where('name', $slug)
            ->exists());

        // Legacy: WordpressGhostPluginsTest.php:82 assertContains($slug, ...) kept:
        // the pending install is appended as its own row.
        $this->assertContains($slug, $this->pluginNamesFromListPayload($response->json('data')));
        // CA reads: packages/client-area/src/views/instance/Plugins.vue:688
        $response->assertJsonPath('data.0.async_status', ['install' => 'pending']);
    }

    public function test_deactivate_missing_plugin_returns_success_and_clears_async(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressGhostPluginsTest.php:99 authAsUser(1) → actingAs($user).
        $slug = $this->ghostSlug();
        // Legacy: WordpressGhostPluginsTest.php:101 createGhostAsync(..., ['install' => 'failed']).
        $this->createGhostAsync($application, $slug, ['install' => 'failed']);

        // The old panel's isInstalled short-circuit (PluginController::deactivate:138-142)
        // is the Engine's `plugin is-installed`; a missing plugin is never
        // deactivated in WP-CLI (no stub for it: a stray request fails the test).
        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
        Http::fake(["engine.example.com/api/projects/wpsite/wp/plugins/{$slug}/installed*" => Http::response(['data' => ['plugin' => $slug, 'installed' => false]])]);

        // Legacy: WordpressGhostPluginsTest.php:103-105 request kept (PUT).
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
        $response = $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/{$slug}/deactivate");

        // Legacy: WordpressGhostPluginsTest.php:107-108 status+success kept.
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:278
        $response->assertStatus(200)->assertJson(['success' => true]);

        // Legacy: WordpressGhostPluginsTest.php:109-113 assertDatabaseMissing('async_statuses')
        // → the v1 `wordpress_async_status` read.
        $this->assertFalse(WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->where('name', $slug)
            ->exists());
        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/deactivate'));
    }

    public function test_activate_missing_plugin_returns_validation_error(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressGhostPluginsTest.php:117 authAsUser(1) → actingAs($user).
        $slug = $this->ghostSlug();

        // The old panel refused the missing plugin with a panel-side
        // ValidationException (PluginController::activate:92-96); v1 forwards to
        // the Engine, whose 422 for a missing plugin becomes the same response.
        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:339
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/*' => Http::response(['message' => 'Plugin not found.'], 422)]);

        // Legacy: WordpressGhostPluginsTest.php:121-123 request kept (PUT).
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161
        $response = $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/{$slug}/activate");

        // Legacy: WordpressGhostPluginsTest.php:125 assertStatus(422) kept.
        $response->assertStatus(422);
    }

    public function test_delete_missing_plugin_clears_async_status(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Legacy: WordpressGhostPluginsTest.php:130 authAsUser(1) → actingAs($user).
        $slug = $this->ghostSlug();
        // Legacy: WordpressGhostPluginsTest.php:131 createGhostAsync(..., ['install' => 'failed']).
        $this->createGhostAsync($application, $slug, ['install' => 'failed']);

        // The old panel's isInstalled short-circuit (PluginController::destroy:222-226)
        // is the Engine's `plugin is-installed`; a missing plugin is never
        // deleted in WP-CLI (no stub for the DELETE: a stray request fails the test).
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            "engine.example.com/api/projects/wpsite/wp/plugins/{$slug}/installed*" => Http::response(['data' => ['plugin' => $slug, 'installed' => false]]),
            // The refreshed list the old `PluginCollection::fromRemoteApp` returned.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/plugins?*' => Http::response(['data' => []]),
        ]);
        $this->fakeEngineWordPressCore('wpsite');

        // Legacy: WordpressGhostPluginsTest.php:134-136 request kept (DELETE).
        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:516
        $response = $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/plugins/{$slug}");

        // Legacy: WordpressGhostPluginsTest.php:138 assertStatus(200) kept.
        $response->assertStatus(200);

        // Legacy: WordpressGhostPluginsTest.php:139-143 assertDatabaseMissing('async_statuses')
        // → the v1 `wordpress_async_status` read.
        $this->assertFalse(WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->where('name', $slug)
            ->exists());
        Http::assertNotSent(fn ($request): bool => $request->method() === 'DELETE');
    }
}
