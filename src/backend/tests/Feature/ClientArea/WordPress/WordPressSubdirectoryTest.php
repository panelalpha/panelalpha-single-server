<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * A WordPress installed into a subdirectory: the Engine's `wp/*` endpoints read
 * the main domain's document root when the call names no `path`, so the panel
 * has to name the directory of the install it made.
 *
 * @see Engine core/app/Http/Requests/Wp/WpCorePathRequest.php:16 (the `path` field of every wp/* call)
 * @see Engine core/app/Http/Requests/Wp/WpPluginListRequest.php:21
 */
final class WordPressSubdirectoryTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user, string $directory): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'wpsite'),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'wpsite')->firstOrFail();
        // A finished panel-run install is what makes it a WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS, 'site_name' => 'FX Subdir']);
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => WordPressInstall::FINISHED,
            'params' => ['dir' => $directory, 'url' => 'https://wpsite.example.com/'.$directory],
        ]);

        return $application;
    }

    /**
     * The WordPress tab's reads; the document root comes from the main domain.
     */
    private function fakeWordPressReads(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/wpsite.example.com/public_html',
                ]],
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:85 -> status
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => [
                'installed' => true, 'version' => '7.1.4', 'state' => 'installed',
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> index
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => 'wpsite_blog', 'type' => 'constant'],
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74 -> index
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:74 -> index
            'engine.example.com/api/projects/wpsite/wp/users*' => Http::response(['data' => []]),
        ]);
    }

    public function test_the_wordpress_tab_reads_the_subdirectory_install(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, 'blog');
        $this->fakeWordPressReads();

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89
        $details = $this->actingAs($user)->getJson("/api/projects/{$application->id}/installation-details");
        // CA reads: packages/client-area/src/views/instance/advanced/Details.vue:22,30,38,46,54
        $details->assertOk()
            ->assertJsonPath('data.url', 'https://wpsite.example.com/blog')
            ->assertJsonPath('data.directory', '/wpsite.example.com/public_html/blog')
            ->assertJsonPath('data.version', '7.1.4')
            ->assertJsonPath('data.database_name', 'wpsite_blog');

        // CA: packages/client-area/src/router/fetchData.js:145
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/plugins")->assertOk();
        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/users")->assertOk();

        foreach (['/wp/core', '/wp/config', '/wp/plugins', '/wp/users'] as $read) {
            Http::assertSent(fn ($request) => str_contains($request->url(), $read)
                && ($request['path'] ?? null) === 'wpsite.example.com/public_html/blog');
        }
    }

    public function test_an_install_in_the_document_root_names_no_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, '');
        $this->fakeWordPressReads();

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89
        $details = $this->actingAs($user)->getJson("/api/projects/{$application->id}/installation-details");
        // CA reads: packages/client-area/src/views/instance/advanced/Details.vue:21-22
        $details->assertOk()
            ->assertJsonPath('data.url', 'https://wpsite.example.com')
            ->assertJsonPath('data.directory', '/wpsite.example.com/public_html');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/wp/core')
            && ($request['path'] ?? null) === null);
    }

    /**
     * A staging copy is the same files and database as its live project, so it is
     * a WordPress project too and its install sits in the same subdirectory. The
     * Engine reads the copy's main document root, where a subdirectory install
     * has no core, and answers `php`.
     */
    public function test_a_staging_copy_carries_the_live_install_and_its_directory(): void
    {
        $user = User::factory()->create();
        $live = $this->application($user, 'blog');
        // Engine: core/app/Http/Controllers/User/StagingController.php:65 -> staging
        Http::fake(['engine.example.com/api/projects/wpsite/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'wpsitestg',
            'name' => '(staging) Wpsite',
            'domain' => 'staging.wpsite.example.com',
            'status' => 'pending',
            'staging_of' => 'wpsite',
            'staging' => null,
            // Engine: core/app/Http/Resources/UserResource.php:58 -> ProjectOverview (ClassicAppType)
            'app' => ['type' => 'php'],
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        // CA: src/components/modal/CreateStagingModal.vue:307
        $created = $this->actingAs($user)
            ->postJson("/api/projects/{$live->id}/staging", ['domain' => 'staging.wpsite.example.com'])
            ->assertCreated();

        // CA reads: packages/client-area/src/apis/Instances.js:145
        $created->assertJsonPath('data.type', Application::TYPE_WORDPRESS)
            ->assertJsonPath('data.app_type', Application::TYPE_WORDPRESS);
        // CA reads: packages/client-area/src/apis/Instances.js:267
        $created->assertJsonPath('data.supports_admin_sso', true);
        $staging = Application::query()->where('engine_username', 'wpsitestg')->firstOrFail();
        $this->assertSame(Application::TYPE_WORDPRESS, $staging->type);
        $this->assertContains('wordpress.manage_plugins', $created->json('data.privileges'));

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index
            'engine.example.com/api/projects/wpsitestg/domains' => Http::response(['data' => [
                ['id' => 2, 'domain' => 'staging.wpsite.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/staging.wpsite.example.com/public_html',
                ]],
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:85 -> status
            'engine.example.com/api/projects/wpsitestg/wp/core*' => Http::response(['data' => [
                'installed' => true, 'version' => '7.1.4', 'state' => 'installed',
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> index
            'engine.example.com/api/projects/wpsitestg/wp/config*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => 'wpsitestg_blog', 'type' => 'constant'],
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:35 -> show
            'engine.example.com/api/projects/wpsitestg/wp/options/*' => Http::response(['data' => ['value' => 'Wpsite']]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89
        $details = $this->actingAs($user)->getJson("/api/projects/{$staging->id}/installation-details");
        // CA reads: packages/client-area/src/views/instance/advanced/Details.vue:22,30,38
        $details->assertOk()
            ->assertJsonPath('data.url', 'https://staging.wpsite.example.com/blog')
            ->assertJsonPath('data.directory', '/staging.wpsite.example.com/public_html/blog')
            ->assertJsonPath('data.version', '7.1.4')
            ->assertJsonPath('data.database_name', 'wpsitestg_blog');

        foreach (['/wp/core', '/wp/config'] as $read) {
            Http::assertSent(fn ($request) => str_contains($request->url(), 'wpsitestg'.$read)
                && ($request['path'] ?? null) === 'staging.wpsite.example.com/public_html/blog');
        }
    }
}
