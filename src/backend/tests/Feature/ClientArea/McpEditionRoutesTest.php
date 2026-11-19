<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Connect AI works
 * per user in every edition – tokens minted per user, scoped to the user's
 * projects, `/mcp` forwarding only tokens the panel minted – so the controller
 * registers the MCP routes from `routes/mcp.php` in every mode. The host app,
 * legacy and any other route file (an edition's included) must not register
 * them: a second registration would bypass the per-user rules.
 *
 * The scan walks every route file in the repository instead of a curated list,
 * so a future edition that registers `/mcp-tokens` fails here. That the routes
 * exist in a multi-user edition is `SingleUserDefaultsTest`'s case.
 */
class McpEditionRoutesTest extends TestCase
{
    private const ROUTE_NAMES = [
        'mcp.tokens.index',
        'mcp.tokens.store',
        'mcp.tokens.revoke',
        'mcp.tokens.destroy',
        'mcp.activity_logs.index',
        'mcp.handle',
        'mcp.check',
    ];

    public function test_the_controller_registers_the_mcp_routes(): void
    {
        foreach (self::ROUTE_NAMES as $name) {
            $this->assertTrue(Route::has($name), "The controller must register {$name}.");
        }
    }

    public function test_only_the_controller_route_file_registers_the_mcp_routes(): void
    {
        $communityRouteFile = base_path('../packages/client-area/routes/mcp.php');

        // The provider loads it – the routes are not defined anywhere else.
        $provider = (string) file_get_contents(base_path('../packages/client-area/src/ClientAreaServiceProvider.php'));
        $this->assertStringContainsString('routes/mcp.php', $provider);

        $sources = [];
        foreach ($this->routeFiles(base_path('routes')) as $file) {
            $sources[$this->relative($file)] = (string) file_get_contents($file);
        }
        // Only each package's `routes/` directory declares routes; the
        // controller/request docblocks name paths without registering them.
        foreach (glob(base_path('../packages').'/*/routes/*.php') ?: [] as $file) {
            $sources[$this->relative($file)] = (string) file_get_contents($file);
        }

        $offenders = self::offendersIn($sources, $this->relative($communityRouteFile));

        $this->assertSame([], $offenders, "Only the controller's routes/mcp.php may register the MCP routes:\n".implode("\n", $offenders));

        // And the controller's route file itself defines all seven paths.
        $free = (string) file_get_contents($communityRouteFile);
        foreach (['/mcp-tokens', '/mcp-activity-logs', "'/mcp'", "'/mcp/check'"] as $path) {
            $this->assertStringContainsString($path, $free);
        }
    }

    public function test_the_confinement_scan_catches_a_bypass(): void
    {
        $sources = [
            'packages/api/routes/api.php' => "Route::get('/mcp-tokens', [X::class, 'index']);",
            'packages/edition-pro/routes/mcp.php' => "Route::post('/mcp', [X::class, 'handle']);",
            'packages/edition-multi/routes/mcp.php' => "Route::get('/mcp/check', [X::class, 'check']);",
            'packages/client-area/routes/mcp.php' => "Route::get('/mcp-tokens', [X::class, 'index']);\nRoute::post('/mcp', [X::class, 'handle']);",
        ];

        $this->assertSame(
            ['packages/api/routes/api.php', 'packages/edition-pro/routes/mcp.php', 'packages/edition-multi/routes/mcp.php'],
            self::offendersIn($sources, 'packages/client-area/routes/mcp.php'),
        );
    }

    /**
     * Route files that name an MCP route besides the controller's `routes/mcp.php`.
     *
     * @param  array<string, string>  $sources  relative path => file contents
     * @return list<string>
     */
    private static function offendersIn(array $sources, string $communityRouteFile): array
    {
        $offenders = [];
        foreach ($sources as $file => $source) {
            if ($file === $communityRouteFile) {
                continue;
            }
            if (preg_match('~(mcp-tokens|mcp-activity-logs|["\']/mcp(?:/check)?["\'])~', $source) === 1) {
                $offenders[] = $file;
            }
        }

        return $offenders;
    }

    /**
     * Every PHP file under a route directory.
     *
     * @return list<string>
     */
    private function routeFiles(string $root): array
    {
        if (! is_dir($root)) {
            return [];
        }

        $files = [];
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root)) as $file) {
            if ($file instanceof \SplFileInfo && $file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
        sort($files);

        return $files;
    }

    private function relative(string $file): string
    {
        return str_replace(base_path('../').'/', '', $file);
    }
}
