<?php

namespace Tests\Feature\ClientArea;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\TestCase;

/**
 * The Engine connection pins a CA certificate and TLS verification
 * is never switched off.
 *
 * Contract:
 * - `settings:set engine-api-ca "<PEM>"` (or `--from-file=…`) stores the PEM; an
 *   invalid one is a console error (there is no HTTP settings route).
 * - `AppServiceProvider` carries the setting on `EngineConnection`.
 * - `EngineClient` passes Guzzle `verify` = the path of a private copy of the PEM
 *   for the plain client, the streamed download, the multipart upload and the
 *   MCP proxy, and `true` (the system CA store) when none is pinned. There is no
 *   `verify => false`.
 *
 * The fake transport records the `verify` option, standing in for the TLS
 * handshake the item allows (a self-signed server would need a real socket).
 */
class EngineTlsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function client(?string $ca = null): EngineClient
    {
        return new EngineClient(new EngineConnection(1, 'https://engine.example.com/api', '1|test-token', $ca));
    }

    /**
     * A valid self-signed certificate (`openssl req -x509 -newkey rsa:2048 …`).
     */
    private function pem(): string
    {
        return <<<'PEM'
-----BEGIN CERTIFICATE-----
MIIC+jCCAeKgAwIBAgIUDKnDlG73AFCuhJs7CJoH9T34pEUwDQYJKoZIhvcNAQEL
BQAwHTEbMBkGA1UEAwwSZW5naW5lLmV4YW1wbGUuY29tMB4XDTI2MTAxMjEyMDUw
N1oXDTM2MTAwOTEyMDUwN1owHTEbMBkGA1UEAwwSZW5naW5lLmV4YW1wbGUuY29t
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArzKVC26t0KkbXR3lO/GV
AhVnbV5bUHjjiktMlsImvaAeaHOgDdUQFksEsCL/LB9FffehtgkzNY8WoKzNhps6
QHFfR/FHvKR9KYXB2Adt7KujUmZdJhv4tN8y8BWGYOdoVZggjOHFqg4Lv3RofFOP
X0jkapNCIFrS9QhVWmXxqsDg9joLq0GhCf23JnvLcc6ytKkjt7zZQY/Bm3eigmPM
ihGOCYR5B+h83VG/t4Ik+8Q4d5em6dJJSSUzLiwtIQJnQCSUIYD+zqpsozKyEmGl
H0yO0zrALO5+KBRvCFHzrywtoEZSIR5bh+bTnS/WVMao16FyWwISxUHlbUXLCNak
TQIDAQABozIwMDAdBgNVHQ4EFgQUolS1M1uqMAzEFZfCrzMukFsqpjQwDwYDVR0T
AQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAULfe7WxV43EcpWCM17AjkUUP
kDA4C5T3oGDgVTNQkSis5EIB49diLtI6q1z8oJ/I6+aRTw3zs3jG1rhsD3yWskzn
Do79d4xvk8/jugmZhRkmj5M0llpC2tKharVserzj+KZXa4lM9JZA1kYXxNWXzbNH
Cscuyb+IGXZed3zSNayX7qY9brS+Mn748ZE0WNtVxFaM7iC4oW7/e3TUo63mVM8I
niW42HzdD/OrJ4Xo2JzGFkfw2AFYGlWECP7abSmFrxdjocpWKqYtyjqI6RHcg1SU
X+XHoA5TAp7NeZUXPqUamLpaaaJZPRKX1WdEYYe9KekMklTRIDYPNNJzfq1prw==
-----END CERTIFICATE-----
PEM;
    }

    private function caPath(): string
    {
        return storage_path('app/private/engine-ca/engine-1.pem');
    }

    public function test_a_pinned_ca_is_written_and_used_as_the_verify_option(): void
    {
        $captured = null;
        Http::fake(function ($request, $options) use (&$captured) {
            $captured = $options['verify'] ?? null;

            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            return Http::response(['data' => []]);
        });

        $this->client($this->pem())->get('projects/all');

        $this->assertSame($this->caPath(), $captured);
        $this->assertSame($this->pem(), (string) file_get_contents($this->caPath()));
        // The pinned certificate is private, not world-readable.
        $this->assertSame(0600, fileperms($this->caPath()) & 0777);
    }

    public function test_without_a_pin_the_system_store_is_used(): void
    {
        $captured = null;
        Http::fake(function ($request, $options) use (&$captured) {
            $captured = $options['verify'] ?? null;

            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            return Http::response(['data' => []]);
        });

        $this->client()->get('projects/all');

        // `true` is the system CA store: the self-signed Engine certificate is
        // refused until the pin is set.
        $this->assertTrue($captured);
    }

    public function test_every_engine_call_honours_the_pinned_ca(): void
    {
        $captured = [];
        Http::fake(function ($request, $options) use (&$captured) {
            $captured[] = $options['verify'] ?? null;

            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            return Http::response(['data' => []]);
        });

        $client = $this->client($this->pem());
        $client->get('projects/all');
        $client->download('projects/site1/files/download', ['path' => 'x'], function ($stream, $response): void {});
        $client->upload('projects/site1/files/upload', ['path' => 'x'], ['contents' => 'a', 'filename' => 'a.txt']);
        $client->proxy('POST', 'https://engine.example.com/mcp', 'mcp-token');

        $this->assertCount(4, $captured);
        foreach ($captured as $verify) {
            $this->assertSame($this->caPath(), $verify);
        }
    }

    public function test_settings_set_stores_a_pem_from_an_argument(): void
    {
        $this->artisan('settings:set', ['name' => 'engine-api-ca', 'value' => $this->pem()])
            ->assertSuccessful();

        $this->assertSame($this->pem(), Setting::get('engine-api-ca'));
    }

    public function test_settings_set_reads_the_pem_from_a_file(): void
    {
        $path = sys_get_temp_dir().'/panelalpha-ca-'.bin2hex(random_bytes(6)).'.pem';
        file_put_contents($path, $this->pem());

        try {
            $this->artisan('settings:set', ['name' => 'engine-api-ca', '--from-file' => $path])
                ->assertSuccessful();
        } finally {
            unlink($path);
        }

        $this->assertSame($this->pem(), Setting::get('engine-api-ca'));
    }

    public function test_settings_set_rejects_an_invalid_pem(): void
    {
        $this->artisan('settings:set', ['name' => 'engine-api-ca', 'value' => 'not-a-certificate'])
            ->expectsOutput('The engine-api-ca value must be a PEM certificate.')
            ->assertFailed();

        $this->assertNull(Setting::get('engine-api-ca'));
    }

    public function test_the_engine_connection_carries_the_pinned_ca(): void
    {
        $this->configureEngine();
        Setting::set('engine-api-ca', $this->pem());

        $this->assertSame($this->pem(), app(EngineConnection::class)->caCertificate);
    }

    public function test_an_empty_pin_falls_back_to_the_system_store(): void
    {
        $this->configureEngine();
        Setting::set('engine-api-ca', '');

        $this->assertNull(app(EngineConnection::class)->caCertificate);
    }

    /**
     * The domain reachability probe moved from client-area-legacy
     * into the controller's `src/`. It is no Engine call: an HTTPS GET to the
     * user's own domain pinned to the project IP that only checks the domain
     * answers, with the old panel's `verify=false` (old `DomainController::resolve`).
     *
     * @var array<string, string>
     */
    private const NOT_ENGINE_CALLS = [
        'Hosting/SslProbe.php' => 'the pinned reachability probe of a user domain, not an Engine call',
    ];

    public function test_the_exempt_files_make_no_engine_call(): void
    {
        foreach (array_keys(self::NOT_ENGINE_CALLS) as $file) {
            $source = (string) file_get_contents(base_path('../packages/client-area/src/'.$file));
            $this->assertStringNotContainsString('EngineClient', $source, $file.' must not reach the Engine');
            $this->assertStringNotContainsString('EngineResolver', $source, $file.' must not reach the Engine');
        }
    }

    public function test_no_engine_code_path_disables_tls_verification(): void
    {
        $offenders = [];
        foreach ($this->engineSources() as $path => $source) {
            $exempt = false;
            foreach (array_keys(self::NOT_ENGINE_CALLS) as $file) {
                $exempt = $exempt || str_ends_with(str_replace('\\', '/', $path), '/client-area/src/'.$file);
            }
            if (! $exempt && $this->disablesTlsVerification($source)) {
                $offenders[] = $path;
            }
        }

        $this->assertSame([], $offenders, 'Engine calls must verify TLS against the pinned CA or the system store, never verify=false.');
    }

    public function test_the_tls_scan_catches_a_disabled_verification_fixture(): void
    {
        $this->assertTrue($this->disablesTlsVerification('<?php $request->withoutVerifying();'));
        $this->assertTrue($this->disablesTlsVerification("<?php \$request->withOptions(['verify' => false]);"));
        $this->assertTrue($this->disablesTlsVerification('<?php $request->withOptions(["verify" => FALSE]);'));
        $this->assertFalse($this->disablesTlsVerification("<?php \$request->withOptions(['verify' => true]);"));
    }

    /**
     * @return array<string, string> path => source
     */
    private function engineSources(): array
    {
        $sources = [];
        // The whole Engine client package and the whole controller `src/`: the
        // Community provisioner and the MCP proxy call the Engine from
        // `src/Provisioning` and `src/Http`.
        foreach ([base_path('../packages/engine-client/src'), base_path('../packages/client-area/src'), base_path('app')] as $directory) {
            foreach (File::allFiles($directory) as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }
                $sources[$file->getPathname()] = (string) file_get_contents($file->getPathname());
            }
        }

        return $sources;
    }

    private function disablesTlsVerification(string $source): bool
    {
        if (preg_match('~\bwithoutVerifying\s*\(~', $source) === 1) {
            return true;
        }

        return preg_match('~[\'"]verify[\'"]\s*=>\s*false~i', $source) === 1;
    }
}
