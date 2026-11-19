<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The entrypoint has to run the container as an Engine app -
 * a persisted APP_KEY on the `/app/data` volume, Engine
 * credentials written into the settings table (followed at every
 * start while the env var is present), the single Community
 * user created only on an empty database, and the runtime configuration of the
 * app config's `env:` block rendered into `backend/.env` so php-fpm (which runs
 * with `clear_env = yes`) serves the CA's stateful session
 * (`packages/client-area/src/apis/Api.js:14-15`). Each block is executed on its
 * own against a temp root with a stub `php`, so the generated files and the
 * calls are asserted rather than the script text.
 *
 * @see src/entrypoint.sh
 * @see .panelalpha/panelalpha.yaml the app config whose `env:` block
 *      is the runtime configuration the renderer must cover.
 */
final class EngineRuntimeBootstrapTest extends TestCase
{
    private function fragment(string $start, string $end): string
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/'.preg_quote($start, '/').'(.*?)'.preg_quote($end, '/').'/s', $script, $matches),
            "entrypoint.sh must keep the {$start} markers for this test",
        );

        return $matches[1];
    }

    /**
     * @param  array<string, string>  $env
     * @param  array<string, string>  $files  path relative to the temp root => contents
     * @return array{code: int, output: string, root: string, data: string, backend: string, calls: string}
     */
    private function runFragment(string $block, array $env = [], array $files = [], ?string $root = null): array
    {
        $root = $root ?? sys_get_temp_dir().'/panelalpha-engrun-'.bin2hex(random_bytes(6));
        $data = $root.'/data';
        $backend = $root.'/backend';
        $bin = $root.'/bin';
        foreach ([$data, $backend, $bin] as $dir) {
            if (! is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
        }
        $calls = $root.'/calls.log';

        // The real entrypoint ensures backend/.env before this block; tests can
        // override it through $files.
        file_put_contents($backend.'/.env', "APP_KEY=\nAPP_NAME=PanelAlpha\n");
        foreach ($files as $relative => $contents) {
            $path = $root.'/'.$relative;
            if (! is_dir(dirname($path))) {
                mkdir(dirname($path), 0777, true);
            }
            file_put_contents($path, $contents);
        }

        file_put_contents($bin.'/php', <<<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$PANELALPHA_TEST_CALLS"
if [[ "$1" == "artisan" && "$2" == "hub:claim-install-code" ]]; then
    cat > "$PANELALPHA_TEST_CALLS.stdin"
    exit "${PANELALPHA_TEST_HUB_EXIT:-0}"
fi
if [[ "$1" == "artisan" && "$2" == "users:list" ]]; then
    printf '%s\n' "${PANELALPHA_TEST_USERS_LIST:-No users.}"
fi
if [[ "$1" == "artisan" && "$2" == "users:create" ]]; then
    printf '%s' "${PANELALPHA_TEST_USERS_CREATE_OUTPUT:-}"
    exit "${PANELALPHA_TEST_PHP_EXIT:-0}"
fi
if [[ "$1" == "artisan" && "$2" == "settings:get" ]]; then
    case "$3" in
        engine-api-url) value="${PANELALPHA_TEST_SETTING_ENGINE_URL:-}" ;;
        engine-api-token) value="${PANELALPHA_TEST_SETTING_ENGINE_TOKEN:-}" ;;
        engine-api-ca) value="${PANELALPHA_TEST_SETTING_ENGINE_CA:-}" ;;
        *) value="" ;;
    esac
    # Mirror the real `settings:get`: a missing key prints the message on
    # stdout and exits non-zero, so the entrypoint must key on the exit code.
    if [[ -z "$value" ]]; then
        printf 'Setting not found: %s\n' "$3"
        exit 1
    fi
    printf '%s' "$value"
    exit 0
fi
if [[ "$1" == "artisan" && "$2" == "settings:set" && "$3" == "engine-api-ca" ]]; then
    exit "${PANELALPHA_TEST_CA_EXIT:-0}"
fi
exit "${PANELALPHA_TEST_PHP_EXIT:-0}"
SH);
        chmod($bin.'/php', 0755);

        $script = $root.'/fragment.sh';
        file_put_contents($script, "#!/bin/bash\nset -e\n".$block);

        $inherited = getenv();
        $inherited = is_array($inherited) ? $inherited : [];
        $environment = array_merge($inherited, [
            'PATH' => $bin.':'.($inherited['PATH'] ?? ''),
            'PANELALPHA_TEST_CALLS' => $calls,
            'PANELALPHA_DATA_ROOT' => $data,
            'PANELALPHA_BACKEND_ROOT' => $backend,
        ], $env);

        $pipes = [];
        $process = proc_open(['bash', $script], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $environment);
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [
            'code' => proc_close($process),
            'output' => $stdout.$stderr,
            'root' => $root,
            'data' => $data,
            'backend' => $backend,
            'calls' => is_file($calls) ? (string) file_get_contents($calls) : '',
        ];
    }

    private function appKeyBlock(): string
    {
        return $this->fragment('# --- persisted app key: start ---', '# --- persisted app key: end ---');
    }

    private function credentialsBlock(): string
    {
        return $this->fragment('# --- engine credentials: start ---', '# --- engine credentials: end ---');
    }

    private function firstUserBlock(): string
    {
        return $this->fragment('# --- first user: start ---', '# --- first user: end ---');
    }

    /**
     * @return array<string, string>
     */
    private function failedFirstUserMarker(): array
    {
        return ['data/laravel/first-user-creation-failed' => ''];
    }

    /**
     * @param  array{data: string}  $run
     */
    private function markerPath(array $run): string
    {
        return $run['data'].'/laravel/first-user-creation-failed';
    }

    private function hubInstallCodeBlock(): string
    {
        return $this->fragment('# --- hub install code: start ---', '# --- hub install code: end ---');
    }

    private function runtimeConfigBlock(): string
    {
        return $this->fragment('# --- runtime configuration: start ---', '# --- runtime configuration: end ---');
    }

    private function reverbBlock(): string
    {
        return $this->fragment('# --- reverb credentials: start ---', '# --- reverb credentials: end ---');
    }

    private function certificateBlock(): string
    {
        return $this->fragment('# --- engine certificate: start ---', '# --- engine certificate: end ---');
    }

    /**
     * The environment the Engine sets on the container
     * (`.panelalpha/panelalpha.yaml` env:).
     *
     * @return array<string, string>
     */
    private function runtimeEnv(): array
    {
        return [
            'APP_ENV' => 'production',
            'APP_DEBUG' => '0',
            'APP_URL' => 'https://panel.example.test',
            'SESSION_DRIVER' => 'database',
            'SESSION_SAME_SITE' => 'lax',
            'SANCTUM_PREFIX' => 'api',
            'SANCTUM_STATEFUL_DOMAINS' => 'panel.example.test',
            'QUEUE_CONNECTION' => 'database',
            'CACHE_STORE' => 'database',
            'BROADCAST_CONNECTION' => 'reverb',
            'LOG_CHANNEL' => 'stderr',
            'TRUSTED_FRONT_PROXIES' => TestNetwork::PRIVATE_10_CIDR.','.TestNetwork::PRIVATE_192_CIDR,
            'REVERB_APP_ID' => 'install-id',
            'REVERB_APP_KEY' => 'install-key',
            'REVERB_APP_SECRET' => 'install-secret',
            'REVERB_HOST' => TestNetwork::LOOPBACK,
            'REVERB_PORT' => '8080',
            'REVERB_SCHEME' => 'http',
            'REVERB_SERVER_HOST' => TestNetwork::ANY,
            'REVERB_SERVER_PORT' => '8080',
        ];
    }

    public function test_the_engine_certificate_is_seeded_from_pem_text(): void
    {
        // The hairpin Engine is self-signed, so the
        // PEM text is written to the data volume and seeded with
        // `settings:set engine-api-ca --from-file` (which validates it).
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBprobe\n-----END CERTIFICATE-----";
        $run = $this->runFragment($this->certificateBlock(), ['PANELALPHA_ENGINE_CA' => $pem]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString(
            'artisan settings:set engine-api-ca --from-file='.$run['data'].'/engine-api-ca.pem',
            $run['calls'],
        );
        $this->assertSame($pem."\n", (string) file_get_contents($run['data'].'/engine-api-ca.pem'));
        $this->assertStringNotContainsString('MIIBprobe', $run['output'], 'the certificate must never be logged');
        // The written certificate is announced
        // with one `updated` line, and its fingerprint marks it as env-written.
        $this->assertStringContainsString('[bootstrap] engine-api-ca updated from PANELALPHA_ENGINE_CA', $run['output']);
        $this->assertSame(hash('sha256', $pem)."\n", (string) file_get_contents($run['data'].'/engine-api-ca.from-env'));
    }

    public function test_the_engine_certificate_is_seeded_from_a_data_volume_path(): void
    {
        // A path under /app/data is accepted instead of the PEM
        // text (an operator dropping the file on the volume).
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBprobe\n-----END CERTIFICATE-----\n";
        $run = $this->runFragment(
            $this->certificateBlock(),
            ['PANELALPHA_ENGINE_CA' => 'engine-ca.pem'],
            ['data/engine-ca.pem' => $pem],
        );
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString(
            'artisan settings:set engine-api-ca --from-file='.$run['data'].'/engine-ca.pem',
            $run['calls'],
        );
        $this->assertStringNotContainsString('MIIBprobe', $run['output'], 'the certificate must never be logged');
    }

    public function test_an_invalid_engine_certificate_does_not_abort_the_boot(): void
    {
        // `settings:set` refuses an invalid PEM; the boot must
        // continue and the value must not be echoed.
        $invalid = "-----BEGIN CERTIFICATE-----\nnot-a-certificate\n-----END CERTIFICATE-----";
        $run = $this->runFragment($this->certificateBlock(), [
            'PANELALPHA_ENGINE_CA' => $invalid,
            'PANELALPHA_TEST_CA_EXIT' => '1',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('not a valid PEM certificate', $run['output']);
        $this->assertStringNotContainsString('not-a-certificate', $run['output'], 'the invalid value must not be logged');
    }

    public function test_a_missing_engine_certificate_file_does_not_abort_the_boot(): void
    {
        // Neither PEM text nor an existing data-volume file - the
        // boot continues and no Engine call is made.
        $run = $this->runFragment($this->certificateBlock(), ['PANELALPHA_ENGINE_CA' => 'missing.pem']);
        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('neither PEM text nor a path', $run['output']);
        $this->assertStringNotContainsString('settings:set engine-api-ca', $run['calls']);
    }

    public function test_the_reverb_credentials_are_generated_once_and_reused_across_a_redeploy(): void
    {
        // Like APP_KEY, the app id and signing secret live on the
        // /app/data volume; a redeploy re-clones ~/project but keeps it.
        $run = $this->runFragment($this->reverbBlock());
        $this->assertSame(0, $run['code'], $run['output']);

        $id = trim((string) file_get_contents($run['data'].'/reverb_app_id'));
        $secret = trim((string) file_get_contents($run['data'].'/reverb_app_secret'));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $id);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret);

        $again = $this->runFragment($this->reverbBlock(), [], [], $run['root']);
        $this->assertSame(0, $again['code'], $again['output']);
        $this->assertSame($id, trim((string) file_get_contents($again['data'].'/reverb_app_id')));
        $this->assertSame($secret, trim((string) file_get_contents($again['data'].'/reverb_app_secret')));
    }

    public function test_two_fresh_data_volumes_get_different_reverb_credentials(): void
    {
        // No two installs share a websocket signing secret.
        $first = $this->runFragment($this->reverbBlock());
        $second = $this->runFragment($this->reverbBlock());
        $this->assertSame(0, $first['code'], $first['output']);
        $this->assertSame(0, $second['code'], $second['output']);

        $this->assertNotSame(
            trim((string) file_get_contents($first['data'].'/reverb_app_secret')),
            trim((string) file_get_contents($second['data'].'/reverb_app_secret')),
        );
        $this->assertNotSame(
            trim((string) file_get_contents($first['data'].'/reverb_app_id')),
            trim((string) file_get_contents($second['data'].'/reverb_app_id')),
        );
    }

    public function test_the_generated_reverb_credentials_are_rendered_into_the_backend_env(): void
    {
        // The runtime-configuration block renders the generated
        // values, and the public key stays the CA's hardcoded Echo key
        // (packages/client-area/src/apis/Auth.js:340).
        $run = $this->runFragment($this->reverbBlock()."\n".$this->runtimeConfigBlock(), $this->runtimeEnv());
        $this->assertSame(0, $run['code'], $run['output']);

        $id = trim((string) file_get_contents($run['data'].'/reverb_app_id'));
        $secret = trim((string) file_get_contents($run['data'].'/reverb_app_secret'));
        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringContainsString("REVERB_APP_ID='{$id}'", $env);
        $this->assertStringContainsString("REVERB_APP_SECRET='{$secret}'", $env);
        $this->assertStringContainsString("REVERB_APP_KEY='89c60f11-c289-4d3e-9122-95502ac670ca'", $env);
    }

    public function test_the_runtime_configuration_is_rendered_into_the_backend_env(): void
    {
        // Php-fpm runs with `clear_env = yes`, so a web request
        // only sees backend/.env. Render the Engine-provided container env
        // there, single-quoted (phpdotenv must not expand it).
        $run = $this->runFragment($this->runtimeConfigBlock(), $this->runtimeEnv());
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        foreach ([
            "APP_URL='https://panel.example.test'",
            "SANCTUM_STATEFUL_DOMAINS='panel.example.test'",
            "TRUSTED_FRONT_PROXIES='".TestNetwork::PRIVATE_10_CIDR.",".TestNetwork::PRIVATE_192_CIDR."'",
            "BROADCAST_CONNECTION='reverb'",
            "REVERB_APP_SECRET='install-secret'",
        ] as $line) {
            $this->assertStringContainsString($line, $env, "backend/.env must carry {$line}");
        }
        // The APP_KEY block wrote it earlier; rendering must not drop it.
        $this->assertStringContainsString('APP_KEY=', $env);
    }

    public function test_the_engine_mail_relay_reaches_the_backend_env(): void
    {
        // Engine #2379: the Engine hands the account the relay on the host, and
        // php-fpm only sees backend/.env, so the renderer must pass it on; the
        // panel sends through it when the address is set (EngineMailRelay).
        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'PA_SMTP_HOST' => TestNetwork::PRIVATE_172,
            'PA_SMTP_PORT' => '25',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringContainsString("PA_SMTP_HOST='".TestNetwork::PRIVATE_172."'", $env);
        $this->assertStringContainsString("PA_SMTP_PORT='25'", $env);
    }

    public function test_an_install_without_a_mail_relay_gets_no_mail_key(): void
    {
        // An Engine that hands nothing leaves no key behind: the panel keeps
        // the `log` mailer and sends nothing.
        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'PA_SMTP_HOST' => '',
            'PA_SMTP_PORT' => '',
        ] + $this->runtimeEnv());
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringNotContainsString('PA_SMTP_', (string) file_get_contents($run['backend'].'/.env'));
    }

    public function test_rendering_the_runtime_configuration_replaces_not_duplicates_a_key(): void
    {
        // A redeploy re-runs the block against the existing .env.
        $run = $this->runFragment($this->runtimeConfigBlock(), $this->runtimeEnv(), [
            'backend/.env' => "APP_KEY=base64:KEEPME\nAPP_NAME=PanelAlpha\nAPP_URL='http://stale.example.test'\n",
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertSame(1, substr_count($env, 'APP_URL='), 'the renderer must replace the old value, not append a second key');
        $this->assertStringContainsString("APP_URL='https://panel.example.test'", $env);
        $this->assertStringNotContainsString('stale.example.test', $env);
        $this->assertStringContainsString('APP_KEY=base64:KEEPME', $env);
    }

    public function test_the_engine_and_first_user_secrets_never_reach_the_backend_env(): void
    {
        // The secrets live in the settings table / user row, so a
        // leaked .env must not carry them, and they must not be rendered.
        $token = 'engine-token-must-not-be-in-env';
        $password = 'First-User-Must-Not-Be-In-Env1!';
        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'PANELALPHA_ENGINE_URL' => 'https://engine.example.test/api',
            'PANELALPHA_ENGINE_TOKEN' => $token,
            'PANELALPHA_USER_EMAIL' => 'first@example.test',
            'PANELALPHA_USER_PASSWORD' => $password,
            'APP_URL' => 'https://panel.example.test',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringNotContainsString($token, $env, 'the Engine token must not reach backend/.env');
        $this->assertStringNotContainsString($password, $env, 'the first-user password must not reach backend/.env');
        $this->assertStringNotContainsString('PANELALPHA_ENGINE_URL', $env);
        // The non-secret values are still rendered.
        $this->assertStringContainsString("APP_URL='https://panel.example.test'", $env);
    }

    public function test_the_renderer_covers_every_app_config_runtime_key(): void
    {
        // A key the app config sets but the renderer forgets is
        // exactly the bug - php-fpm would fall back to the .env.example value.
        preg_match('/RUNTIME_ENV_KEYS=\((.*?)\)/s', $this->runtimeConfigBlock(), $matches);
        $this->assertNotEmpty($matches[1] ?? null, 'the renderer must declare RUNTIME_ENV_KEYS');
        $keys = preg_split('/\s+/', trim((string) $matches[1])) ?: [];

        $yaml = (string) file_get_contents(base_path('../../.panelalpha/panelalpha.yaml'));
        $this->assertSame(1, preg_match('/^env:\n(.*?)(?=^\S)/ms', $yaml, $envBlock), 'the app config must keep its env: block');
        preg_match_all('/^  ([A-Z0-9_]+):/m', (string) ($envBlock[1] ?? ''), $yamlKeys);
        $this->assertNotEmpty($yamlKeys[1], 'the app config env: block must set keys');
        foreach ($yamlKeys[1] as $key) {
            $this->assertContains($key, $keys, "the entrypoint must render {$key} into backend/.env");
        }
    }

    /**
     * The app config's `env:` block, the keys the Engine sets on the container
     * (`.panelalpha/panelalpha.yaml:43`). The behaviour test below
     * renders each one, so the membership check above cannot hide a renderer
     * that drops a key.
     *
     * @return array<string, array{string}>
     */
    public static function appConfigRuntimeKeys(): array
    {
        $yaml = (string) file_get_contents(dirname(__DIR__, 4).'/.panelalpha/panelalpha.yaml');
        preg_match('/^env:\n(.*?)(?=^\S)/ms', $yaml, $envBlock);
        preg_match_all('/^  ([A-Z0-9_]+):/m', (string) ($envBlock[1] ?? ''), $yamlKeys);

        return array_map(static fn (string $key): array => [$key], $yamlKeys[1] ?? []);
    }

    #[DataProvider('appConfigRuntimeKeys')]
    public function test_the_runtime_renderer_writes_the_value_of_every_app_config_key(string $key): void
    {
        // Assert the behaviour, not the RUNTIME_ENV_KEYS literal -
        // each app-config key the Engine sets must reach backend/.env with the
        // container value (a renderer loop that drops one key, or reads the
        // stale .env.example value, fails here). `.panelalpha/
        // panelalpha.yaml:29-60` is the contract; the app config wins over the
        // neutralised `files/.env`.
        $sentinel = 'sentinel-'.$key;
        $run = $this->runFragment($this->runtimeConfigBlock(), [$key => $sentinel]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringContainsString("{$key}='{$sentinel}'", $env, "backend/.env must carry the container value of {$key}");
    }

    public function test_the_app_key_is_generated_once_and_reused_across_a_redeploy(): void
    {
        $run = $this->runFragment($this->appKeyBlock());
        $this->assertSame(0, $run['code'], $run['output']);

        $first = trim((string) file_get_contents($run['data'].'/app_key'));
        $this->assertMatchesRegularExpression('/^base64:.+$/', $first);
        $this->assertStringContainsString('APP_KEY='.$first, (string) file_get_contents($run['backend'].'/.env'), 'the .env must carry the persisted key');

        // A redeploy re-clones ~/project (an empty APP_KEY) but keeps /app/data.
        $again = $this->runFragment($this->appKeyBlock(), [], [], $run['root']);
        $this->assertSame(0, $again['code'], $again['output']);

        $this->assertSame($first, trim((string) file_get_contents($again['data'].'/app_key')));
        $this->assertStringContainsString('APP_KEY='.$first, (string) file_get_contents($again['backend'].'/.env'));
    }

    public function test_an_existing_env_key_is_adopted_into_the_data_volume(): void
    {
        $existing = 'base64:ENVKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        $run = $this->runFragment($this->appKeyBlock(), [], ['backend/.env' => "APP_KEY=\"{$existing}\"\n"]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertSame($existing, trim((string) file_get_contents($run['data'].'/app_key')));
    }

    public function test_the_data_volume_key_wins_over_a_stale_env_key(): void
    {
        $volume = 'base64:VOLUMEKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        $run = $this->runFragment($this->appKeyBlock(), [], [
            'data/app_key' => $volume."\n",
            'backend/.env' => "APP_KEY=base64:STALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n",
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString('APP_KEY='.$volume, (string) file_get_contents($run['backend'].'/.env'));
        $this->assertSame($volume, trim((string) file_get_contents($run['data'].'/app_key')));
    }

    public function test_a_delivered_engine_certificate_replaces_the_stored_pin(): void
    {
        // The Engine owns PANELALPHA_ENGINE_CA (this replaced an earlier seed-once
        // rule), so a delivered CA that
        // differs from the stored pin is written at every start.
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBprobe\n-----END CERTIFICATE-----";
        $run = $this->runFragment($this->certificateBlock(), [
            'PANELALPHA_ENGINE_CA' => $pem,
            'PANELALPHA_TEST_SETTING_ENGINE_CA' => "-----BEGIN CERTIFICATE-----\nMIIBstale\n-----END CERTIFICATE-----",
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString(
            'artisan settings:set engine-api-ca --from-file='.$run['data'].'/engine-api-ca.pem',
            $run['calls'],
        );
        $this->assertStringContainsString('[bootstrap] engine-api-ca updated from PANELALPHA_ENGINE_CA', $run['output']);
        $this->assertSame(hash('sha256', $pem)."\n", (string) file_get_contents($run['data'].'/engine-api-ca.from-env'));
        $this->assertStringNotContainsString('MIIBprobe', $run['output'], 'the certificate must never be logged');
        $this->assertStringNotContainsString('MIIBstale', $run['output'], 'the stored certificate must never be logged');
    }

    public function test_an_unchanged_engine_certificate_is_not_rewritten(): void
    {
        // A delivered CA equal to the stored pin is kept (one
        // `kept` line) and still marked as env-written.
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBprobe\n-----END CERTIFICATE-----";
        $run = $this->runFragment($this->certificateBlock(), [
            'PANELALPHA_ENGINE_CA' => $pem,
            'PANELALPHA_TEST_SETTING_ENGINE_CA' => $pem,
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringNotContainsString('settings:set engine-api-ca', $run['calls']);
        $this->assertStringContainsString('[bootstrap] engine-api-ca kept - matches PANELALPHA_ENGINE_CA', $run['output']);
        $this->assertSame(hash('sha256', $pem)."\n", (string) file_get_contents($run['data'].'/engine-api-ca.from-env'));
        $this->assertStringNotContainsString('MIIBprobe', $run['output'], 'the certificate must never be logged');
    }

    public function test_a_url_without_a_certificate_clears_an_env_written_pin(): void
    {
        // The Engine delivers the URL without PANELALPHA_ENGINE_CA when
        // :2011 serves a publicly trusted certificate; the pin an earlier boot
        // wrote from the env (its fingerprint is in the marker) is cleared.
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBprobe\n-----END CERTIFICATE-----";
        $run = $this->runFragment($this->certificateBlock(), [
            'PANELALPHA_ENGINE_URL' => 'https://engine.example.com:2011/api',
            'PANELALPHA_TEST_SETTING_ENGINE_CA' => $pem,
        ], [
            'data/engine-api-ca.from-env' => hash('sha256', $pem)."\n",
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('artisan settings:unset engine-api-ca', $run['calls']);
        $this->assertStringNotContainsString('settings:set engine-api-ca', $run['calls']);
        $this->assertStringContainsString('[bootstrap] engine-api-ca cleared', $run['output']);
        $this->assertFileDoesNotExist($run['data'].'/engine-api-ca.from-env');
        $this->assertStringNotContainsString('MIIBprobe', $run['output'], 'the certificate must never be logged');
    }

    public function test_a_url_without_a_certificate_keeps_a_hand_set_pin(): void
    {
        // A pin the operator set by hand - no marker, or a marker
        // of an older env-written pin that `settings:set` has since replaced -
        // is kept.
        $pem = "-----BEGIN CERTIFICATE-----\nMIIBhandset\n-----END CERTIFICATE-----";
        foreach (['no marker' => [], 'stale marker' => ['data/engine-api-ca.from-env' => hash('sha256', 'an older env pin')."\n"]] as $case => $files) {
            $run = $this->runFragment($this->certificateBlock(), [
                'PANELALPHA_ENGINE_URL' => 'https://engine.example.com:2011/api',
                'PANELALPHA_TEST_SETTING_ENGINE_CA' => $pem,
            ], $files);

            $this->assertSame(0, $run['code'], $case.': '.$run['output']);
            $this->assertStringNotContainsString('settings:unset', $run['calls'], $case);
            $this->assertStringNotContainsString('settings:set', $run['calls'], $case);
            $this->assertStringContainsString('[bootstrap] engine-api-ca kept - set by hand', $run['output'], $case);
            $this->assertFileDoesNotExist($run['data'].'/engine-api-ca.from-env', $case);
            $this->assertStringNotContainsString('MIIBhandset', $run['output'], $case.': the certificate must never be logged');
        }

        // Neither a URL nor a CA delivered: the certificate block does nothing.
        $none = $this->runFragment($this->certificateBlock(), [
            'PANELALPHA_TEST_SETTING_ENGINE_CA' => $pem,
        ], ['data/engine-api-ca.from-env' => hash('sha256', $pem)."\n"]);
        $this->assertSame('', $none['calls']);
        $this->assertFileExists($none['data'].'/engine-api-ca.from-env');
    }

    public function test_the_self_project_is_rendered_into_the_backend_env(): void
    {
        // The panel's own Engine project is a
        // per-install value php-fpm can only read from backend/.env (clear_env
        // = yes), so the runtime renderer must carry it to the worker.
        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'PANELALPHA_SELF_PROJECT' => 'panelv1',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString("PANELALPHA_SELF_PROJECT='panelv1'", (string) file_get_contents($run['backend'].'/.env'));
    }


    public function test_a_rotated_engine_token_replaces_the_stored_one(): void
    {
        // The Engine owns the token and rotates it (`pae system:api-access:rotate`;
        // this replaced an earlier seed-once rule), so a delivered value that differs from the stored one is
        // written at every start; the unchanged URL is not rewritten.
        $run = $this->runFragment($this->credentialsBlock(), [
            'PANELALPHA_ENGINE_URL' => 'https://engine.example.com:2011/api',
            'PANELALPHA_ENGINE_TOKEN' => 'rotated-token-probe',
            'PANELALPHA_TEST_SETTING_ENGINE_URL' => 'https://engine.example.com:2011/api',
            'PANELALPHA_TEST_SETTING_ENGINE_TOKEN' => 'stale-token-probe',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('artisan settings:set engine-api-token rotated-token-probe', $run['calls']);
        $this->assertStringNotContainsString('settings:set engine-api-url', $run['calls']);
        $this->assertStringContainsString('[bootstrap] engine-api-token updated from PANELALPHA_ENGINE_TOKEN', $run['output']);
        $this->assertStringContainsString('[bootstrap] engine-api-url kept - matches PANELALPHA_ENGINE_URL', $run['output']);
        $this->assertStringNotContainsString('rotated-token-probe', $run['output'], 'the Engine token must never be logged');
        $this->assertStringNotContainsString('stale-token-probe', $run['output'], 'the stored token must never be logged');
    }

    public function test_the_runtime_configuration_logs_to_stderr_and_the_daily_file(): void
    {
        // The app config must use a stack channel that writes
        // to the container's stderr (caught by the generated FPM pools) and to a
        // daily file on the /app/data volume, so `pae` logs and the volume both
        // carry a web-request failure.
        $yaml = (string) file_get_contents(base_path('../../.panelalpha/panelalpha.yaml'));
        $this->assertMatchesRegularExpression('/^  LOG_CHANNEL: stack$/m', $yaml);
        $this->assertMatchesRegularExpression("/^  LOG_STACK: 'stderr,daily'$/m", $yaml);

        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'LOG_CHANNEL' => 'stack',
            'LOG_STACK' => 'stderr,daily',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringContainsString("LOG_CHANNEL='stack'", $env);
        $this->assertStringContainsString("LOG_STACK='stderr,daily'", $env);
    }

    public function test_the_runtime_configuration_pins_the_secure_session_cookie(): void
    {
        // The Engine's app-lite host proxy does not
        // send X-Forwarded-Proto (templates/virtualHost-nginx-proxy-app-lite.
        // blade.php:44-46), so the request-scheme path cannot mark the cookies
        // Secure. The app config pins SESSION_SECURE_COOKIE=true and the
        // renderer writes it into backend/.env for php-fpm.
        $yaml = (string) file_get_contents(base_path('../../.panelalpha/panelalpha.yaml'));
        $this->assertMatchesRegularExpression("/^  SESSION_SECURE_COOKIE: 'true'$/m", $yaml);

        $run = $this->runFragment($this->runtimeConfigBlock(), [
            'SESSION_SECURE_COOKIE' => 'true',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $env = (string) file_get_contents($run['backend'].'/.env');
        $this->assertStringContainsString("SESSION_SECURE_COOKIE='true'", $env);
    }

    public function test_the_engine_credentials_are_seeded_when_the_setting_is_empty(): void
    {
        $token = 'engine-token-probe-1234567890';
        $run = $this->runFragment($this->credentialsBlock(), [
            'PANELALPHA_ENGINE_URL' => 'http://engine.example.com/api',
            'PANELALPHA_ENGINE_TOKEN' => $token,
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString('artisan settings:set engine-api-url http://engine.example.com/api', $run['calls']);
        $this->assertStringContainsString('artisan settings:set engine-api-token '.$token, $run['calls']);
        $this->assertStringNotContainsString($token, $run['output'], 'the Engine token must never be logged');
        // `settings:get` prints `Setting not found: …` on stdout
        // and exits non-zero; the block must key on the exit code and announce
        // each written value, never capture the message as the value. The
        // first boot is the `updated` outcome.
        $this->assertStringContainsString('[bootstrap] engine-api-url updated from PANELALPHA_ENGINE_URL', $run['output']);
        $this->assertStringContainsString('[bootstrap] engine-api-token updated from PANELALPHA_ENGINE_TOKEN', $run['output']);
        $this->assertStringNotContainsString('Setting not found', $run['output']);

        $empty = $this->runFragment($this->credentialsBlock(), []);
        $this->assertStringNotContainsString('settings:set', $empty['calls']);
    }

    public function test_a_failed_engine_credential_seed_prints_an_error_without_aborting_the_boot(): void
    {
        // A `settings:set` that exits non-zero must be announced
        // instead of failing silently, and must not abort the container boot.
        $run = $this->runFragment($this->credentialsBlock(), [
            'PANELALPHA_ENGINE_URL' => 'http://engine.example.com/api',
            'PANELALPHA_ENGINE_TOKEN' => 'engine-token-probe-1234567890',
            'PANELALPHA_TEST_PHP_EXIT' => '1',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('[bootstrap] engine-api-url update failed', $run['output']);
        $this->assertStringContainsString('[bootstrap] engine-api-token update failed', $run['output']);
    }

    public function test_an_unchanged_engine_credential_is_not_rewritten(): void
    {
        // A delivered value equal to the stored one is not
        // rewritten; each is announced with one `kept` line.
        $run = $this->runFragment($this->credentialsBlock(), [
            'PANELALPHA_ENGINE_URL' => 'https://engine.example.com:2011/api',
            'PANELALPHA_ENGINE_TOKEN' => 'kept-token',
            'PANELALPHA_TEST_SETTING_ENGINE_URL' => 'https://engine.example.com:2011/api',
            'PANELALPHA_TEST_SETTING_ENGINE_TOKEN' => 'kept-token',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringNotContainsString('settings:set', $run['calls']);
        $this->assertStringContainsString('[bootstrap] engine-api-url kept - matches PANELALPHA_ENGINE_URL', $run['output']);
        $this->assertStringContainsString('[bootstrap] engine-api-token kept - matches PANELALPHA_ENGINE_TOKEN', $run['output']);
        $this->assertStringNotContainsString('kept-token', $run['output'], 'the stored token must never be logged');
    }

    public function test_the_first_user_is_created_on_an_empty_database_without_logging_the_password(): void
    {
        $password = 'First-User-Password1!';
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'first@example.com',
            'PANELALPHA_USER_PASSWORD' => $password,
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString('artisan users:list --no-interaction', $run['calls']);
        $this->assertStringContainsString('artisan users:create first@example.com '.$password, $run['calls']);
        $this->assertStringNotContainsString($password, $run['output'], 'the first user password must never be logged');
        // The created user is announced with one line.
        $this->assertStringContainsString('[bootstrap] first user created', $run['output']);
    }

    public function test_the_hub_install_code_is_claimed_once_with_the_secrets_on_stdin(): void
    {
        $env = [
            'PANELALPHA_USER_EMAIL' => 'ada@example.com',
            'PANELALPHA_USER_PASSWORD' => 'Install-Password-42!',
            'PANELALPHA_HUB_CODE' => 'WDJB-MJHT',
        ];
        $run = $this->runFragment($this->hubInstallCodeBlock(), $env);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringContainsString('artisan hub:claim-install-code ada@example.com --no-interaction', $run['calls']);
        $this->assertStringNotContainsString('WDJB-MJHT', $run['calls'], 'the code never goes into argv');
        $this->assertStringNotContainsString('Install-Password-42!', $run['calls'], 'the password never goes into argv');
        $this->assertSame("WDJB-MJHT\nInstall-Password-42!\n", (string) file_get_contents($run['root'].'/calls.log.stdin'));
        $this->assertStringNotContainsString('WDJB-MJHT', $run['output']);
        $this->assertStringContainsString('install code claimed: the panel is connected', $run['output']);
        $this->assertFileExists($run['data'].'/hub-install-code-claimed');

        // A restart with the same env vars sends nothing again.
        $again = $this->runFragment($this->hubInstallCodeBlock(), $env, root: $run['root']);
        $this->assertSame(0, $again['code'], $again['output']);
        $this->assertSame(1, substr_count($again['calls'], 'hub:claim-install-code'));
    }

    public function test_a_refused_hub_install_code_does_not_abort_the_boot(): void
    {
        $run = $this->runFragment($this->hubInstallCodeBlock(), [
            'PANELALPHA_USER_EMAIL' => 'ada@example.com',
            'PANELALPHA_HUB_CODE' => 'WDJB-MJHT',
            'PANELALPHA_TEST_HUB_EXIT' => '2',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('install code refused (exit 2)', $run['output']);
        $this->assertStringNotContainsString('claimed', $run['output']);
    }

    public function test_no_hub_install_code_or_no_email_claims_nothing(): void
    {
        $none = $this->runFragment($this->hubInstallCodeBlock(), ['PANELALPHA_USER_EMAIL' => 'ada@example.com']);
        $noEmail = $this->runFragment($this->hubInstallCodeBlock(), ['PANELALPHA_HUB_CODE' => 'WDJB-MJHT']);

        foreach ([$none, $noEmail] as $run) {
            $this->assertSame(0, $run['code'], $run['output']);
            $this->assertStringNotContainsString('hub:claim-install-code', $run['calls']);
            $this->assertFileDoesNotExist($run['data'].'/hub-install-code-claimed');
        }
    }

    public function test_an_existing_user_is_kept(): void
    {
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'second@example.com',
            'PANELALPHA_USER_PASSWORD' => 'Second-User-Password1!',
            'PANELALPHA_TEST_USERS_LIST' => '| 1 | Existing | existing@example.com |',
        ], $this->failedFirstUserMarker());

        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringNotContainsString('users:create', $run['calls'], 'a non-empty database must not get a second user');
        $this->assertFileDoesNotExist($this->markerPath($run), 'a stale failure marker must not outlive a user');
    }

    public function test_an_existing_account_is_not_reported_as_a_failed_creation(): void
    {
        // The variables stay delivered after the account exists, and their
        // password still breaks the rules: the boot must say nothing and write
        // no marker, or every start looks broken.
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'owner@example.com',
            'PANELALPHA_USER_PASSWORD' => 'onlylettersanddigits0123456789',
            'PANELALPHA_TEST_USERS_LIST' => "+----+---------+-------------------+---------------------+\n| 1  | Owner   | owner@example.com | 2026-11-14 14:28:10 |\n",
            // A create attempted anyway is refused (the address is taken).
            'PANELALPHA_TEST_PHP_EXIT' => '1',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringNotContainsString('first user creation failed', $run['output']);
        $this->assertStringNotContainsString('users:create', $run['calls']);
        $this->assertFileDoesNotExist($this->markerPath($run), 'an existing account must not close the setup wizard');
    }

    public function test_a_failed_first_user_creation_does_not_abort_the_boot(): void
    {
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'bad',
            'PANELALPHA_USER_PASSWORD' => 'x',
            'PANELALPHA_TEST_PHP_EXIT' => '1',
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('first user creation failed', $run['output']);
        $this->assertFileExists($this->markerPath($run), 'a refused creation must keep the setup wizard closed');
    }

    public function test_a_failed_first_user_creation_names_the_rule_and_never_the_password(): void
    {
        $password = 'onlylettersanddigits0123456789';
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'first@example.com',
            'PANELALPHA_USER_PASSWORD' => $password,
            'PANELALPHA_TEST_PHP_EXIT' => '1',
            'PANELALPHA_TEST_USERS_CREATE_OUTPUT' => "The password field must contain at least one symbol.\n",
        ]);

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('[bootstrap] first user creation failed: The password field must contain at least one symbol.', $run['output']);
        $this->assertStringNotContainsString($password, $run['output'], 'the first user password must never be logged');
        $this->assertFileExists($this->markerPath($run));
    }

    public function test_a_successful_first_user_creation_clears_the_failure_marker(): void
    {
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_USER_EMAIL' => 'first@example.com',
            'PANELALPHA_USER_PASSWORD' => 'First-User-Password1!',
        ], $this->failedFirstUserMarker());

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('[bootstrap] first user created', $run['output']);
        $this->assertFileDoesNotExist($this->markerPath($run));
    }

    public function test_removing_the_first_user_variables_reopens_the_setup_wizard(): void
    {
        $run = $this->runFragment($this->firstUserBlock(), [], $this->failedFirstUserMarker());

        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringNotContainsString('users:create', $run['calls']);
        $this->assertFileDoesNotExist($this->markerPath($run), 'the documented no-variables wizard flow must not stay closed');
    }

    public function test_community_still_creates_the_first_user_with_its_product_set(): void
    {
        $run = $this->runFragment($this->firstUserBlock(), [
            'PANELALPHA_PRODUCT' => 'free',
            'PANELALPHA_USER_EMAIL' => 'first@example.com',
            'PANELALPHA_USER_PASSWORD' => 'First-User-Password1!',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString('artisan users:create first@example.com', $run['calls']);
    }

    public function test_the_product_is_rendered_into_the_backend_env(): void
    {
        // php-fpm clears its environment: the app reads PANELALPHA_PRODUCT
        // from backend/.env.
        $run = $this->runFragment($this->runtimeConfigBlock(), ['PANELALPHA_PRODUCT' => 'pro']);
        $this->assertSame(0, $run['code'], $run['output']);
        $this->assertStringContainsString("PANELALPHA_PRODUCT='pro'", (string) file_get_contents($run['backend'].'/.env'));
    }

    public function test_the_workers_never_inherit_the_engine_token_or_the_first_user_password(): void
    {
        // supervisord and its programs (Reverb, the queue, the scheduler)
        // inherit the entrypoint's environment; the secrets are in the
        // settings table and the user row by then.
        $block = $this->fragment('# --- process environment: start ---', '# --- process environment: end ---');
        $run = $this->runFragment($block."\nenv\n", [
            'PANELALPHA_ENGINE_TOKEN' => 'engine-token-must-not-reach-a-worker',
            'PANELALPHA_USER_PASSWORD' => 'password-must-not-reach-a-worker',
            'PANELALPHA_HUB_CODE' => 'HUBC-MUST',
            'PANELALPHA_ENGINE_URL' => 'https://engine.example.test/api',
        ]);
        $this->assertSame(0, $run['code'], $run['output']);

        $this->assertStringNotContainsString('engine-token-must-not-reach-a-worker', $run['output']);
        $this->assertStringNotContainsString('password-must-not-reach-a-worker', $run['output']);
        $this->assertStringNotContainsString('HUBC-MUST', $run['output']);
        $this->assertStringContainsString('PANELALPHA_ENGINE_URL=https://engine.example.test/api', $run['output']);

        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertLessThan(
            (int) strpos($script, 'exec supervisord'),
            (int) strpos($script, '# --- process environment: end ---'),
            'the secrets are dropped before supervisord starts',
        );
        $this->assertGreaterThan(
            (int) strpos($script, '# --- first user: end ---'),
            (int) strpos($script, '# --- process environment: start ---'),
            'the secrets are dropped only after they were written',
        );
    }

    public function test_the_entrypoint_wires_the_engine_runtime_blocks_in_order(): void
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));

        // The override hooks' production defaults.
        $this->assertStringContainsString('PANELALPHA_DATA_ROOT:-/app/data', $script);
        $this->assertStringContainsString('PANELALPHA_BACKEND_ROOT:-/app/backend', $script);

        $order = [
            '# --- persisted app key: start ---',
            '# --- reverb credentials: start ---',
            '# --- runtime configuration: start ---',
            'php artisan migrate --force --no-interaction',
            '# --- engine credentials: start ---',
            '# --- engine certificate: start ---',
            '# --- first user: start ---',
            'exec supervisord',
        ];
        $position = -1;
        foreach ($order as $needle) {
            $at = strpos($script, $needle);
            $this->assertNotFalse($at, "entrypoint.sh must contain {$needle}");
            $this->assertGreaterThan($position, (int) $at, "{$needle} must come after the previous block");
            $position = (int) $at;
        }
    }
}
