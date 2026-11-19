<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The WordPress management reads and simple settings.
 * @see packages/client-area/src/views/instance/advanced/DeveloperSettings.vue, Security.vue
 * @see Engine core/routes/api.php:265-297 (wp/*)
 */
class WordPressTest extends TestCase
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
// Engine: core/app/Http/Controllers/UserController.php:122
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

    public function test_theme_screenshot_serves_the_engine_image(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // The document root comes from the main domain.
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/wpsite.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:54
            'engine.example.com/api/projects/wpsite/files/exists*' => Http::response(['exists' => true]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/wpsite/files/download*' => Http::response('png-bytes', 200, ['Content-Type' => 'image/png']),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:185 (the CA builds the theme `<img>` src by hand)
        $this->actingAs($user)
            ->get("/api/projects/{$application->id}/wordpress/themes/twentytwentyfour/screenshot")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertContent('png-bytes');

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download')
            && $r['path'] === 'wpsite.example.com/public_html/wp-content/themes/twentytwentyfour/screenshot.png');
    }

    public function test_theme_screenshot_falls_back_to_a_placeholder(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => []],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:54
            'engine.example.com/api/projects/wpsite/files/exists*' => Http::response(['exists' => false]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:185 (the CA builds the theme `<img>` src by hand)
        $this->actingAs($user)
            ->get("/api/projects/{$application->id}/wordpress/themes/twentytwentyfour/screenshot")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/gif');
    }

    public function test_theme_screenshot_reports_an_engine_error_when_the_exists_body_is_malformed(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:54
            'engine.example.com/api/projects/wpsite/files/exists*' => Http::response([]),
        ]);

        // A malformed existence body is an Engine failure: the screenshot read
        // reports it and answers the placeholder, never a 500.
        // CA: packages/client-area/src/router/fetchData.js:185 (the CA builds the theme `<img>` src by hand)
        $this->actingAs($user)
            ->get("/api/projects/{$application->id}/wordpress/themes/twentytwentyfour/screenshot")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/gif');
    }

    public function test_updates_reads_core_and_core_updates_only(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Most specific first (Laravel matches stubs in order).
            // The Engine `core/updates` answer is a list.
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => [
                ['version' => '6.6', 'update_type' => 'minor', 'package_url' => 'https://x'],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
        ]);

        // CA: packages/client-area/src/mixins/OpenModalAction.js:95 (`Api.get(.../wordpress/updates)`)
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:97 (`{wp_version, available_updates}`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/updates")
            ->assertOk()
            ->assertJsonPath('data.wp_version', '6.5')
            ->assertJsonPath('data.available_updates.0', '6.6');

        // The route answers core status + core updates only; the plugin and
        // theme lists are their own routes and must not be read here.
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/core?')
            && ($r['skip_plugins'] ?? null) == 1);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/plugins') || str_contains($r->url(), '/wp/themes'));
    }

    public function test_updates_answers_not_installed_without_the_core_update_check(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => [
                ['version' => '6.6', 'update_type' => 'minor', 'package_url' => 'https://x'],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 (core files, no wp-config.php)
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '6.7.1', 'state' => 'no_config']]),
        ]);

        // CA: packages/client-area/src/mixins/OpenModalAction.js:95 (`Api.get(.../wordpress/updates)`)
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:97 (`{wp_version, available_updates}`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/updates")
            ->assertOk()
            ->assertJsonPath('data.wp_version', null)
            ->assertJsonPath('data.available_updates', []);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/core/updates'));
    }

    public function test_updates_keeps_a_site_whose_database_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => [['version' => '6.6']]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '6.5', 'state' => 'db_unreachable']]),
        ]);

        // CA: packages/client-area/src/mixins/OpenModalAction.js:95 (`Api.get(.../wordpress/updates)`)
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:97 (`{wp_version, available_updates}`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/updates")
            ->assertOk()
            ->assertJsonPath('data.wp_version', '6.5')
            ->assertJsonPath('data.available_updates', []);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/core/updates'));
    }

    public function test_updates_reads_a_database_down_site_on_an_engine_without_a_state(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => [['version' => '6.6']]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 (an older Engine)
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '6.5']]),
        ]);

        // CA: packages/client-area/src/mixins/OpenModalAction.js:95 (`Api.get(.../wordpress/updates)`)
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:97 (`{wp_version, available_updates}`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/updates")
            ->assertOk()
            ->assertJsonPath('data.wp_version', '6.5')
            ->assertJsonPath('data.available_updates', []);
    }

    /**
     * Every WordPress read passes `skip_plugins=1` so one broken plugin cannot
     * turn a listing into a 422. `core()` defaults to it; the single-row `plugin()` read is used by
     * the action job's notification row.
     */
    #[DataProvider('wordpressReads')]
    public function test_every_wordpress_read_skips_broken_plugins(string $read): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 (representative wp/* read)
        Http::fake(['*' => Http::response(['data' => []])]);

        $api = new WordPressApi(new EngineClient(
            new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'),
        ));

        match ($read) {
            'core' => $api->core($application->engineProject()),
            'core updates' => $api->coreUpdates($application->engineProject()),
            'maintenance' => $api->maintenance($application->engineProject()),
            'config' => $api->config($application->engineProject()),
            'auto-update' => $api->autoUpdate($application->engineProject()),
            'option' => $api->option($application->engineProject(), 'blogname'),
            'plugins' => $api->plugins($application->engineProject()),
            'plugin' => $api->plugin($application->engineProject(), 'akismet/akismet.php'),
            'plugin search' => $api->searchPlugins($application->engineProject(), 'akismet'),
            'themes' => $api->themes($application->engineProject()),
            'theme search' => $api->searchThemes($application->engineProject(), 'twentytwenty'),
            'users' => $api->users($application->engineProject()),
            default => $this->fail("Unknown WordPress read {$read}"),
        };

        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && ($request['skip_plugins'] ?? null) == 1);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function wordpressReads(): array
    {
        return [
            'core' => ['core'],
            'core updates' => ['core updates'],
            'maintenance' => ['maintenance'],
            'config' => ['config'],
            'auto-update' => ['auto-update'],
            'option' => ['option'],
            'plugins' => ['plugins'],
            'plugin' => ['plugin'],
            'plugin search' => ['plugin search'],
            'themes' => ['themes'],
            'theme search' => ['theme search'],
            'users' => ['users'],
        ];
    }

    public function test_maintenance_mode_get_and_set(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
        Http::fake([
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
// Engine: core/app/Http/Controllers/User/Wp/WpMaintenanceController.php:60
            'engine.example.com/api/projects/wpsite/wp/maintenance*' => Http::response(['data' => ['enabled' => false]]),
        ]);

        // The CA reads the top-level `{status: bool}` (DeveloperSettings.vue).
        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:339
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:341
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/maintenance-mode")
            ->assertOk()
            ->assertJsonPath('status', false);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:414 (`{status}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/maintenance-mode", ['status' => true])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT' && ($r['enabled'] ?? null) === true);
    }

    public function test_maintenance_mode_is_off_without_an_install(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => null, 'state' => 'no_core']]),
// Engine: core/app/Http/Controllers/User/Wp/WpMaintenanceController.php:60
            'engine.example.com/api/projects/wpsite/wp/maintenance*' => Http::response(['data' => ['enabled' => true]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:339
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:341
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/maintenance-mode")
            ->assertOk()
            ->assertJsonPath('status', false);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/maintenance'));
    }

    /**
     * @param  array<string, mixed>  $core
     */
    #[DataProvider('coresWithoutAReadableDatabase')]
    public function test_maintenance_mode_is_off_when_the_database_cannot_be_read(array $core): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => $core]),
// Engine: core/app/Http/Controllers/User/Wp/WpMaintenanceController.php:60 (the wp-cli answer)
            'engine.example.com/api/projects/wpsite/wp/maintenance*' => Http::response([
                'message' => 'Error: Error establishing a database connection.',
                'errors' => ['engine' => ['Error: Error establishing a database connection.']],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:339
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:341
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/maintenance-mode")
            ->assertOk()
            ->assertJsonPath('status', false);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/maintenance'));
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function coresWithoutAReadableDatabase(): array
    {
        return [
            'the database is unreachable' => [['installed' => false, 'version' => '7.1.4', 'state' => 'db_unreachable']],
            'wp-config.php is missing' => [['installed' => false, 'version' => '7.1.4', 'state' => 'no_config']],
        ];
    }

    public function test_debug_mode_reads_wp_config(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: `GET wp/config?type=all&skip_plugins=1` → `{data:[{name,value,type}]}`
        // (core/app/Http/Controllers/User/Wp/WpConfigController.php:67 → Config::list).
        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'WP_DEBUG', 'value' => 'true', 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:355
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:357
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/debug-mode")
            ->assertOk()
            ->assertJsonPath('status', true);
    }

    public function test_debug_mode_stringifies_a_boolean_wp_config_value(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine can answer a raw boolean; `Payload::string(true)` is the
        // accepted cast difference `'1'`, which `WP_DEBUG` still reads as on.
        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 → Config::list
        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'WP_DEBUG', 'value' => true, 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:355
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:357
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/debug-mode")
            ->assertOk()
            ->assertJsonPath('status', true);
    }

    public function test_debug_mode_is_false_when_wp_debug_is_undefined(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A real `config list` answer without WP_DEBUG must not 422.
        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 → Config::list,
        // `{data:[{name,value,type}]}`.
        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.5', 'state' => 'installed']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => 'wpsite_wp', 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:355
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:357
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/debug-mode")
            ->assertOk()
            ->assertJsonPath('status', false);
    }

    public function test_debug_mode_is_off_without_an_install(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '6.7.1', 'state' => 'no_config']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'WP_DEBUG', 'value' => 'true', 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:355
        // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:357
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/debug-mode")
            ->assertOk()
            ->assertJsonPath('status', false);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/config'));
    }

    public function test_search_engine_indexing_maps_blog_public(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:104
        Http::fake(['engine.example.com/api/projects/wpsite/wp/options/blog_public*' => Http::response(['data' => ['value' => '0']])]);

        // CA: packages/client-area/src/views/instance/advanced/Security.vue:414
        // CA reads: packages/client-area/src/views/instance/advanced/Security.vue:416 (`response.data.disabled`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/search-engine-indexing")
            ->assertOk()
            ->assertJsonPath('disabled', true);
    }

    public function test_search_engine_indexing_reports_a_malformed_option_body(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine answers `{option, value}`; a 200 without the value is a
        // malformed answer and must not read as "indexing disabled".
        // CA: packages/client-area/src/views/instance/advanced/Security.vue:414-425 (reads response.data.disabled; .catch shows the error alert)
        // Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:106 -> {data:{option,value}}
        Http::fake(['engine.example.com/api/projects/wpsite/wp/options/blog_public*' => Http::response(['data' => ['option' => 'blog_public']])]);

        // CA: packages/client-area/src/views/instance/advanced/Security.vue:414
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/search-engine-indexing")
            ->assertStatus(502);
    }

    public function test_search_engine_indexing_reports_a_non_string_option_value(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine's `value` is a string; a non-string is malformed and must
        // not be compared against '1'.
        // CA: packages/client-area/src/views/instance/advanced/Security.vue:414-425 (reads response.data.disabled)
        // Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:106 -> {data:{option,value}}
        Http::fake(['engine.example.com/api/projects/wpsite/wp/options/blog_public*' => Http::response(['data' => ['option' => 'blog_public', 'value' => 1]])]);

        // CA: packages/client-area/src/views/instance/advanced/Security.vue:414
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/search-engine-indexing")
            ->assertStatus(502);
    }

    public function test_set_search_engine_indexing_writes_the_blog_public_option(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:158 → WpOptionController::update,
        // `{data:{option,value}}`.
        Http::fake(['engine.example.com/api/projects/wpsite/wp/options/blog_public*' => Http::response(['data' => ['option' => 'blog_public', 'value' => '1']])]);

        // CA: packages/client-area/src/views/instance/advanced/Security.vue:430 (`{status}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/search-engine-indexing", ['status' => true])
            ->assertOk();

        // CA: packages/client-area/src/views/instance/advanced/Security.vue:430 (`{status:false}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/search-engine-indexing", ['status' => false])
            ->assertOk();

        // The CA's `status` maps to the Engine option's `value` ('1'/'0').
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_contains($r->url(), '/wp/options/blog_public')
            && ($r['value'] ?? null) === '1');
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_contains($r->url(), '/wp/options/blog_public')
            && ($r['value'] ?? null) === '0');
    }

    public function test_set_site_name_and_clear_cache(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:158
            'engine.example.com/api/projects/wpsite/wp/options/blogname*' => Http::response(['data' => ['value' => 'My Shop']]),
// Engine: core/app/Http/Controllers/User/Wp/WpCacheController.php:61
            'engine.example.com/api/projects/wpsite/wp/cache/flush*' => Http::response(null, 204),
        ]);

        // CA: packages/client-area/src/apis/Instances.js:279 (`{name}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/site-name", ['name' => 'My Shop'])
            ->assertOk();

        $this->assertSame('My Shop', $application->fresh()->name);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:183 (`Api.put(.../clear-cache)`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/clear-cache")
            ->assertOk();

        Http::assertSent(fn ($r) => str_contains($r->url(), '/wp/options/blogname') && $r['value'] === 'My Shop');
    }

    public function test_installation_details_collects_db_config_and_version(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // The installation directory is the main domain's document root, a
            // domain detail – not a project one.
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/wpsite.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['version' => '6.5']]),
// Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:104
            'engine.example.com/api/projects/wpsite/wp/options/blogname*' => Http::response(['data' => ['value' => 'My Shop']]),
            // One `GET wp/config` list, `type=all`.
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => 'wpsite_wp', 'type' => 'constant'],
                ['name' => 'DB_USER', 'value' => 'wpsite_wp', 'type' => 'variable'],
                ['name' => 'DB_PASSWORD', 'value' => 'secret', 'type' => 'constant'],
                ['name' => 'DB_HOST', 'value' => 'db', 'type' => 'constant'],
                ['name' => 'WP_DEBUG', 'value' => 'false', 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89 (`Api.get(.../installation-details)`)
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:18,24,30,36,42
        // (`directory`, `database_name`, `database_user`, `database_password`, `database_host`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/installation-details")
            ->assertOk()
            ->assertJsonPath('data.directory', '/wpsite.example.com/public_html')
            ->assertJsonPath('data.database_name', 'wpsite_wp')
            // The login and the password are masked; only POST .../secrets/reveal answers them.
            ->assertJsonPath('data.database_user', \PanelAlpha\ClientArea\Projects\ProjectSecrets::MASK)
            ->assertJsonPath('data.database_password', \PanelAlpha\ClientArea\Projects\ProjectSecrets::MASK)
            ->assertJsonPath('data.database_host', 'db');

        // Inert old-panel shape: the v1 payload still carries `version`,
        // `site_name` and `debug`, but the committed CA card does not read them,
        // so they are not asserted here.

        // Exactly one `GET wp/config` and one `GET wp/core` – both with
        // skip_plugins.
        $configCalls = 0;
        $coreCalls = 0;
        foreach (Http::recorded() as [$request]) {
            if (str_contains($request->url(), '/wp/config')) {
                $configCalls++;
                $this->assertSame(1, (int) ($request['skip_plugins'] ?? 0));
            }
            if (str_contains($request->url(), '/wp/core')) {
                $coreCalls++;
                $this->assertSame(1, (int) ($request['skip_plugins'] ?? 0));
            }
        }
        $this->assertSame(1, $configCalls);
        $this->assertSame(1, $coreCalls);
    }

    public function test_installation_details_without_a_wp_config_answers_no_failed_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // The directory is the main domain's document root, a domain detail.
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/wpsite.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '7.1.4', 'state' => 'no_config']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 (the wp-cli answer)
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response([
                'message' => "Error: 'wp-config.php' not found.\nEither create one manually or use `wp config create`.",
                'errors' => ['engine' => ["Error: 'wp-config.php' not found."]],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:18,24,30,36,42
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/installation-details")
            ->assertOk()
            ->assertJsonPath('data.version', '7.1.4')
            ->assertJsonPath('data.directory', '/wpsite.example.com/public_html')
            ->assertJsonPath('data.database_name', null)
            ->assertJsonPath('data.database_user', null)
            ->assertJsonPath('data.database_password', null)
            ->assertJsonPath('data.database_host', null)
            ->assertJsonPath('data.debug', 'Off');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/config'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/options'));
    }

    /**
     * With the database down the wp-config.php list still reads (it does not
     * load WordPress), so the card keeps its settings; the site name's `wp
     * option get` needs the database and is skipped instead of answering its
     * wp-cli text as a 422.
     */
    public function test_installation_details_reads_wp_config_with_the_database_unreachable(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/wpsite.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => '7.1.4', 'state' => 'db_unreachable']]),
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => 'wpsite_wp', 'type' => 'constant'],
                ['name' => 'DB_USER', 'value' => 'wpsite_wp', 'type' => 'variable'],
                ['name' => 'DB_PASSWORD', 'value' => 'secret', 'type' => 'constant'],
                ['name' => 'DB_HOST', 'value' => TestNetwork::LOOPBACK.':39', 'type' => 'constant'],
            ]]),
// Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:104 (the wp-cli answer)
            'engine.example.com/api/projects/wpsite/wp/options/blogname*' => Http::response([
                'message' => 'Error: Error establishing a database connection.',
                'errors' => ['engine' => ['Error: Error establishing a database connection.']],
            ], 422),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:18,24,30,36,42
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/installation-details")
            ->assertOk()
            ->assertJsonPath('data.version', '7.1.4')
            ->assertJsonPath('data.site_name', null)
            ->assertJsonPath('data.database_name', 'wpsite_wp')
            ->assertJsonPath('data.database_user', \PanelAlpha\ClientArea\Projects\ProjectSecrets::MASK)
            ->assertJsonPath('data.database_host', TestNetwork::LOOPBACK.':39');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/options'));
    }

    public function test_debug_put_sends_the_constant_type(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:258
        Http::fake(['engine.example.com/api/projects/wpsite/wp/config/WP_DEBUG' => Http::response(['data' => ['constant' => 'WP_DEBUG', 'value' => 'true']])]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:388 (`{status}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/debug-mode", ['status' => true])
            ->assertOk();

        // Engine `type` is constant|variable|all (not `boolean`).
        Http::assertSent(fn ($r) => $r->method() === 'PUT' && $r['type'] === 'constant');
    }

    public function test_auto_update_writes_only_the_changed_field(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            'engine.example.com/api/projects/wpsite/wp/auto-update*' => function ($request) {
                if ($request->method() === 'GET') {
// Engine: core/app/Http/Controllers/User/Wp/WpAutoUpdateController.php:83
                    return Http::response(['data' => ['core' => 'off', 'plugins' => 'on', 'themes' => 'on']]);
                }

// Engine: core/app/Http/Controllers/User/Wp/WpAutoUpdateController.php:134
                return Http::response(['data' => ['core' => 'on']]);
            },
        ]);

        // CA AutoUpdates.vue sends all three; only core changed (off -> on).
        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:156-158 (`{auto_update, auto_update_plugins, auto_update_themes}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/auto-update", [
                'auto_update' => 1,
                'auto_update_plugins' => 1,
                'auto_update_themes' => 1,
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && ($r['core'] ?? null) === 'on'
            && ! array_key_exists('plugins', $r->data())
            && ! array_key_exists('themes', $r->data()));
    }

    public function test_auto_update_show_maps_the_engine_settings_to_the_ca_values(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/routes/api.php:265-297 (wp/*), GET {data:{core,plugins,themes}}.
        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue reads
        // auto_update 0/1/2 and the two 0/1 flags.
        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpAutoUpdateController.php:83
            'engine.example.com/api/projects/wpsite/wp/auto-update*' => Http::response(['data' => [
                'core' => 'minor',
                'plugins' => 'off',
                'themes' => 'on',
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:237
        // CA reads: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:239 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/auto-update")
            ->assertOk()
            ->assertJsonPath('data.auto_update', 2)
            ->assertJsonPath('data.auto_update_plugins', 0)
            ->assertJsonPath('data.auto_update_themes', 1)
            ->assertJsonPath('data.updater_blocked_by', []);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/auto-update')
            && ($r['skip_plugins'] ?? null) == 1);
    }

    public function test_auto_update_show_passes_the_engine_blocked_by_through(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpAutoUpdateController.php:83
            'engine.example.com/api/projects/wpsite/wp/auto-update*' => Http::response(['data' => [
                'core' => 'off',
                'plugins' => 'on',
                'themes' => 'on',
                'blocked_by' => ['WP_AUTO_UPDATE_CORE', 'DISALLOW_FILE_MODS'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:237
        // CA reads: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:239 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/auto-update")
            ->assertOk()
            ->assertJsonPath('data.auto_update', 0)
            ->assertJsonPath('data.updater_blocked_by', ['WP_AUTO_UPDATE_CORE', 'DISALLOW_FILE_MODS']);
    }

    public function test_auto_update_show_drops_a_blocked_by_that_is_not_a_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Defensive (not an Engine shape): the Engine always sends a list; a string is not read as one.
            'engine.example.com/api/projects/wpsite/wp/auto-update*' => Http::response(['data' => [
                'core' => 'on',
                'plugins' => 'on',
                'themes' => 'on',
                'blocked_by' => 'DISALLOW_FILE_MODS',
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:237
        // CA reads: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:239 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/auto-update")
            ->assertOk()
            ->assertJsonPath('data.updater_blocked_by', []);
    }

    public function test_auto_update_show_keeps_only_the_string_items_of_blocked_by(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Defensive (not an Engine shape): a list with non-string items; only the string is kept.
            'engine.example.com/api/projects/wpsite/wp/auto-update*' => Http::response(['data' => [
                'core' => 'on',
                'plugins' => 'on',
                'themes' => 'on',
                'blocked_by' => ['DISALLOW_FILE_MODS', 5, null, ['x']],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:237
        // CA reads: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:239 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/auto-update")
            ->assertOk()
            ->assertJsonPath('data.updater_blocked_by', ['DISALLOW_FILE_MODS']);
    }

    public function test_sso_requires_an_integer_user(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:272 (`{user}`)
        // CA reads: packages/client-area/src/components/modal/WpAdminSsoModal.vue:290 (field errors shown via `Api.getErrorMessage`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/sso-url", ['user' => 'not-an-int'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('user');
    }

    public function test_themes_list_presents_the_keys_the_ca_reads(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The panel asks for `title` and `description` (`fields`), which WP-CLI then lists.
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74 → Themes::list
        // (core/app/System/Project/PhpHosting/WordPress/Themes.php:24), WP-CLI `theme list --format=json`.
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes*' => Http::response(['data' => [
            ['name' => 'twentytwentyfour', 'title' => 'Twenty Twenty-Four', 'status' => 'active', 'update' => 'none', 'version' => '1.2',
                'update_version' => '', 'auto_update' => 'off', 'description' => 'A block theme.'],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/router/fetchData.js:183 (the CA maps `response.data.data`)
        // CA reads: packages/client-area/src/components/themes/ThemeTable.vue:86,88,104,108,115
        // (`title`/`name`, `description`, `update`, `version`, `status`),
        // packages/client-area/src/mixins/ThemesActionsMixin.js:172,197,205 (`update_version`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/themes")
            ->assertOk()
            ->assertJsonPath('data.0.type', 'marketplace')
            ->assertJsonPath('data.0.name', 'twentytwentyfour')
            ->assertJsonPath('data.0.status', 'active')
            ->assertJsonPath('data.0.update', 'none')
            ->assertJsonPath('data.0.version', '1.2')
            ->assertJsonPath('data.0.title', 'Twenty Twenty-Four')
            ->assertJsonPath('data.0.description', 'A block theme.')
            ->assertJsonStructure(['data' => [[
                'type', 'name', 'status', 'update', 'version', 'title', 'description', 'update_version', 'application_id', 'async_status',
            ]]]);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/themes')
            && ($r['fields'] ?? null) === 'name,title,status,update,version,update_version,auto_update,description'
            && ($r['skip_plugins'] ?? null) == 1);
    }

    public function test_theme_search_returns_the_ca_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // (core/app/System/Project/PhpHosting/WordPress/Themes.php:136), WP-CLI `theme search --format=json`
        // with the panel's `fields=` list (AbstractThemes::search:82).
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:136 → Themes::search
        Http::fake(['engine.example.com/api/projects/wpsite/wp/themes/search*' => Http::response(['data' => [
            ['name' => 'Astra', 'slug' => 'astra', 'rating' => 98, 'version' => '4.6', 'description' => 'A fast theme', 'screenshot_url' => '//ts.w.org/astra.png', 'preview_url' => 'https://wp-themes.com/astra'],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/router/fetchData.js:200
        // CA reads: packages/client-area/src/components/themes/NewThemeCard.vue:67,75,79,94,109,126-128
        // (`slug`, `name`, `description`, `rating`, `preview_url`/`screenshot_url`; the install action uses `item.slug`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/themes/new/search/astra")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Astra')
            ->assertJsonPath('data.0.slug', 'astra')
            ->assertJsonPath('data.0.rating', 98)
            ->assertJsonPath('data.0.version', '4.6')
            ->assertJsonPath('data.0.preview_url', 'https://wp-themes.com/astra')
            ->assertJsonPath('data.0.screenshot_url', '//ts.w.org/astra.png')
            ->assertJsonStructure(['data' => [[
                'type', 'name', 'slug', 'rating', 'description', 'version', 'preview_url', 'screenshot_url', 'featured',
            ]]]);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/themes/search')
            && ($r['term'] ?? null) === 'astra'
            && ($r['fields'] ?? null) === 'name,version,slug,rating,screenshot_url,preview_url,description'
            && ($r['skip_plugins'] ?? null) == 1);
    }

    public function test_plugin_search_returns_the_ca_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // (core/app/System/Project/PhpHosting/WordPress/Plugins.php:114), WP-CLI `plugin search --format=json`
        // with the panel's `fields=` list (AbstractPlugins::search:216).
        // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:136 → Plugins::search
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/search*' => Http::response(['data' => [
            ['name' => 'Akismet', 'version' => '5.3', 'slug' => 'akismet', 'rating' => 96, 'last_updated' => '2024-01-01', 'requires' => '5.0', 'tested' => '6.6', 'active_installs' => 5000000, 'short_description' => 'Anti-spam', 'description' => 'Akismet blocks spam', 'icons' => ['1x' => 'https://ps.w.org/akismet/icon-128x128.png']],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/router/fetchData.js:159
        // CA reads: packages/client-area/src/components/plugins/NewPluginCard.vue:16,34,52,58,84
        // (`name`, `short_description`/`description`, `rating`, `active_installs`),
        // packages/client-area/src/mixins/PluginsActionsMixin.js:38 (`slug` for the install action)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/plugins/new/search/akismet")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Akismet')
            ->assertJsonPath('data.0.slug', 'akismet')
            ->assertJsonPath('data.0.rating', 96)
            ->assertJsonPath('data.0.active_installs', 5000000)
            ->assertJsonPath('data.0.short_description', 'Anti-spam')
            // NewPluginTable.vue:172,176 reads the `tested` column.
            ->assertJsonPath('data.0.tested', '6.6')
            ->assertJsonStructure(['data' => [[
                'name', 'slug', 'rating', 'active_installs', 'short_description', 'description', 'tested', 'featured',
            ]]]);

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/plugins/search')
            && ($r['term'] ?? null) === 'akismet'
            && ($r['fields'] ?? null) === 'name,version,slug,rating,last_updated,requires,tested,active_installs,short_description,description,icons'
            && ($r['skip_plugins'] ?? null) == 1);
    }

    public function test_plugin_list_uses_the_old_shape_and_async_status(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        \PanelAlpha\ClientArea\Models\WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => 'plugin',
            'name' => 'akismet',
            'action' => 'install',
            'status' => 'pending',
        ]);

// Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74 → Plugins::list (core/app/System/Project/PhpHosting/WordPress/Plugins.php:24, `--fields`)
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => [
            ['name' => 'akismet', 'title' => 'Akismet Anti-spam', 'status' => 'inactive', 'update' => 'available', 'version' => '4.0', 'update_version' => '5.0',
                'auto_update' => 'off', 'description' => 'Used by millions.'],
        ]])]);
        $this->fakeEngineWordPressCore('wpsite');

        // CA: packages/client-area/src/router/fetchData.js:145
        // CA reads: packages/client-area/src/views/instance/Plugins.vue:687-689 (`async_status.install`),
        // packages/client-area/src/components/plugins/PluginTable.vue:60,101,104,132,138
        // (`status`, `version`, `update`, `activation_disabled`),
        // packages/client-area/src/mixins/PluginsActionsMixin.js:308,327,335 (`update_version`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/plugins")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'akismet')
            ->assertJsonPath('data.0.application_id', $application->id)
            ->assertJsonPath('data.0.status', 'inactive')
            ->assertJsonPath('data.0.update', 'available')
            ->assertJsonPath('data.0.version', '4.0')
            ->assertJsonPath('data.0.update_version', '5.0')
            ->assertJsonPath('data.0.activation_disabled', false)
            ->assertJsonPath('data.0.title', 'Akismet Anti-spam')
            ->assertJsonPath('data.0.description', 'Used by millions.')
            ->assertJsonPath('data.0.async_status.install', 'pending');

        // The old panel's list carried title and description; the Engine's default fields do not.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/wp/plugins')
            && ($r['fields'] ?? null) === 'name,title,status,update,version,update_version,auto_update,description');
    }

    /**
     * `wp plugin list` and `wp theme list` read the database, so a core that
     * cannot be queried lists nothing instead of answering the Engine's wp-cli
     * text as a 422, the rule the maintenance read follows. Both pages then
     * show their empty state.
     */
    #[DataProvider('unqueryableCores')]
    public function test_a_list_answers_nothing_when_the_core_cannot_be_queried(string $read, array $core): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineWordPressCore('wpsite', $core);

        // CA: packages/client-area/src/router/fetchData.js:145,183 (the list `data.data`)
        // CA reads: packages/client-area/src/views/instance/Plugins.vue:11 (an empty list shows the empty state)
        // CA reads: packages/client-area/src/views/instance/advanced/Themes.vue:15
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/{$read}")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), "/wp/{$read}"));
    }

    /**
     * @return array<string, array{string, array<string, mixed>}>
     */
    public static function unqueryableCores(): array
    {
        $cases = [];
        foreach (['plugins', 'themes'] as $read) {
            foreach (self::unqueryableCoreBodies() as $name => $core) {
                $cases["{$read} {$name}"] = [$read, $core];
            }
        }

        return $cases;
    }

    /** A catalogue search answers nothing for a core that cannot be queried. */
    #[DataProvider('unqueryableCatalogueCores')]
    public function test_a_catalogue_search_answers_nothing_when_the_core_cannot_be_queried(string $kind, array $core): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeEngineWordPressCore('wpsite', $core);

        // CA: packages/client-area/src/router/fetchData.js:159 (plugins), :200 (themes)
        // CA reads: packages/client-area/src/views/instance/Plugins.vue:165-200 (an empty list keeps the "Start Searching" card)
        // CA reads: packages/client-area/src/views/instance/advanced/Themes.vue:208
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/{$kind}/new/search/akismet")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), "/wp/{$kind}/search"));
    }

    /**
     * @return array<string, array{string, array<string, mixed>}>
     */
    public static function unqueryableCatalogueCores(): array
    {
        $cases = [];
        foreach (['plugins', 'themes'] as $kind) {
            foreach (self::unqueryableCoreBodies() as $name => $core) {
                $cases["{$kind} {$name}"] = [$kind, $core];
            }
        }

        return $cases;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function unqueryableCoreBodies(): array
    {
        return [
            'without a wp-config.php' => ['installed' => false, 'version' => '7.1.4', 'state' => 'no_config'],
            'with the database down' => ['installed' => false, 'version' => '7.1.4', 'state' => 'db_unreachable'],
            'without a core' => ['installed' => false, 'version' => null, 'state' => 'no_core'],
            // An older Engine: `installed` false with a version is a database-down site.
            'with the database down on an Engine without a state' => ['installed' => false, 'version' => '7.1.4', 'state' => null],
        ];
    }

    public function test_wordpress_routes_require_authentication(): void
    {
        // CA: packages/client-area/src/mixins/OpenModalAction.js:95
        $this->getJson('/api/projects/1/wordpress/updates')->assertUnauthorized();
    }

    public function test_set_auto_update_requires_all_three_fields_like_the_old_request(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old ToggleAutoUpdateRequest required each field; the CA sends all
        // three every time (AutoUpdates.vue:156-158, 177-179, 197-199).
        // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:156-158 (all three fields)
        // CA reads: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:157-158
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/auto-update", ['auto_update' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['auto_update_plugins', 'auto_update_themes']);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'wp/auto-update'));
    }

    public function test_core_update_accepts_an_untouched_backup_box(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // The dialog's "Create Backup" box starts unticked, which the CA sends as
        // `null`; the request reads that as `false` instead of refusing the update.
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:139
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6', 'create_backup' => null])
            ->assertStatus(202);

        $this->assertSame(WordPressAsyncStatus::PENDING, WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::CORE)
            ->value('status'));
    }

    public function test_core_update_sets_the_project_async_status_update(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (`{version}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6'])
            ->assertStatus(202);

        // Old UpdateController::update set async_status.update = pending before
        // dispatching; the CA gates `hasUpdateInProgress()` on it
        // (Instances.js:246) and the Engine has no `update` key.
        $this->assertSame(WordPressAsyncStatus::PENDING, WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::CORE)
            ->value('status'));

        $presented = app(ProjectPresenter::class)->present($application->fresh(), $user);
        $this->assertSame('pending', $presented['async_status']['update']);
    }

    public function test_core_update_with_the_backup_box_starts_a_full_backup_before_queuing_the_update(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            // Engine: core/app/Http/Controllers/User/BackupController.php:105 -> BackupController::store (202 + BackupResource)
            'engine.example.com/api/projects/wpsite/backups' => Http::response(['data' => [
                'id' => 71,
                'kind' => 'manual',
                'contents' => ['files' => true, 'databases' => true],
                'items' => [],
                'async_status' => ['backup' => 'pending', 'source' => 'api', 'task_id' => 555],
            ]], 202),
        ]);

        // The update dialog's backup box: "tick the backup box if you want a backup first".
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (`{version, create_backup}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6', 'create_backup' => true])
            ->assertStatus(202);

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/api/projects/wpsite/backups')
            && $r['container'] === '3'
            && $r['files'] === true
            && $r['databases'] === true
            && $r['note'] === 'Before the WordPress update to 6.6');

        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job): bool => $job->action === RunWordPressActionJob::CORE_UPDATE
            && $job->backupTaskId === 555
            && ($job->payload['version'] ?? null) === '6.6');
    }

    public function test_core_update_without_the_backup_box_makes_no_backup(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (an untouched box sends no `create_backup`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6'])
            ->assertStatus(202);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/backups'));
        Queue::assertPushed(RunWordPressActionJob::class, fn (RunWordPressActionJob $job): bool => $job->backupTaskId === null);
    }

    public function test_core_update_with_the_backup_box_is_refused_when_no_backup_container_is_configured(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index, no container
        Http::fake(['engine.example.com/api/backup-containers' => Http::response(['data' => []])]);

        // The update is not queued without the backup it was asked to make; the CA gets the backups refusal.
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/update", ['version' => '6.6', 'create_backup' => true])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/mixins/InstanceActionsMixin.js:147 (the key-0 message on the dialog)
            ->assertJsonValidationErrors('0')
            ->assertJsonPath('errors.0.0', BackupService::NO_CONTAINER_REFUSAL);

        Queue::assertNothingPushed();
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/core/update'));
        $this->assertSame(0, WordPressAsyncStatus::query()->where('application_id', $application->id)->where('type', WordPressAsyncStatus::CORE)->count());
    }
}
