<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Agent-brief §8 per-endpoint matrix for every WordPress route
 * (`packages/client-area/routes/wordpress.php`):
 *
 *  - unauthenticated -> 401;
 *  - its own privilege missing -> 403 (only the routes that carry one);
 *  - foreign / unknown application -> 404;
 *  - Engine down -> 503 on a connection error, 502 on an Engine 5xx
 *    (`EngineRequestException::render`).
 *
 * The five write routes that the CA treats as async (`wordpress/update`, the
 * plugin/theme install & update routes) dispatch `RunWordPressActionJob` and
 * answer 202 even when the Engine is down – the job owns the failure and the
 * `*_failed` notification. The theme screenshot routes catch
 * the Engine failure and answer the 1×1 GIF placeholder (old
 * `ThemeController::screenshot`), so a down Engine is pinned separately rather
 * than as a wrong 503.
 *
 * CA call sites (request body and the keys read) per route family:
 *   GET    wordpress/updates                       packages/client-area/src/mixins/OpenModalAction.js:95
 *   GET    wordpress/maintenance-mode              packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:339
 *   PUT    wordpress/maintenance-mode              packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:414
 *   GET    wordpress/debug-mode                    packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:355
 *   PUT    wordpress/debug-mode                    packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:388
 *   GET    wordpress/search-engine-indexing        packages/client-area/src/views/instance/advanced/Security.vue:414
 *   PUT    wordpress/search-engine-indexing        packages/client-area/src/views/instance/advanced/Security.vue:430
 *   GET    wordpress/auto-update                   packages/client-area/src/views/instance/advanced/AutoUpdates.vue:237
 *   PUT    wordpress/auto-update                   packages/client-area/src/views/instance/advanced/AutoUpdates.vue:156
 *   GET    wordpress/plugins                       packages/client-area/src/router/fetchData.js:145
 *   GET    wordpress/plugins/new/search/{term}     packages/client-area/src/router/fetchData.js:159
 *   PUT    wordpress/plugins/{p}/activate          packages/client-area/src/mixins/PluginsActionsMixin.js:161
 *   PUT    wordpress/plugins/{p}/deactivate        packages/client-area/src/mixins/PluginsActionsMixin.js:278
 *   PUT    wordpress/plugins/{p}/update            packages/client-area/src/mixins/PluginsActionsMixin.js:362
 *   DELETE wordpress/plugins/{p}                   packages/client-area/src/mixins/PluginsActionsMixin.js:516
 *   POST   wordpress/plugins/new/{name}/install    packages/client-area/src/mixins/PluginsActionsMixin.js:38
 *   GET    wordpress/themes/{t}/screenshot         packages/client-area/src/router/fetchData.js:185
 *   GET    wordpress/themes                        packages/client-area/src/router/fetchData.js:183
 *   GET    wordpress/themes/new/search/{term}      packages/client-area/src/router/fetchData.js:200
 *   PUT    wordpress/themes/{t}/activate           packages/client-area/src/mixins/ThemesActionsMixin.js:104
 *   PUT    wordpress/themes/{t}/update             packages/client-area/src/mixins/ThemesActionsMixin.js:229
 *   DELETE wordpress/themes/{t}                    packages/client-area/src/mixins/ThemesActionsMixin.js:355
 *   POST   wordpress/themes/new/{name}/install     packages/client-area/src/mixins/ThemesActionsMixin.js:30
 *   PUT    wordpress/update                        packages/client-area/src/mixins/InstanceActionsMixin.js:139
 *   GET    wordpress/config                        packages/client-area/src/router/fetchData.js:224
 *   POST   wordpress/config                        packages/client-area/src/mixins/ConfigActionsMixin.js:121
 *   PUT    wordpress/config/{name}                 packages/client-area/src/mixins/ConfigActionsMixin.js:199
 *   DELETE wordpress/config/{name}                 packages/client-area/src/mixins/ConfigActionsMixin.js:41
 *   GET    wordpress/users                         packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
 *   POST   wordpress/users                         packages/client-area/src/mixins/UsersActionsMixin.js:163
 *   PUT    wordpress/users/{id}                    packages/client-area/src/mixins/UsersActionsMixin.js:274
 *   DELETE wordpress/users/{id}                    packages/client-area/src/mixins/UsersActionsMixin.js:41
 *   PUT    wordpress/users/{id}/reset-password     packages/client-area/src/mixins/UsersActionsMixin.js:326
 *   POST   sso-url                                 packages/client-area/src/components/modal/WpAdminSsoModal.vue:272
 *   PUT    wordpress/site-name                     packages/client-area/src/apis/Instances.js:279
 *   PUT    clear-cache                             packages/client-area/src/mixins/InstanceActionsMixin.js:183
 *   GET    installation-details                    packages/client-area/src/views/instance/advanced/Details.vue:89
 *   POST   secrets/reveal                          packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
 *
 * @see packages/api/routes/api.php (old WordPress route privileges)
 * @see Engine core/routes/api.php:263-321 (wp/*)
 */
class WordPressRouteMatrixTest extends TestCase
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
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    /**
     * One case per WordPress route: method, URI template and the privilege the
     * route carries (null for the reads the old panel left open).
     *
     * @return array<string, array{string, string, string|null}>
     */
    public static function wordpressRoutes(): array
    {
        return [
            'updates' => ['GET', 'projects/{application}/wordpress/updates', null],
            'maintenance.show' => ['GET', 'projects/{application}/wordpress/maintenance-mode', null],
            'maintenance.update' => ['PUT', 'projects/{application}/wordpress/maintenance-mode', 'wordpress.manage_maintenance_mode'],
            'debug.show' => ['GET', 'projects/{application}/wordpress/debug-mode', null],
            'debug.update' => ['PUT', 'projects/{application}/wordpress/debug-mode', 'wordpress.manage_debug_mode'],
            'indexing.show' => ['GET', 'projects/{application}/wordpress/search-engine-indexing', null],
            'indexing.update' => ['PUT', 'projects/{application}/wordpress/search-engine-indexing', 'wordpress.manage_search_engine_indexing'],
            'auto_update.show' => ['GET', 'projects/{application}/wordpress/auto-update', null],
            'auto_update.update' => ['PUT', 'projects/{application}/wordpress/auto-update', 'wordpress.manage_auto_update'],
            'plugins.index' => ['GET', 'projects/{application}/wordpress/plugins', null],
            'plugins.search' => ['GET', 'projects/{application}/wordpress/plugins/new/search/{term}', null],
            'plugins.featured' => ['GET', 'projects/{application}/wordpress/plugins/new/featured', null],
            'plugins.activate' => ['PUT', 'projects/{application}/wordpress/plugins/{plugin}/activate', 'wordpress.manage_plugins'],
            'plugins.deactivate' => ['PUT', 'projects/{application}/wordpress/plugins/{plugin}/deactivate', 'wordpress.manage_plugins'],
            'plugins.update' => ['PUT', 'projects/{application}/wordpress/plugins/{plugin}/update', 'wordpress.manage_plugins'],
            'plugins.destroy' => ['DELETE', 'projects/{application}/wordpress/plugins/{plugin}', 'wordpress.manage_plugins'],
            'plugins.install' => ['POST', 'projects/{application}/wordpress/plugins/new/{name}/install', 'wordpress.manage_plugins'],
            'themes.screenshot' => ['GET', 'projects/{application}/wordpress/themes/{theme}/screenshot', null],
            'themes.index' => ['GET', 'projects/{application}/wordpress/themes', null],
            'themes.search' => ['GET', 'projects/{application}/wordpress/themes/new/search/{term}', null],
            'themes.featured' => ['GET', 'projects/{application}/wordpress/themes/new/featured', null],
            'themes.activate' => ['PUT', 'projects/{application}/wordpress/themes/{theme}/activate', 'wordpress.manage_themes'],
            'themes.update' => ['PUT', 'projects/{application}/wordpress/themes/{theme}/update', 'wordpress.manage_themes'],
            'themes.destroy' => ['DELETE', 'projects/{application}/wordpress/themes/{theme}', 'wordpress.manage_themes'],
            'themes.install' => ['POST', 'projects/{application}/wordpress/themes/new/{name}/install', 'wordpress.manage_themes'],
            'core.update' => ['PUT', 'projects/{application}/wordpress/update', 'wordpress.update'],
            'config.index' => ['GET', 'projects/{application}/wordpress/config', null],
            'config.store' => ['POST', 'projects/{application}/wordpress/config', 'wordpress.manage_config'],
            'config.update' => ['PUT', 'projects/{application}/wordpress/config/{name}', 'wordpress.manage_config'],
            'config.destroy' => ['DELETE', 'projects/{application}/wordpress/config/{name}', 'wordpress.manage_config'],
            'users.index' => ['GET', 'projects/{application}/wordpress/users', null],
            'users.store' => ['POST', 'projects/{application}/wordpress/users', 'wordpress.manage_users'],
            'users.update' => ['PUT', 'projects/{application}/wordpress/users/{userId}', 'wordpress.manage_users'],
            'users.destroy' => ['DELETE', 'projects/{application}/wordpress/users/{userId}', 'wordpress.manage_users'],
            'users.reset_password' => ['PUT', 'projects/{application}/wordpress/users/{userId}/reset-password', 'wordpress.manage_users'],
            'sso_url' => ['POST', 'projects/{application}/sso-url', 'wordpress.create_sso_link'],
            'site_name' => ['PUT', 'projects/{application}/wordpress/site-name', 'wordpress.update_site_name'],
            'clear_cache' => ['PUT', 'projects/{application}/clear-cache', 'wordpress.clear_cache'],
            'installation_details' => ['GET', 'projects/{application}/installation-details', null],
            'secrets.reveal' => ['POST', 'projects/{application}/secrets/reveal', 'wordpress.view_installation_details'],
            'backups.index' => ['GET', 'projects/{application}/wordpress/backups', null],
            'backups.store' => ['POST', 'projects/{application}/wordpress/backups', 'wordpress.manage_backups'],
            'backups.download' => ['GET', 'projects/{application}/wordpress/backups/{backupId}/item/{itemId}/download', 'wordpress.manage_backups'],
            'backups.restore' => ['PUT', 'projects/{application}/wordpress/backups/{backupId}/restore', 'wordpress.manage_backups'],
            'backups.destroy' => ['DELETE', 'projects/{application}/wordpress/backups/{backupId}', 'wordpress.manage_backups'],
            'automatic_backup.show' => ['GET', 'projects/{application}/wordpress/automatic-backup', null],
            'automatic_backup.update' => ['PUT', 'projects/{application}/wordpress/automatic-backup', 'wordpress.manage_auto_backup'],
            'screenshot.alias' => ['GET', 'instances/{application}/wordpress/themes/{theme}/screenshot', null],
            'backups.download_alias' => ['GET', 'instances/{application}/wordpress/backups/{backupId}/item/{itemId}/download', 'wordpress.manage_backups'],
        ];
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function authenticatedWordpressRoutes(): array
    {
        $cases = [];
        foreach (self::wordpressRoutes() as $name => [$method, $template]) {
            $cases[$name] = [$method, $template];
        }

        return $cases;
    }

    /**
     * Only the routes carrying `privilege:` on the route.
     *
     * @return array<string, array{string, string, string, string}>
     */
    public static function privilegedWordpressRoutes(): array
    {
        $cases = [];
        foreach (self::wordpressRoutes() as $name => [$method, $template, $privilege]) {
            if ($privilege !== null) {
                $cases[$name] = [$method, $template, $privilege, $name];
            }
        }

        return $cases;
    }

    /**
     * The routes that answer 503/502 when the Engine is down: every synchronous
     * Engine call. The queued writes answer 202, the screenshot routes answer
     * the placeholder and the featured lists answer [] (WordPressTest); each is
     * pinned by its own tests.
     *
     * @return array<string, array{string, string}>
     */
    public static function engineCallingWordpressRoutes(): array
    {
        $excluded = [
            'projects/{application}/wordpress/plugins/{plugin}/update',
            'projects/{application}/wordpress/plugins/new/{name}/install',
            'projects/{application}/wordpress/themes/{theme}/update',
            'projects/{application}/wordpress/themes/new/{name}/install',
            'projects/{application}/wordpress/update',
            'projects/{application}/wordpress/themes/{theme}/screenshot',
            'instances/{application}/wordpress/themes/{theme}/screenshot',
            // The featured lists answer [] without the Engine.
            'projects/{application}/wordpress/plugins/new/featured',
            'projects/{application}/wordpress/themes/new/featured',
            // The secret reveal answers 423 (password confirmation) before it
            // ever reaches the Engine for a session that has not confirmed.
            'projects/{application}/secrets/reveal',
        ];

        $cases = [];
        foreach (self::wordpressRoutes() as $name => [$method, $template]) {
            if (in_array($template, $excluded, true)) {
                continue;
            }
            $cases[$name] = [$method, $template];
        }

        return $cases;
    }

    #[DataProvider('authenticatedWordpressRoutes')]
    public function test_a_wordpress_route_requires_authentication(string $method, string $template): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA calls every WordPress route authenticated)
        $this->json($method, $this->path($template, 1), $this->bodyFor($template))->assertUnauthorized();
    }

    #[DataProvider('privilegedWordpressRoutes')]
    public function test_a_privileged_wordpress_route_answers_403_without_its_own_privilege(string $method, string $template, string $privilege, string $name): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->denyPrivilege($privilege);

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161 (the CA gates each WordPress write behind its `wordpress.*` privilege)
        $response = $this->actingAs($user)->json($method, $this->path($template, $application->id), $this->bodyFor($template));

        $this->assertSame(403, $response->status(), "{$name} ({$template}) did not answer 403 without {$privilege}.");
    }

    #[DataProvider('authenticatedWordpressRoutes')]
    public function test_a_wordpress_route_answers_404_for_an_unknown_application(string $method, string $template): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // CA: packages/client-area/src/apis/Instances.js:76 (a project id the CA no longer sees)
        $this->actingAs($user)
            ->json($method, $this->path($template, 999999), $this->bodyFor($template))
            ->assertNotFound();
    }

    #[DataProvider('engineCallingWordpressRoutes')]
    public function test_a_wordpress_route_answers_503_when_the_engine_connection_fails(string $method, string $template): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/mixins/PluginsActionsMixin.js:161 (an unreachable Engine is a server error, never a business 200)
        $this->actingAs($user)
            ->json($method, $this->path($template, $application->id), $this->bodyFor($template))
            ->assertStatus(503);
    }

    #[DataProvider('engineCallingWordpressRoutes')]
    public function test_a_wordpress_route_answers_502_when_the_engine_answers_5xx(string $method, string $template): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:23 -> respond (the Engine's error body)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // A 5xx is the Engine's fault, not the user's: `EngineRequestException`
        // renders it 502, not 503.
        // CA: packages/client-area/src/apis/Api.js:67 (the CA surfaces `Api.getErrorMessage(error)`)
        $this->actingAs($user)
            ->json($method, $this->path($template, $application->id), $this->bodyFor($template))
            ->assertStatus(502);
    }

    /**
     * The async writes answer 202 even when the Engine is down: the queued job
     * owns the failure and sends the `*_failed` notification.
     */
    #[DataProvider('asyncWordpressRoutes')]
    public function test_an_async_wordpress_write_answers_202_even_when_the_engine_is_down(string $method, string $template): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139 (the CA waits for the websocket notification, not the HTTP body)
        $this->actingAs($user)
            ->json($method, $this->path($template, $application->id), $this->bodyFor($template))
            ->assertStatus(202);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function asyncWordpressRoutes(): array
    {
        return [
            'plugin update' => ['PUT', 'projects/{application}/wordpress/plugins/{plugin}/update'],
            'plugin install' => ['POST', 'projects/{application}/wordpress/plugins/new/{name}/install'],
            'theme update' => ['PUT', 'projects/{application}/wordpress/themes/{theme}/update'],
            'theme install' => ['POST', 'projects/{application}/wordpress/themes/new/{name}/install'],
            'core update' => ['PUT', 'projects/{application}/wordpress/update'],
        ];
    }

    #[DataProvider('screenshotWordpressRoutes')]
    public function test_the_theme_screenshot_answers_the_placeholder_when_the_engine_is_down(string $template): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:185 (the screenshot is an `<img>`; the CA renders whatever bytes arrive)
        $this->actingAs($user)
            ->get($this->path($template, $application->id))
            ->assertOk()
            ->assertHeader('Content-Type', 'image/gif');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function screenshotWordpressRoutes(): array
    {
        return [
            'projects' => ['projects/{application}/wordpress/themes/{theme}/screenshot'],
            'instances alias' => ['instances/{application}/wordpress/themes/{theme}/screenshot'],
        ];
    }

    public function test_the_matrix_provider_covers_every_registered_wordpress_route(): void
    {
        $registered = [];
        foreach (Route::getRoutes() as $route) {
            $name = (string) $route->getName();
            if (! str_starts_with($name, 'client-area.projects.wordpress.')
                && ! str_starts_with($name, 'client-area.instances.wordpress.')
            ) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $registered[] = $method.' '.$route->uri();
            }
        }

        $matrix = [];
        foreach (self::wordpressRoutes() as [$method, $template]) {
            $matrix[] = $method.' api/'.$template;
        }

        sort($registered);
        sort($matrix);
        $this->assertSame($registered, $matrix, 'A registered WordPress route is missing from the matrix provider (or vice versa).');
    }

    private function path(string $template, int $applicationId): string
    {
        return '/api/'.strtr($template, [
            '{application}' => (string) $applicationId,
            '{plugin}' => 'akismet',
            '{theme}' => 'twentytwentyfour',
            '{userId}' => '2',
            '{name}' => 'woocommerce',
            '{term}' => 'akismet',
            '{backupId}' => '5',
            '{itemId}' => '9',
        ]);
    }

    /**
     * The body the CA sends for each route family (the reads and the bodyless
     * mutations stay empty).
     *
     * @return array<string, mixed>
     */
    private function bodyFor(string $template): array
    {
        return match ($template) {
            'projects/{application}/wordpress/maintenance-mode',
            'projects/{application}/wordpress/debug-mode',
            'projects/{application}/wordpress/search-engine-indexing' => ['status' => true],
            // CA: packages/client-area/src/views/instance/advanced/AutoUpdates.vue:156-158
            'projects/{application}/wordpress/auto-update' => ['auto_update' => 1, 'auto_update_plugins' => 1, 'auto_update_themes' => 1],
            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121
            'projects/{application}/wordpress/config' => ['name' => 'WP_DEBUG', 'value' => 'true', 'type' => 'constant'],
            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199
            'projects/{application}/wordpress/config/{name}' => ['value' => 'true', 'type' => 'constant'],
            // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163
            'projects/{application}/wordpress/users' => ['username' => 'editor', 'email' => 'editor@example.com', 'display_name' => 'Editor', 'password' => 'Secret-Password1!', 'role' => 'editor'],
            // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274
            'projects/{application}/wordpress/users/{userId}' => ['email' => 'editor@example.com', 'display_name' => 'Editor', 'role' => 'editor'],
            // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
            'projects/{application}/wordpress/backups' => ['backupDirectory' => true, 'backupDatabase' => false, 'backupNote' => 'Before update'],
            // CA: packages/client-area/src/mixins/BackupActionsMixin.js:328
            'projects/{application}/wordpress/backups/{backupId}/restore' => ['restoreDirectory' => true, 'restoreDatabase' => true, 'deleteExistingFiles' => true],
            // CA: packages/client-area/src/router/fetchData.js:110
            'projects/{application}/wordpress/automatic-backup' => ['frequency' => 'never'],
            // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:272
            'projects/{application}/sso-url' => ['user' => 2],
            // CA: packages/client-area/src/apis/Instances.js:279
            'projects/{application}/wordpress/site-name' => ['name' => 'My Shop'],
            // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:139
            'projects/{application}/wordpress/update' => ['version' => '6.6'],
            // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
            'projects/{application}/secrets/reveal' => ['secret' => 'DB_PASSWORD'],
            default => [],
        };
    }
}
