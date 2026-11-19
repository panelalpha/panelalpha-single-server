<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The old panel's cleanup of the panel-side plugin status rows,
 * ported into the controller that owns them (`wordpress_async_status`).
 *
 * Contract:
 * - Old: `PluginCollection::fromRemoteApp` (packages/api/app/Http/Resources/PluginCollection.php:56-64)
 *   deleted a status row whose plugin WordPress did not list unless an
 *   operation was pending/in progress, and pushed those rows onto the list;
 *   `PluginController::deactivate:138-142` and `::destroy:222-231`
 *   (packages/api/app/Http/Controllers/User/Instance/Wordpress/PluginController.php)
 *   skipped WP-CLI for a plugin that is not installed and deleted the row
 *   (`deletePluginAsyncStatus:355-362`); `destroy` also deleted it after a real delete.
 * - CA: the list `packages/client-area/src/router/fetchData.js:145`, it reads
 *   `name` and `async_status.install` (`views/instance/Plugins.vue:688`);
 *   deactivate `src/mixins/PluginsActionsMixin.js:278`, delete `:516`.
 * - Engine: `GET wp/plugins/{p}/installed` → `{data:{plugin, installed}}`
 *   (core/app/Http/Controllers/User/Wp/WpPluginController.php:244).
 */
class PluginStatusCleanupTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        $application = $this->syncedApplication($user, 'wpsite');
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    private function createStatus(Application $application, string $name, string $action, string $status): void
    {
        WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => WordPressAsyncStatus::PLUGIN,
            'name' => $name,
            'action' => $action,
            'status' => $status,
        ]);
    }

    /**
     * @return list<string>
     */
    private function statusNames(Application $application): array
    {
        /** @var list<string> $names */
        $names = WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->orderBy('name')
            ->pluck('name')
            ->all();

        return $names;
    }

    public function test_the_list_keeps_listed_and_running_rows_and_drops_finished_ghosts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // A listed plugin keeps its row whatever its status.
        $this->createStatus($application, 'akismet', 'update', WordPressAsyncStatus::FAILED);
        // Unlisted: finished and failed rows are ghosts, a running install is shown.
        $this->createStatus($application, 'ghost-finished', 'install', WordPressAsyncStatus::FINISHED);
        $this->createStatus($application, 'ghost-failed', 'install', WordPressAsyncStatus::FAILED);
        $this->createStatus($application, 'new-running', 'install', WordPressAsyncStatus::IN_PROGRESS);

        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => [
            ['name' => 'akismet', 'status' => 'active', 'update' => 'none', 'version' => '5.3'],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/router/fetchData.js:145
        $response = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/plugins");

        $response->assertOk()
            // CA reads: packages/client-area/src/views/instance/Plugins.vue:688
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'akismet')
            ->assertJsonPath('data.0.async_status', ['update' => 'failed'])
            ->assertJsonPath('data.1.name', 'new-running')
            ->assertJsonPath('data.1.async_status', ['install' => 'in_progress'])
            ->assertJsonPath('data.1.application_id', $application->id);

        $this->assertSame(['akismet', 'new-running'], $this->statusNames($application));
    }

    public function test_deactivating_an_installed_plugin_calls_the_engine_and_keeps_its_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->createStatus($application, 'akismet', 'update', WordPressAsyncStatus::FINISHED);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:381
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/deactivate' => Http::response(['data' => ['plugin' => 'akismet', 'message' => 'Success: Deactivated 1 of 1 plugins.']]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/deactivate")
            ->assertOk()
            // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:278
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request): bool => $request->method() === 'GET'
            && str_contains($request->url(), '/wp/plugins/akismet/installed')
            && str_contains($request->url(), 'skip_plugins=1'));
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/wp/plugins/akismet/deactivate'));
        // The old deactivate kept the row of an installed plugin.
        $this->assertSame(['akismet'], $this->statusNames($application));
    }

    public function test_deleting_an_installed_plugin_deletes_its_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->createStatus($application, 'akismet', 'update', WordPressAsyncStatus::PENDING);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet', 'installed' => true]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:471
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet' => Http::response(['data' => ['plugin' => 'akismet', 'message' => "Success: Deleted plugin 'akismet'."]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/plugins?*' => Http::response(['data' => []]),
        ]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:516
        // CA reads: packages/client-area/src/mixins/PluginsActionsMixin.js:523
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/plugins/akismet")
            ->assertOk()
            ->assertJsonPath('data', []);

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/wp/plugins/akismet'));
        // Old destroy:231 deleted the row after the delete, a pending one too.
        $this->assertSame([], $this->statusNames($application));
    }

    public function test_a_malformed_installed_answer_keeps_the_wp_cli_call(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->createStatus($application, 'akismet', 'install', WordPressAsyncStatus::FAILED);

        Http::fake([
            // Defensive (not an Engine shape): no boolean `installed`, so the
            // panel cannot tell the plugin is missing.
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:381
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/deactivate' => Http::response(['data' => ['plugin' => 'akismet', 'message' => 'Success: Deactivated 1 of 1 plugins.']]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/deactivate")
            ->assertOk();

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/wp/plugins/akismet/deactivate'));
        $this->assertSame(['akismet'], $this->statusNames($application));
    }

    /**
     * @return array<string, array{string, int}>
     */
    public static function writeFailures(): array
    {
        return [
            'connection error' => ['connection', 503],
            'engine 5xx' => ['5xx', 502],
        ];
    }

    #[DataProvider('writeFailures')]
    public function test_a_failed_deactivate_bubbles_and_keeps_the_row(string $failure, int $status): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->createStatus($application, 'akismet', 'install', WordPressAsyncStatus::FAILED);

        Http::fake([
            // The load answers; the write fails (a hiccup at the write).
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:244
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/installed*' => Http::response(['data' => ['plugin' => 'akismet', 'installed' => true]]),
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/deactivate' => $failure === 'connection'
                ? fn () => throw new ConnectionException('down')
                // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:23 -> respond (the Engine's error body)
                : Http::response(['message' => 'boom'], 500),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:278
            ->putJson("/api/projects/{$application->id}/wordpress/plugins/akismet/deactivate")
            ->assertStatus($status);

        $this->assertSame(['akismet'], $this->statusNames($application));
    }
}
