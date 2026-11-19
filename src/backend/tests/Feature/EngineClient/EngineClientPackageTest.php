<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\SingleEngineResolver;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The Engine client is its own package, `panelalpha/engine-client`
 * (`src/packages/engine-client`, namespace `PanelAlpha\EngineClient`).
 *
 * Contract: the package holds the connection, the client, the circuit breaker,
 * the `EngineProject` value, the 19 `Api` wrappers, the exceptions, the
 * `EngineResolver` contract and `SingleEngineResolver`; it requires Laravel only
 * and registers no provider. The host, the controller and legacy require it;
 * the controller keeps binding the single-Engine resolver. The client reads no
 * panel config: the host's connection carries the configured timeout.
 */
final class EngineClientPackageTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function packages(): string
    {
        return dirname(base_path()).'/packages';
    }

    /**
     * @return array<string, mixed>
     */
    private function composer(string $path): array
    {
        $decoded = json_decode((string) file_get_contents($path), true);
        $this->assertIsArray($decoded, "{$path} is not readable JSON.");

        /** @var array<string, mixed> $decoded */
        return $decoded;
    }

    public function test_the_engine_code_lives_in_the_package(): void
    {
        $src = $this->packages().'/engine-client/src';
        foreach (['EngineClient', 'EngineConnection', 'EngineHealth', 'EngineProject', 'SingleEngineResolver', 'Contracts/EngineResolver', 'Support/Payload'] as $file) {
            $this->assertFileExists("{$src}/{$file}.php");
        }
        // WordPressMigrationsApi (Engine 2.2.0) is the 20th; UploadsApi
        // and VaultApi (Engine 2.3.0 `project_source`) the 21st and 22nd;
        // TokensApi (the calling token) the 23rd.
        $this->assertCount(23, glob($src.'/Api/*Api.php') ?: []);
        $this->assertCount(6, glob($src.'/Exceptions/*Exception.php') ?: []);

        $this->assertDirectoryDoesNotExist($this->packages().'/client-area/src/Engine');
        $this->assertFileDoesNotExist($this->packages().'/client-area/src/Contracts/EngineResolver.php');
    }

    public function test_the_package_requires_laravel_only_and_registers_no_provider(): void
    {
        $composer = $this->composer($this->packages().'/engine-client/composer.json');

        $this->assertSame('panelalpha/engine-client', $composer['name']);
        $this->assertSame(['php', 'laravel/framework'], array_keys((array) $composer['require']));
        $this->assertSame(['psr-4' => ['PanelAlpha\\EngineClient\\' => 'src/']], $composer['autoload']);
        $this->assertArrayNotHasKey('extra', $composer);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function requirers(): array
    {
        return [
            'host' => ['backend/composer.json'],
            'controller' => ['packages/client-area/composer.json'],
        ];
    }

    #[DataProvider('requirers')]
    public function test_the_package_is_required_where_it_is_used(string $path): void
    {
        $composer = $this->composer(dirname(base_path()).'/'.$path);

        $this->assertArrayHasKey('panelalpha/engine-client', (array) $composer['require']);
    }

    public function test_the_lock_installs_the_package_from_its_path(): void
    {
        $lock = $this->composer(base_path('composer.lock'));
        $packages = array_values(array_filter(
            (array) $lock['packages'],
            static fn (mixed $package): bool => is_array($package) && ($package['name'] ?? null) === 'panelalpha/engine-client',
        ));

        $this->assertCount(1, $packages);
        $this->assertSame(['type' => 'path', 'url' => '../packages/engine-client'], array_intersect_key((array) $packages[0]['dist'], ['type' => 1, 'url' => 1]));
    }

    public function test_the_controller_binds_the_single_engine_resolver(): void
    {
        $this->assertInstanceOf(SingleEngineResolver::class, app(EngineResolver::class));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function oldNames(): array
    {
        $names = [];
        foreach (['EngineClient', 'EngineConnection', 'EngineHealth', 'EngineProject', 'SingleEngineResolver', 'Api\\ProjectsApi', 'Api\\McpApi', 'Exceptions\\EngineException', 'Exceptions\\EngineRequestException', 'Exceptions\\EngineValidationException', 'Exceptions\\ProjectProtectedException'] as $name) {
            $names[$name] = ['PanelAlpha\\ClientArea\\Engine\\'.$name];
        }
        $names['Contracts\\EngineResolver'] = ['PanelAlpha\\ClientArea\\Contracts\\EngineResolver'];
        $names['pre-P1 EngineClient'] = ['PanelAlpha\\UserApplication\\Engine\\EngineClient'];

        return $names;
    }

    /**
     * No queued payload, cache entry or session can hold one of these names
     * (every job carries ids and scalars, the breaker caches a timestamp), so no
     * alias keeps them loadable.
     */
    #[DataProvider('oldNames')]
    public function test_no_old_engine_name_resolves(string $old): void
    {
        $this->assertFalse(class_exists($old) || interface_exists($old), "{$old} must not resolve.");
    }

    public function test_the_host_connection_carries_the_configured_timeout(): void
    {
        $this->configureEngine();
        config(['client-area.engine_timeout' => 45]);

        $timeouts = [];
        Http::fake(function (Request $request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'] ?? null;

            // Engine: core/app/Http/Controllers/SystemController.php:51 -> info()
            return Http::response(['data' => []]);
        });

        $engine = app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID);
        $this->assertSame(45, $engine->connection()->timeout);
        $engine->get('system/info');
        $engine->withTimeout(100)->get('system/info');
        (new EngineClient(new EngineConnection(1, self::ENGINE, '1|test-token')))->get('system/info');

        $this->assertSame([45, 100, EngineClient::DEFAULT_TIMEOUT_SECONDS], $timeouts);
        $this->assertSame(30, EngineClient::DEFAULT_TIMEOUT_SECONDS);
    }
}
