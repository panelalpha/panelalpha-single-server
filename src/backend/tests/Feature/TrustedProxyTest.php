<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The client IP cannot be spoofed.
 *
 * The container nginx is the only reverse proxy in front of php-fpm. It used to
 * trust `X-Forwarded-For` from the whole `PRIVATE_172_CIDR` Docker range, so any
 * client that reached it from a Docker-range address could set `$remote_addr`
 * with its own header - and since Laravel trusts nginx, that spoofed value was
 * `$request->ip()`. The fix is twofold: the host app trusts only the container
 * nginx (`LOOPBACK` / `::1`) and only `X-Forwarded-For`, and the edge generates
 * its `set_real_ip_from` list from `TRUSTED_FRONT_PROXIES` (empty by default, so
 * nginx reads no client header at all).
 *
 * This class pins the header set, the spoof-resistant limit (a public peer with
 * a rotating header keeps one bucket) and the generated fragment. The
 * real-image probe lives in `backend/scripts/check-container-config.sh`.
 * The trusted set includes `X-Forwarded-Proto` (loopback only), so
 * the header set is asserted there.
 *
 * @see src/config/nginx.conf
 * @see src/backend/scripts/write-trusted-proxies.sh
 * @see src/entrypoint.sh (trusted front proxies block)
 */
class TrustedProxyTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['sanctum.stateful' => []]);
    }

    public function test_the_panel_trusts_only_the_forwarded_for_and_proto_headers(): void
    {
        // Running one request lets TrustProxies write the header set the app
        // trusts; a default trustProxies() call would also accept
        // X-Forwarded-Host/Port/Prefix. The panel adds
        // X-Forwarded-Proto so the Engine proxy's https marks the cookie Secure.
        // CA: packages/client-area/src/apis/Auth.js:50
        $this->getJson('/api/home')->assertOk();

        $this->assertSame(
            Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO,
            SymfonyRequest::getTrustedHeaderSet(),
            'the panel must trust X-Forwarded-For and X-Forwarded-Proto, not Host/Port/Prefix',
        );
    }

    public function test_a_rotating_forwarded_for_from_an_untrusted_peer_keeps_one_ip_bucket(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/SystemController.php:51 -> info() mcp_url
        // Engine: core/app/Http/Controllers/McpTokenController.php:161 -> check()
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp/check' => Http::response(['valid' => true]),
        ]);

        // The request arrives directly from a public client, not from the
        // container nginx, so its X-Forwarded-For must be ignored: every request
        // shares the peer-IP bucket and the 61st is 429. Under the old
        // `trustProxies(at: '*')` (or the edge's Docker-range trust) each header
        // would open a new bucket and no request would ever be limited.
        $this->withServerVariables(['REMOTE_ADDR' => TestNetwork::public(7)]);
        // Every bearer is a token the panel minted (the `/mcp`
        // gatekeeper refuses anything else), so each request reaches the Engine
        // and only the shared IP bucket can stop the 61st.
        $user = User::factory()->create();
        $bearers = array_map(fn (int $id): string => $this->ownedMcpBearer($id, $user), range(1, 61));

        for ($i = 0; $i < 60; $i++) {
            // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
            $this->getJson('/mcp/check', [
                'Authorization' => 'Bearer '.$bearers[$i],
                'X-Forwarded-For' => '198.51.100.'.$i,
            ])->assertOk();
        }

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->getJson('/mcp/check', [
            'Authorization' => 'Bearer '.$bearers[60],
            'X-Forwarded-For' => TestNetwork::public2(250),
        ])->assertStatus(429);
    }

    public function test_the_real_ip_fragment_is_absent_without_trusted_front_proxies(): void
    {
        $root = $this->runEntrypointBlock('');

        $this->assertFileDoesNotExist($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');

        // The static config may not hard-code a trust range either: with the env
        // empty `$remote_addr` must stay the TCP peer.
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $this->assertStringNotContainsString('set_real_ip_from', $nginx);
        $this->assertStringNotContainsString('real_ip_header', $nginx);
    }

    public function test_the_real_ip_fragment_is_removed_when_the_list_is_emptied(): void
    {
        // A container that trusted a proxy on an earlier start must not keep
        // trusting it once TRUSTED_FRONT_PROXIES is cleared: the empty branch
        // deletes the fragment written by the previous run, so a downgrade is
        // not silently ignored.
        $root = $this->runEntrypointBlock('', seedExistingFragment: true);

        $this->assertFileDoesNotExist($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
    }

    public function test_the_real_ip_fragment_lists_the_configured_front_proxies(): void
    {
        $root = $this->runEntrypointBlock(TestNetwork::DOCKER_BRIDGE_CIDR.', '.TestNetwork::PRIVATE_10_CIDR);

        $fragment = (string) file_get_contents($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
        $this->assertStringContainsString('set_real_ip_from '.TestNetwork::DOCKER_BRIDGE_CIDR.';', $fragment);
        // Whitespace around a comma is allowed in the env value.
        $this->assertStringContainsString('set_real_ip_from '.TestNetwork::PRIVATE_10_CIDR.';', $fragment);
        $this->assertStringContainsString('real_ip_header X-Forwarded-For;', $fragment);
        // Only the right-most entry – the one the trusted hop appended. The
        // Engine's proxies append (`$proxy_add_x_forwarded_for`); with
        // recursive on, a client whose own address is private (so trusted)
        // made nginx walk on into an address it had prepended itself.
        $this->assertStringContainsString('real_ip_recursive off;', $fragment);
        $this->assertStringNotContainsString('real_ip_recursive on;', $fragment);
    }

    public function test_an_invalid_trusted_proxy_entry_is_refused(): void
    {
        // An entry is written straight into an nginx directive, so
        // a `;` or an `include` must never reach the generated file. The script
        // prints a [bootstrap] error, writes no fragment and still exits 0 so the
        // container start does not abort.
        $run = $this->runProxiesScript(TestNetwork::routable(4).'; include /etc/nginx/nginx.conf');

        $this->assertSame(0, $run['code']);
        $this->assertStringContainsString('[bootstrap]', $run['stderr']);
        $this->assertFileDoesNotExist($run['root'].'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
    }

    #[DataProvider('catchAllProvider')]
    public function test_a_catch_all_trusted_proxy_entry_is_refused(string $entry): void
    {
        // `ANY_CIDR` / `::/0` would restore the review-14 Medium
        // (every client trusted), so a `/0` prefix is never written.
        $run = $this->runProxiesScript($entry);

        $this->assertSame(0, $run['code']);
        $this->assertStringContainsString('[bootstrap]', $run['stderr']);
        $this->assertFileDoesNotExist($run['root'].'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function catchAllProvider(): array
    {
        return [
            'IPv4' => [TestNetwork::ANY_CIDR],
            'IPv6' => ['::/0'],
        ];
    }

    public function test_a_mixed_valid_and_invalid_list_trusts_nobody(): void
    {
        // A single bad entry must not leave a subset of the
        // intended proxies trusted - the whole list is dropped (fail closed).
        $run = $this->runProxiesScript(TestNetwork::DOCKER_BRIDGE_CIDR.','.TestNetwork::ANY_CIDR);

        $this->assertSame(0, $run['code']);
        $this->assertStringContainsString('[bootstrap]', $run['stderr']);
        $this->assertFileDoesNotExist($run['root'].'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
    }

    public function test_an_ipv6_cidr_entry_is_accepted(): void
    {
        // A valid IPv6 CIDR is a front proxy like any other.
        $run = $this->runProxiesScript('2001:db8::/32');

        $this->assertSame(0, $run['code']);
        $fragment = (string) file_get_contents($run['root'].'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
        $this->assertStringContainsString('set_real_ip_from 2001:db8::/32;', $fragment);
    }

    #[DataProvider('malformedAddressProvider')]
    public function test_a_malformed_address_is_refused(string $entry): void
    {
        // Only a real IPv4/IPv6 address or CIDR may reach
        // nginx. `1::2::3` (two abbreviations) and `:::1` (three consecutive
        // colons) are not valid IPv6 and would make `nginx -t` fail, because
        // `set_real_ip_from` parses with ngx_parse_addr. They are rejected like
        // any other malformed entry, so the whole list stays untrusted.
        $run = $this->runProxiesScript($entry);

        $this->assertSame(0, $run['code']);
        $this->assertStringContainsString('[bootstrap]', $run['stderr']);
        $this->assertFileDoesNotExist($run['root'].'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function malformedAddressProvider(): array
    {
        return [
            'two abbreviations' => ['1::2::3'],
            'three leading colons' => [':::1'],
            'three middle colons' => ['1:::2'],
            'nine groups' => ['1:2:3:4:5:6:7:8:9'],
            'group too long' => ['12345::'],
        ];
    }

    public function test_the_trusted_front_proxies_fall_back_to_the_env_file(): void
    {
        // When TRUSTED_FRONT_PROXIES is empty, entrypoint.sh takes
        // it from the .env file; TRUSTED_PROXY_ENV makes that path testable.
        $env = $this->tempEnvFile("TRUSTED_FRONT_PROXIES=".TestNetwork::DOCKER_BRIDGE_CIDR."\n");
        try {
            $root = $this->runEntrypointBlock('', false, ['TRUSTED_PROXY_ENV' => $env]);
            $fragment = (string) file_get_contents($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
            $this->assertStringContainsString('set_real_ip_from '.TestNetwork::DOCKER_BRIDGE_CIDR.';', $fragment);
        } finally {
            unlink($env);
        }
    }

    public function test_a_quoted_env_file_value_is_unquoted(): void
    {
        // A value an operator wrote as "PRIVATE_10_CIDR" must arrive at
        // the validator without the quotes.
        $env = $this->tempEnvFile("TRUSTED_FRONT_PROXIES=\"".TestNetwork::PRIVATE_10_CIDR."\"\n");
        try {
            $root = $this->runEntrypointBlock('', false, ['TRUSTED_PROXY_ENV' => $env]);
            $fragment = (string) file_get_contents($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
            $this->assertStringContainsString('set_real_ip_from '.TestNetwork::PRIVATE_10_CIDR.';', $fragment);
        } finally {
            unlink($env);
        }
    }

    public function test_the_last_env_file_line_wins(): void
    {
        // The last TRUSTED_FRONT_PROXIES line is the effective one.
        $env = $this->tempEnvFile("TRUSTED_FRONT_PROXIES=".TestNetwork::DOCKER_BRIDGE_CIDR."\nTRUSTED_FRONT_PROXIES=".TestNetwork::PRIVATE_10_CIDR."\n");
        try {
            $root = $this->runEntrypointBlock('', false, ['TRUSTED_PROXY_ENV' => $env]);
            $fragment = (string) file_get_contents($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
            $this->assertStringContainsString('set_real_ip_from '.TestNetwork::PRIVATE_10_CIDR.';', $fragment);
            $this->assertStringNotContainsString(TestNetwork::DOCKER_BRIDGE_CIDR, $fragment);
        } finally {
            unlink($env);
        }
    }

    public function test_the_environment_takes_precedence_over_the_env_file(): void
    {
        // An explicit env var wins over the .env file.
        $env = $this->tempEnvFile("TRUSTED_FRONT_PROXIES=".TestNetwork::PRIVATE_10_CIDR."\n");
        try {
            $root = $this->runEntrypointBlock(TestNetwork::DOCKER_BRIDGE_CIDR, false, ['TRUSTED_PROXY_ENV' => $env]);
            $fragment = (string) file_get_contents($root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf');
            $this->assertStringContainsString('set_real_ip_from '.TestNetwork::DOCKER_BRIDGE_CIDR.';', $fragment);
            $this->assertStringNotContainsString(TestNetwork::PRIVATE_10_CIDR, $fragment);
        } finally {
            unlink($env);
        }
    }

    /**
     * write-trusted-proxies.sh run directly against a temp root, so the K2
     * validation is tested at its own boundary.
     *
     * @return array{root: string, stdout: string, stderr: string, code: int}
     */
    private function runProxiesScript(string $proxies): array
    {
        $root = sys_get_temp_dir().'/panelalpha-proxies-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);

        $inherited = getenv();
        $pipes = [];
        $process = proc_open(
            ['bash', base_path('scripts/write-trusted-proxies.sh'), $root],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(is_array($inherited) ? $inherited : [], ['TRUSTED_FRONT_PROXIES' => $proxies]),
        );
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return ['root' => $root, 'stdout' => $stdout, 'stderr' => $stderr, 'code' => proc_close($process)];
    }

    private function tempEnvFile(string $contents): string
    {
        $path = sys_get_temp_dir().'/panelalpha-env-'.bin2hex(random_bytes(6));
        file_put_contents($path, $contents);

        return $path;
    }

    /**
     * The trusted-proxy block of entrypoint.sh, runnable on its own.
     */
    private function entrypointBlock(): string
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- trusted front proxies: start ---(.*?)# --- trusted front proxies: end ---/s', $script, $matches),
            'entrypoint.sh must keep the trusted-proxy markers for this test',
        );

        return $matches[1];
    }

    /**
     * @param  array<string, string>  $extraEnv  overrides (e.g. TRUSTED_PROXY_ENV)
     * @return string the temp root
     */
    private function runEntrypointBlock(string $proxies, bool $seedExistingFragment = false, array $extraEnv = []): string
    {
        $root = sys_get_temp_dir().'/panelalpha-trusted-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);

        if ($seedExistingFragment) {
            mkdir($root.'/etc/nginx/conf.d', 0777, true);
            file_put_contents(
                $root.'/etc/nginx/conf.d/01-panelalpha-real-ip.conf',
                "set_real_ip_from ".TestNetwork::PRIVATE_172_CIDR.";\nreal_ip_header X-Forwarded-For;\n",
            );
        }

        $fragment = $root.'/fragment.sh';
        file_put_contents($fragment, "#!/bin/bash\nset -e\n".$this->entrypointBlock());

        $inherited = getenv();
        $pipes = [];
        $environment = array_merge(is_array($inherited) ? $inherited : [], [
            'TRUSTED_PROXY_ROOT' => $root,
            'TRUSTED_PROXY_SCRIPT' => base_path('scripts/write-trusted-proxies.sh'),
            'TRUSTED_FRONT_PROXIES' => $proxies,
        ], $extraEnv);

        $process = proc_open(['bash', $fragment], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $environment);
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $this->assertSame(0, proc_close($process), $stdout.$stderr);

        return $root;
    }
}
