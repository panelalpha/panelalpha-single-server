<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use PanelAlpha\ClientArea\ClientAreaServiceProvider;
use PanelAlpha\ClientAreaLegacy\ClientAreaLegacyServiceProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The pre-split `user-application` names are gone from config and
 * translations.
 *
 * - The controller's settings are the `client-area` config key, published under
 *   `client-area-config`; the panel-only retention keys moved to
 *   client-area-legacy's `client-area-legacy` key, published under
 *   `client-area-legacy-config`, until they left with their tables: legacy has
 *   no config key and no publish tag left.
 * - The controller's translations are the `client-area::` namespace (the
 *   legacy notification texts were `client-area-legacy::` for a while, then
 *   moved back into the controller's `client-area::notifications`).
 * - The env names operators set keep their `USER_APPLICATION_*` spelling.
 *
 * Route names `user-application.*` became
 * `client-area.*` (controller and host routes) and `client-area-legacy.*` (the
 * legacy route files); method, URI and middleware are unchanged
 * (`RouteParityTest`). A source guard keeps every old config, route and
 * translation key shape out of v1; the `user-application:` cache and lock key
 * prefixes are stored runtime names and stay.
 */
class ClientAreaNamesTest extends TestCase
{
    /**
     * An old config, route or translation key: `user-application.` (a config
     * key or route name), `user-application::` (a translation), the quoted
     * root key or namespace, and the publish tag. A `user-application:` cache
     * key prefix and the `PanelAlpha\UserApplication` alias names are not keys.
     */
    private const OLD_KEY = '/user-application(?:\.|::|-config\b|[\'"])/';

    /**
     * Paths under `src/` the guard does not scan: dependencies and runtime data,
     * the append-only review history, the plan kept as history, and this
     * test's own fixtures.
     */
    private const EXCLUDED = [
        'admin-area',
        'backend/bootstrap/cache',
        'backend/node_modules',
        'backend/tests/Feature/ClientArea/ClientAreaNamesTest.php',
        'backend/vendor',
        'data',
        'frontend',
    ];

    private const CONTROLLER_KEYS = [
        'activity_retention_days',
        'engine_timeout',
        // Moved from `client-area-legacy` with the git log.
        'git_operation_retention_days',
        'mcp_url',
        'route_middleware',
        'screenshot_disk',
        'self_project',
        'subdomains_blacklist',
        'sync_ttl',
        'upload_max_bytes',
        'users_table',
    ];

    public function test_the_controller_config_is_the_client_area_key(): void
    {
        $config = config('client-area');
        $this->assertIsArray($config);
        $keys = array_keys($config);
        sort($keys);

        $this->assertSame(self::CONTROLLER_KEYS, $keys);
        $this->assertNull(config('user-application'));
        // The activity log's retention moved with it, and the git operation
        // log's too.
        $this->assertSame(90, config('client-area.activity_retention_days'));
        $this->assertSame(30, config('client-area.git_operation_retention_days'));
    }

    /**
     * The legacy retention keys (`deploy_log_keep`,
     * `git_operation_retention_days`) left with their tables, so legacy has no config key left.
     */
    public function test_legacy_has_no_config_key_left(): void
    {
        $this->assertNull(config('client-area-legacy'));
        $this->assertFileDoesNotExist(base_path('../packages/client-area-legacy/config/client-area-legacy.php'));
    }

    /**
     * Notifications are a host table, so their retention is host
     * config (`config/notifications.php`) with the same env name and default.
     */
    public function test_the_notifications_retention_is_host_config(): void
    {
        $this->assertSame(['retention_days'], array_keys((array) config('notifications')));
        $this->assertSame(90, config('notifications.retention_days'));
        $this->assertNull(config('client-area-legacy.notifications_retention_days'));
    }

    public function test_the_publish_tags_follow_the_config_keys(): void
    {
        $controller = ServiceProvider::pathsToPublish(ClientAreaServiceProvider::class, 'client-area-config');
        $this->assertSame([config_path('client-area.php')], array_values($controller));
        $this->assertSame('client-area.php', basename((string) array_key_first($controller)));

        // Legacy publishes no config.
        $this->assertSame([], ServiceProvider::pathsToPublish(ClientAreaLegacyServiceProvider::class, 'client-area-legacy-config'));
        $this->assertNotContains('client-area-legacy-config', ServiceProvider::publishableGroups());

        $this->assertNotContains('user-application-config', ServiceProvider::publishableGroups());
    }

    public function test_the_controller_translations_are_the_client_area_namespace(): void
    {
        $this->assertSame('Self Signed', trans('client-area::general.self_signed'));
        // The CA notification texts are controller translations;
        // legacy has none left.
        $this->assertSame('Redeployment of Site finished.', trans('client-area::notifications.user.instance.redeploy_finished', ['name' => 'Site']));

        $namespaces = app('translator')->getLoader()->namespaces();
        $this->assertArrayHasKey('client-area', $namespaces);
        $this->assertArrayNotHasKey('client-area-legacy', $namespaces);
        $this->assertArrayNotHasKey('user-application', $namespaces);
    }

    /**
     * Every env-backed key with the env name operators set. The
     * file is relative to `src/backend` (one of them is a host file).
     *
     * @return array<string, array{string, string, string, string, int|string}>
     */
    public static function envNames(): array
    {
        $controller = '../packages/client-area/config/client-area.php';
        $host = 'config/notifications.php';

        return [
            'sync_ttl' => [$controller, 'sync_ttl', 'USER_APPLICATION_SYNC_TTL', '7', 7],
            'self_project' => [$controller, 'self_project', 'PANELALPHA_SELF_PROJECT', 'panel', 'panel'],
            'mcp_url' => [$controller, 'mcp_url', 'PANELALPHA_MCP_URL', 'https://mcp.example.com', 'https://mcp.example.com'],
            'engine_timeout' => [$controller, 'engine_timeout', 'ENGINE_HTTP_TIMEOUT', '45', 45],
            'users_table' => [$controller, 'users_table', 'USER_APPLICATION_USERS_TABLE', 'members', 'members'],
            'screenshot_disk' => [$controller, 'screenshot_disk', 'USER_APPLICATION_SCREENSHOT_DISK', 's3', 's3'],
            'upload_max_bytes' => [$controller, 'upload_max_bytes', 'USER_APPLICATION_UPLOAD_MAX_BYTES', '1024', 1024],
            'activity_retention_days' => [$controller, 'activity_retention_days', 'USER_APPLICATION_ACTIVITY_RETENTION_DAYS', '11', 11],
            'notifications_retention_days' => [$host, 'retention_days', 'USER_APPLICATION_NOTIFICATIONS_RETENTION_DAYS', '12', 12],
            'git_operation_retention_days' => [$controller, 'git_operation_retention_days', 'USER_APPLICATION_GIT_OPERATION_RETENTION_DAYS', '13', 13],
        ];
    }

    #[DataProvider('envNames')]
    public function test_the_operator_env_names_keep_feeding_the_config(string $file, string $key, string $env, string $value, int|string $expected): void
    {
        $_SERVER[$env] = $value;

        try {
            /** @var array<string, mixed> $config */
            $config = require base_path($file);
        } finally {
            unset($_SERVER[$env]);
        }

        $this->assertSame($expected, $config[$key]);
    }

    public function test_every_route_is_named_after_the_package_that_registers_it(): void
    {
        $controller = 0;
        $legacy = 0;
        $wrong = [];
        foreach (Route::getRoutes() as $route) {
            $name = (string) $route->getName();
            $legacyAction = str_starts_with($route->getActionName(), 'PanelAlpha\\ClientAreaLegacy\\');
            if (str_starts_with($name, 'client-area-legacy.')) {
                $legacy++;
                if (! $legacyAction) {
                    $wrong[] = $name;
                }
            } elseif (str_starts_with($name, 'client-area.')) {
                $controller++;
                if ($legacyAction) {
                    $wrong[] = $name;
                }
            } elseif ($legacyAction || str_starts_with($name, 'user-application.')) {
                $wrong[] = $name.' '.$route->uri();
            }
        }

        $this->assertSame([], $wrong, 'A route is not named after the package that registers it.');
        $this->assertGreaterThan(0, $controller);
        // The last legacy routes (the onboarding catalog, the domain probes,
        // the git history and the auto-deploy toggle) have moved into the
        // controller; the rule above still names any route legacy adds.
        $this->assertSame(0, $legacy);
    }

    /**
     * One literal per owner, so the prefixes themselves are pinned.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function pinnedRouteNames(): array
    {
        return [
            'controller' => ['client-area.projects.index', 'GET', 'api/projects'],
            // The host's `client-area.projects.collaboration_link`, then for a
            // while legacy's (`client-area-legacy.…`); now back under the
            // controller's name.
            'controller collaboration link' => ['client-area.projects.collaboration_link', 'GET', 'api/projects/{application}/collaboration-link'],
            // The deploy history was the legacy example until it moved into the
            // controller (read from the Engine).
            'controller deploy logs' => ['client-area.projects.deploy_logs.index', 'GET', 'api/projects/{application}/deploy-logs'],
            // The git operation log was the legacy example until it moved into
            // the controller.
            'controller git logs' => ['client-area.projects.git.logs', 'GET', 'api/projects/{application}/git/logs'],
            // The domain probe was the legacy probe example until it moved into
            // the controller.
            'controller probe' => ['client-area.hosting.services.domains.resolve', 'GET', 'api/services/{service}/domains/resolve'],
        ];
    }

    #[DataProvider('pinnedRouteNames')]
    public function test_a_route_answers_to_its_new_name(string $name, string $method, string $uri): void
    {
        $route = Route::getRoutes()->getByName($name);

        $this->assertNotNull($route, $name.' is not registered');
        $this->assertContains($method, $route->methods());
        $this->assertSame($uri, $route->uri());
    }

    /**
     * @return array<string, array{string}>
     */
    public static function oldKeyShapes(): array
    {
        return [
            'config read' => ["config('user-application.sync_ttl')"],
            'config set' => ["config(['user-application.sync_ttl' => 0])"],
            'route name' => ["->name('user-application.projects.index')"],
            'route prefix check' => ["str_starts_with(\$name, 'user-application.')"],
            'translation' => ["trans('user-application::general.self_signed')"],
            'root key' => ["\$this->mergeConfigFrom(\$path, 'user-application');"],
            'double-quoted root key' => ['config("user-application")'],
            'publish tag' => ["], 'user-application-config');"],
            'doc mention' => ['`user-application.route_middleware`'],
        ];
    }

    #[DataProvider('oldKeyShapes')]
    public function test_the_guard_pattern_catches_every_old_key_shape(string $line): void
    {
        $this->assertSame(1, preg_match(self::OLD_KEY, $line));
    }

    public function test_the_guard_pattern_leaves_stored_runtime_names_alone(): void
    {
        $this->assertSame(0, preg_match(self::OLD_KEY, "return 'user-application:sync-engines';"));
        $this->assertSame(0, preg_match(self::OLD_KEY, 'return "user-application:engine:{$engineId}:synced-at";'));
        $this->assertSame(0, preg_match(self::OLD_KEY, " * `panelalpha/user-application` (namespace `PanelAlpha\\UserApplication`)."));
        $this->assertSame(0, preg_match(self::OLD_KEY, "'PanelAlpha\\UserApplication\\Models\\Application'"));
    }

    public function test_no_v1_file_uses_an_old_config_route_or_translation_key(): void
    {
        $root = realpath(base_path('..'));
        $this->assertIsString($root);

        $this->assertSame([
            'admin-area',
            'backend/bootstrap/cache',
            'backend/node_modules',
            'backend/tests/Feature/ClientArea/ClientAreaNamesTest.php',
            'backend/vendor',
            'data',
            'frontend',
        ], self::EXCLUDED);

        $files = new \RecursiveIteratorIterator(new \RecursiveCallbackFilterIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
            static function (\SplFileInfo $file) use ($root): bool {
                $relative = substr($file->getPathname(), strlen($root) + 1);

                return ! $file->isLink() && ! in_array($relative, self::EXCLUDED, true);
            },
        ));

        $offenders = [];
        $scanned = 0;
        foreach ($files as $file) {
            /** @var \SplFileInfo $file */
            $name = $file->getFilename();
            if ($name !== 'Dockerfile' && ! in_array($file->getExtension(), ['php', 'md', 'json', 'xml', 'yaml', 'yml', 'neon', 'sh', 'js', 'conf'], true)) {
                continue;
            }
            $scanned++;
            foreach (file($file->getPathname()) ?: [] as $number => $line) {
                if (preg_match(self::OLD_KEY, $line) === 1) {
                    $offenders[] = substr($file->getPathname(), strlen($root) + 1).':'.($number + 1);
                }
            }
        }

        $this->assertGreaterThan(500, $scanned);
        $this->assertSame([], $offenders, 'An old `user-application` config, route or translation key is still used.');
    }
}
