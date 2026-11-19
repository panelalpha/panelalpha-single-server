<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\RouteCollection;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every route enforces *exactly* the privilege its old
 * counterpart had – no more, no less. Reads the old panel left open must stay
 * open, and reads that had one keep it.
 *
 * The expected map is generated from `packages/api/routes/api.php` through the
 * committed old→v1 path table (`OldRoutePrivileges`) – never curated here.
 */
class PrivilegeAssignmentTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /** Routes read once from a throw-away application by the data providers. */
    private static ?RouteCollection $providerRoutes = null;

    /**
     * One case per package route (method × uri): the old→v1 table entry, the
     * old privilege parsed from `packages/api/routes/api.php` and the privilege
     * on the registered route, so one mismatch cannot hide the rest.
     *
     * @return array<string, array{string, string|null, bool, string|null, string|null, bool}>
     */
    public static function packageRoutePrivileges(): array
    {
        $old = OldRoutePrivileges::OLD_PRIVILEGES;

        $cases = [];
        foreach (self::routerForProvider() as $route) {
            if (! self::isPackageRoute($route->getActionName())) {
                continue;
            }

            $privilege = null;
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'privilege:')) {
                    $privilege = substr($middleware, strlen('privilege:'));
                    break;
                }
            }

            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $key = $method.' '.$route->uri();
                // Service-level routes carry the privilege in the service, because
                // the route has no bound application;
                // test_service_level_writes_check_the_derived_application covers them.
                if (in_array($key, OldRoutePrivileges::SERVICE_LEVEL, true)) {
                    continue;
                }

                $oldKey = OldRoutePrivileges::V1_TO_OLD[$key] ?? null;
                $exists = $oldKey !== null && array_key_exists($oldKey, $old);

                $cases[$key] = [
                    $key,
                    $oldKey,
                    $exists,
                    $exists ? $old[$oldKey] : null,
                    $privilege,
                ];
            }
        }

        return $cases;
    }

    #[DataProvider('packageRoutePrivileges')]
    public function test_a_package_route_carries_the_old_panels_privilege(
        string $key,
        ?string $oldKey,
        bool $oldRouteExists,
        ?string $expected,
        ?string $privilege,
    ): void {
        // Routes the old panel never had carry the privilege listed with them.
        if (array_key_exists($key, OldRoutePrivileges::V1_ONLY)) {
            $this->assertNull($oldKey, "{$key} is in both V1_TO_OLD and V1_ONLY.");
            $this->assertSame(OldRoutePrivileges::V1_ONLY[$key], $privilege, "Wrong privilege on {$key}.");

            return;
        }

        $this->assertNotNull($oldKey, "{$key} is missing from the old→v1 path table.");

        // Old-panel bugs deliberately not copied.
        if (isset(OldRoutePrivileges::OLD_BUG_FIXES[$key])) {
            $this->assertSame(OldRoutePrivileges::OLD_BUG_FIXES[$key], $privilege, "Wrong privilege on {$key}.");

            return;
        }

        // Old routes declared in another old route file (the MCP transport,
        // packages/api/routes/mcp.php) carry the privilege listed with them.
        if (array_key_exists($key, OldRoutePrivileges::OLD_ROUTE_FILE_PRIVILEGES)) {
            $this->assertSame(OldRoutePrivileges::OLD_ROUTE_FILE_PRIVILEGES[$key], $privilege, "Wrong privilege on {$key}.");

            return;
        }

        $this->assertTrue($oldRouteExists, "{$oldKey} is not in packages/api/routes/api.php.");
        $this->assertSame($expected, $privilege, "Wrong privilege on {$key}.");
    }

    public function test_the_privilege_table_provider_covers_every_package_route(): void
    {
        $this->assertGreaterThan(100, count(self::packageRoutePrivileges()), 'Expected the generated check to cover every package route.');
    }

    // ---- Execution: the middleware answers before the controller ----------

    private function syncedApplication(): Application
    {
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserCollection
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
        ]);

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    public function test_denied_privileges_answer_403_before_the_engine_is_called(): void
    {
        $application = $this->syncedApplication();
        $this->denyAllPrivileges();
        $id = $application->id;

        // CA: src/views/instance/advanced/DeveloperSettings.vue:442
        $this->putJson("/api/server-accounts/{$id}/domains/site1.example.com/php-version", ['php_version' => '8.2'])->assertForbidden();
        // CA: src/views/hosting/Ftp.vue:379
        $this->postJson("/api/server-accounts/{$id}/ftp-accounts", ['user' => 'x', 'password' => 'y'])->assertForbidden();
        // CA: src/views/hosting/Databases.vue:712
        $this->postJson("/api/server-accounts/{$id}/mysql/databases", ['name' => 'x'])->assertForbidden();
        // CA: src/mixins/PluginsActionsMixin.js:161
        $this->putJson("/api/projects/{$id}/wordpress/plugins/akismet/activate")->assertForbidden();
        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->postJson("/api/projects/{$id}/redeploy")->assertForbidden();
        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->putJson("/api/projects/{$id}/change-domain/domain", ['domain' => 'site1.example.com'])->assertForbidden();
    }

    public function test_service_level_writes_check_the_derived_application(): void
    {
        $application = $this->syncedApplication();
        $service = VirtualService::ID;

        // POST /services/{id}/domains -> user-level service.create_instance.
        $this->denyPrivilege('service.create_instance');
        // CA: src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->postJson("/api/services/{$service}/domains", ['domain' => 'new.example.com'])->assertForbidden();

        // Proxy-rule create derives the owner from upstream_host.
        $this->denyPrivilege('hosting.manage_proxy_routing');
        // CA: src/apis/Hosting.js:62
        $this->postJson("/api/services/{$service}/proxy-rules", [
            'transport' => 'http',
            'listen_port' => 8080,
            'server_name' => 'site1.example.com',
            'username' => 'site1',
            'upstream_host' => 'site1',
            'upstream_port' => 80,
        ])->assertForbidden();

        // Container actions check the privilege on the account's application.
        $this->denyPrivilege('hosting.manage_containers');
        // CA: src/apis/Hosting.js:83
        $this->postJson("/api/services/{$service}/containers/{$application->id}/action", ['action' => 'restart'])->assertForbidden();
        // CA: src/apis/Hosting.js:83
        $this->postJson("/api/services/{$service}/containers/{$application->id}/c1/action", ['action' => 'restart'])->assertForbidden();
    }

    /**
     * Exhaustive, one case per route carrying `privilege:`: without *its own*
     * privilege each route answers 403 before the controller. The provider reads
     * the real router; deny-all would hide a wrong privilege name.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function privilegedRoutes(): array
    {
        $cases = [];
        foreach (self::routerForProvider() as $route) {
            if (! self::isPackageRoute($route->getActionName())) {
                continue;
            }

            $privilege = null;
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'privilege:')) {
                    $privilege = substr($middleware, strlen('privilege:'));
                    break;
                }
            }

            if ($privilege === null) {
                continue;
            }

            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $cases[$method.' /'.$route->uri()] = [$method, $route->uri(), $privilege];
            }
        }

        return $cases;
    }

    /**
     * The Client Area routes the exhaustive guards cover: the controller's own
     * and every route a legacy stream moved to `client-area-legacy` – the route list stays identical, so the privilege/403 coverage must
     * follow the controller FQCN to the legacy package.
     */
    private static function isPackageRoute(string $actionName): bool
    {
        return str_starts_with($actionName, 'PanelAlpha\\ClientArea')
            || str_starts_with($actionName, 'PanelAlpha\\ClientAreaLegacy');
    }

    /**
     * Boots the framework from a data provider and hands back the registered
     * routes. Data providers run while PHPUnit builds the suite, before it
     * installs its own error handler: booting the framework registers Laravel's
     * handler and would mark every later test as risky ("tested code removed
     * error handlers other than its own"). Flushing the framework
     * globals before returning keeps the handler stack clean, and the cache
     * keeps a second call (from a test body) from booting and flushing again.
     */
    private static function routerForProvider(): RouteCollection
    {
        if (self::$providerRoutes instanceof RouteCollection) {
            return self::$providerRoutes;
        }

        $app = (new static('route-provider'))->createApplication();
        self::$providerRoutes = $app->make('router')->getRoutes();

        HandleExceptions::flushState();

        return self::$providerRoutes;
    }

    public function test_the_privilege_provider_covers_every_privileged_route(): void
    {
        $this->assertGreaterThan(100, count(self::privilegedRoutes()), 'Expected every privileged route to be checked.');
    }

    #[DataProvider('privilegedRoutes')]
    public function test_a_privileged_route_answers_403_without_its_privilege(string $method, string $uriTemplate, string $privilege): void
    {
        $application = $this->syncedApplication();
        $user = User::query()->firstOrFail();
        $this->denyPrivilege($privilege);

        $uri = strtr($uriTemplate, [
            '{application}' => (string) $application->id,
            '{resourceSegment}' => 'instances',
            '{period}' => 'last-month',
            '{type}' => 'visitors',
            '{service}' => '1',
            // An Engine deploy id (the route's constraint).
            '{logId}' => '20261014-101500-a1b2c3',
        ]);
        $uri = preg_replace('/\{[^}]+\}/', (string) $application->id, $uri);

        $this->assertSame(
            403,
        // CA: src/apis/Instances.js:17
            $this->actingAs($user)->json($method, '/'.$uri)->status(),
            "{$method} /{$uri} ({$privilege}) did not answer 403.",
        );
    }

    public function test_reads_the_old_panel_left_open_stay_reachable_without_the_privilege(): void
    {
        $application = $this->syncedApplication();
        $this->denyAllPrivileges();
        $id = $application->id;

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> DomainCollection
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:40 -> MysqlUserCollection
            'engine.example.com/api/projects/site1/mysql/users' => Http::response(['data' => []]),
        ]);

        // CA: src/views/hosting/Ftp.vue:265
        $this->getJson("/api/server-accounts/{$id}/domains")->assertOk();
        // CA: src/views/hosting/Databases.vue:1534
        $this->getJson("/api/server-accounts/{$id}/mysql/users")->assertOk();
    }
}
