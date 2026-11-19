<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * V1 is deployed as a PanelAlpha Engine `dockerfile` app, so the
 * repository root carries `.panelalpha/panelalpha.yaml`. The Engine reads
 * `.panelalpha/` only at the repository root (`core/app/Lib/Deploy/Platform/
 * AppConfig/AppConfigLocator.php:36-41`), where the config, the build-context
 * `.dockerignore` and the `Dockerfile` live. The dev container mounts only
 * `src/`, so src/docker-compose.yml mounts those three read-only next to it, and
 * `check-container-prod.sh` asserts they are there.
 *
 * The config must validate against the Engine's own schema, copied to
 * `tests/Feature/Docs/fixtures/engine-sources-schema.json` from
 * `core/resources/sources/_schema.json` (the ref is in the sibling `.ref` file,
 * so a drift test can re-copy it). It must also set every key the app reads at
 * runtime, and document - not commit - the per-install `env_vars`.
 *
 * @see .panelalpha/panelalpha.yaml
 * @see .panelalpha/files/.env
 * @see .panelalpha/overrides/docker-compose.override.yml
 */
final class PanelalphaConfigTest extends TestCase
{
    private function configYaml(): string
    {
        return (string) file_get_contents(base_path('../../.panelalpha/panelalpha.yaml'));
    }

    /**
     * A minimal YAML reader for the subset this file is written in: top-level
     * maps, two-space nested maps, scalars, no lists, no block scalars. It
     * fails on anything it does not understand, so it cannot silently pass.
     *
     * @return array<string, mixed>
     */
    private function parseYaml(string $yaml): array
    {
        $rows = [];
        foreach (preg_split('/\r?\n/', $yaml) ?: [] as $line) {
            if (trim($line) === '' || str_starts_with(ltrim($line), '#')) {
                continue;
            }
            $indent = strlen($line) - strlen(ltrim($line, ' '));
            $rows[] = ['indent' => $indent, 'text' => rtrim(substr($line, $indent))];
        }

        $i = 0;
        $parsed = $this->parseMap($rows, $i, 0);
        $this->assertSame(count($rows), $i, 'the YAML parser did not consume every line');

        return $parsed;
    }

    /**
     * @param  list<array{indent: int, text: string}>  $rows
     * @return array<string, mixed>
     */
    private function parseMap(array $rows, int &$i, int $indent): array
    {
        $map = [];
        while ($i < count($rows)) {
            $row = $rows[$i];
            if ($row['indent'] < $indent) {
                break;
            }
            $this->assertSame($indent, $row['indent'], "unexpected indentation: {$row['text']}");
            $this->assertSame(1, preg_match('/^([A-Za-z0-9_.-]+):(?: (.*))?$/', $row['text'], $m), "cannot parse line: {$row['text']}");
            $key = $m[1];
            $value = $m[2] ?? '';
            $i++;
            $map[$key] = $value === '' ? $this->parseMap($rows, $i, $indent + 2) : $this->parseScalar($value);
        }

        return $map;
    }

    private function parseScalar(string $value): string|int|bool|null
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        if ($value[0] === "'" && str_ends_with($value, "'")) {
            return str_replace("''", "'", substr($value, 1, -1));
        }
        if ($value[0] === '"' && str_ends_with($value, '"')) {
            return stripcslashes(substr($value, 1, -1));
        }
        if ($value === 'null' || $value === '~') {
            return null;
        }
        if ($value === 'true' || $value === 'false') {
            return $value === 'true';
        }

        return preg_match('/^-?\d+$/', $value) === 1 ? (int) $value : $value;
    }

    /**
     * @return array<string, mixed>
     */
    private function schema(): array
    {
        $raw = json_decode((string) file_get_contents(base_path('tests/Feature/Docs/fixtures/engine-sources-schema.json')), true);
        $this->assertIsArray($raw, 'the committed Engine schema fixture must be JSON');

        return $raw;
    }

    public function test_the_committed_schema_fixture_records_its_engine_source(): void
    {
        $ref = trim((string) file_get_contents(base_path('tests/Feature/Docs/fixtures/engine-sources-schema.ref')));

        $this->assertSame('core/resources/sources/_schema.json @ gitlab-develop-69a85eb07', $ref);
        $schema = $this->schema();
        $this->assertSame('https://panelalpha.com/schemas/app-config.json', $schema['$id'] ?? null);
    }

    public function test_the_app_config_validates_against_the_engine_sources_schema(): void
    {
        $schema = $this->schema();
        $properties = $schema['properties'] ?? null;
        $this->assertIsArray($properties);
        $config = $this->parseYaml($this->configYaml());

        // additionalProperties: false - every top-level key must be a schema key, except `domain`: the Engine's
        // AppConfig reads it since Engine 2.3.0 (`PublicRoutingReader::KEYS`), but its
        // core/resources/sources/_schema.json does not list it yet (the Engine never validates a project's file
        // against that schema; an Engine before 2.3.0 refuses the key).
        $readByAppConfigOnly = ['domain'];
        foreach (array_keys($config) as $key) {
            if (in_array($key, $readByAppConfigOnly, true)) {
                continue;
            }
            $this->assertArrayHasKey($key, $properties, "unknown app config key '{$key}' (additionalProperties: false)");
        }

        // The panel asks for the server's own name; the operator allows it (`pae system:public-routing:allow`).
        $this->assertSame('host', $config['domain'] ?? null);

        // The keys this file relies on, checked against the schema's own rules.
        $this->assertSame('dockerfile', $config['extends'] ?? null);
        $this->assertSame('panelalpha-single-server', $config['id'] ?? null);
        $this->assertSame('dockerfile', $config['strategy'] ?? null);
        $this->assertSame(80, $config['port'] ?? null);
        $this->assertIsInt($config['port'] ?? null);
        $this->assertGreaterThanOrEqual(1, $config['port']);
        $this->assertLessThanOrEqual(65535, $config['port']);

        $extra = $config['extra'] ?? null;
        $this->assertIsArray($extra);
        $this->assertSame('Dockerfile', $extra['dockerfile'] ?? null);
        $this->assertSame(80, $extra['port_hint'] ?? null);

        // The parser reads flow lists as their source text.
        $git = $config['git'] ?? null;
        $this->assertIsArray($git);
        // The image builds only the Client Area (panelalpha-frontend).
        $this->assertSame('[src/frontend/client-area]', $git['submodules'] ?? null);
        $this->assertSame('array', $schema['properties']['git']['anyOf'][0]['properties']['submodules']['type'] ?? null);

        $env = $config['env'] ?? null;
        $this->assertIsArray($env);
        foreach ($env as $key => $value) {
            $this->assertMatchesRegularExpression('/^[A-Za-z_][A-Za-z0-9_]*$/', (string) $key, 'the schema constrains env key names');
            $this->assertTrue(is_string($value) || is_int($value) || is_bool($value), "env {$key} must be a scalar");
        }

        $health = $config['health'] ?? null;
        $this->assertIsArray($health);
        $this->assertSame(300, $health['start_period'] ?? null);
    }

    public function test_every_runtime_key_is_set_or_documented_as_per_install(): void
    {
        $yaml = $this->configYaml();
        $config = $this->parseYaml($yaml);
        $env = $config['env'] ?? null;
        $this->assertIsArray($env);

        // Keys the app reads at runtime and that must not depend on the legacy
        // root `.env` (config/*.php through `env()`).
        foreach ([
            'APP_ENV', 'APP_DEBUG', 'APP_URL',
            'SESSION_DRIVER', 'SESSION_SAME_SITE', 'SESSION_SECURE_COOKIE',
            'SANCTUM_PREFIX', 'SANCTUM_STATEFUL_DOMAINS',
            'QUEUE_CONNECTION', 'CACHE_STORE', 'BROADCAST_CONNECTION', 'LOG_CHANNEL', 'LOG_STACK',
            'TRUSTED_FRONT_PROXIES',
            'REVERB_HOST', 'REVERB_PORT', 'REVERB_SCHEME',
            'REVERB_SERVER_HOST', 'REVERB_SERVER_PORT',
        ] as $key) {
            $this->assertArrayHasKey($key, $env, "env: must set {$key}");
            $this->assertTrue(is_string($env[$key]) || is_int($env[$key]), "env: {$key} must be a string or int");
        }

        // The Reverb app id, public key and signing secret are generated once
        // per install by the entrypoint and rendered into
        // backend/.env; the public key stays the CA's hardcoded Echo key
        // (src/frontend/client-area/src/shared/realtime/echo-client.ts `PUSHER_KEY`,
        // the legacy packages/client-area/src/apis/Auth.js:340). Never a committed env value.
        foreach (['REVERB_APP_ID', 'REVERB_APP_KEY', 'REVERB_APP_SECRET'] as $key) {
            $this->assertArrayNotHasKey($key, $env, "{$key} is generated per install, not a committed env: value");
        }
        $entrypoint = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertStringContainsString('reverb_app_secret', $entrypoint, 'the entrypoint must own the Reverb secret');
        $this->assertStringContainsString('Auth.js:340', $entrypoint, 'the entrypoint must keep the CA compatibility key documented');

        // Per-install values: documented in the file, never committed to `env:`.
        foreach (['PANELALPHA_ENGINE_URL', 'PANELALPHA_ENGINE_TOKEN', 'PANELALPHA_ENGINE_CA', 'PANELALPHA_USER_EMAIL', 'PANELALPHA_USER_PASSWORD', 'PANELALPHA_SELF_PROJECT'] as $key) {
            $this->assertStringContainsString($key, $yaml, "the per-install env_vars must document {$key}");
            $this->assertArrayNotHasKey($key, $env, "{$key} is per-install, not a committed env: value");
        }
    }

    public function test_the_generated_reverb_secrets_are_not_committed(): void
    {
        // The app id and signing secret live only on the data
        // volume (entrypoint.sh); a committed value would make every install
        // share one websocket signing secret. The public key is the Client
        // Area's committed compatibility constant (Auth.js:340), so it is not
        // checked here.
        foreach ([
            base_path('.env.example'),
            base_path('../../.panelalpha/panelalpha.yaml'),
            base_path('../../.panelalpha/files/.env'),
            base_path('../../.panelalpha/overrides/docker-compose.override.yml'),
        ] as $path) {
            $this->assertFileExists($path);
            $contents = (string) file_get_contents($path);
            $this->assertDoesNotMatchRegularExpression(
                '/^\s*REVERB_APP_(?:ID|SECRET)\s*=/m',
                $contents,
                "{$path} must not commit a Reverb app id or signing secret",
            );
        }
    }

    public function test_the_app_config_neutralises_the_legacy_env_and_pins_one_container(): void
    {
        $env = (string) file_get_contents(base_path('../../.panelalpha/files/.env'));
        // The old root .env.example must not leak its DB/Redis/Pusher keys.
        foreach (['DB_CONNECTION', 'REDIS_HOST', 'PUSHER_APP_SECRET', 'CACHE_DRIVER', 'QUEUE_CONNECTION'] as $legacy) {
            $this->assertStringNotContainsString($legacy, $env, "the neutralised .env must not carry {$legacy}");
        }

        $override = (string) file_get_contents(base_path('../../.panelalpha/overrides/docker-compose.override.yml'));
        $this->assertStringContainsString('app:', $override);
        $this->assertStringContainsString('container_name: panelalpha-single-server', $override);
    }

    /**
     * The Engine pulls `image:` instead of building the Dockerfile when the registry has it, so the
     * tag must be this version's: the release CI publishes ghcr.io/panelalpha/panel:v<version>.
     */
    public function test_the_override_names_this_versions_published_image(): void
    {
        $version = config('system.version');
        $this->assertIsString($version);
        $this->assertMatchesRegularExpression('/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/', $version);

        $override = (string) file_get_contents(base_path('../../.panelalpha/overrides/docker-compose.override.yml'));
        $this->assertStringContainsString("image: ghcr.io/panelalpha/panel:v{$version}\n", $override);
        $this->assertStringContainsString('pull_policy: missing', $override);
    }
}
