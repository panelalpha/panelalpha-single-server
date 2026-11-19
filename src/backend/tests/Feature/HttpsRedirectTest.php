<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * A visitor who reached the panel over http goes to https when the panel's URL
 * is https: the session cookies are Secure, so a login over http fails with a
 * CSRF token mismatch, and the Engine serves every domain (and the server's own
 * name, `domain: host`) on :80 as well as :443.
 *
 * The container nginx decides it from the X-Forwarded-Proto of a trusted front
 * proxy only (`$realip_remote_addr != $remote_addr`, write-trusted-proxies.sh),
 * so the Engine's health check and any direct hit are never redirected. The
 * redirect itself was probed in a real nginx (the generated snippet behind a
 * trusted range: proxy http -> 308 with path and query, proxy https -> 200,
 * a direct hit with a forged header -> 200); the real image runs `nginx -t` on
 * it in backend/scripts/check-container-config.sh.
 *
 * @see src/backend/scripts/write-https-redirect.sh
 * @see src/entrypoint.sh (https redirect block)
 * @see src/config/nginx.conf (the front server's include)
 */
class HttpsRedirectTest extends TestCase
{
    private const string SNIPPET = '/etc/nginx/snippets/panelalpha-https-redirect.conf';

    /**
     * @return array<string, array{string}>
     */
    public static function httpsUrls(): array
    {
        return [
            'the server name' => ['https://198-51-100-118.panelalpha.direct'],
            'a port' => ['https://panel.example.com:8443'],
            'upper case scheme' => ['HTTPS://panel.example.com'],
        ];
    }

    #[DataProvider('httpsUrls')]
    public function test_an_https_url_redirects_a_visitor_the_trusted_proxy_reports_as_http(string $url): void
    {
        $snippet = $this->snippet($this->runScript($url));

        $this->assertStringContainsString('if ($realip_remote_addr != $remote_addr) {', $snippet);
        $this->assertStringContainsString('set $panelalpha_visitor_scheme $http_x_forwarded_proto;', $snippet);
        $this->assertStringContainsString('if ($panelalpha_visitor_scheme = "http") {', $snippet);
        $this->assertStringContainsString('return 308 https://$host$request_uri;', $snippet);
        // Nothing of APP_URL reaches the file: the host is the request's own.
        $this->assertStringNotContainsString('panel.example.com', $snippet);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function otherUrls(): array
    {
        return [
            'http' => ['http://panel.example.com'],
            'empty' => [''],
        ];
    }

    #[DataProvider('otherUrls')]
    public function test_any_other_url_serves_http_as_it_is(string $url): void
    {
        $snippet = $this->snippet($this->runScript($url));

        $this->assertStringNotContainsString('return', $snippet);
        $this->assertStringContainsString('APP_URL is not https', $snippet);
    }

    public function test_the_entrypoint_falls_back_to_the_env_file_app_url(): void
    {
        $env = sys_get_temp_dir().'/panelalpha-env-'.bin2hex(random_bytes(6));
        file_put_contents($env, "APP_NAME=x\nAPP_URL=\"http://old.example.com\"\nAPP_URL=\"https://panel.example.com\"\n");

        [$root, $stdout] = $this->runEntrypointBlock(['APP_URL' => '', 'HTTPS_REDIRECT_ENV' => $env]);

        $this->assertStringContainsString('return 308 https://$host$request_uri;', $this->snippet($root));
        $this->assertStringContainsString('[bootstrap] https redirect: on', $stdout);
    }

    public function test_the_entrypoint_environment_wins_over_the_env_file(): void
    {
        $env = sys_get_temp_dir().'/panelalpha-env-'.bin2hex(random_bytes(6));
        file_put_contents($env, "APP_URL=https://panel.example.com\n");

        [$root, $stdout] = $this->runEntrypointBlock(['APP_URL' => 'http://panel.example.com', 'HTTPS_REDIRECT_ENV' => $env]);

        $this->assertStringNotContainsString('return', $this->snippet($root));
        $this->assertStringContainsString('[bootstrap] https redirect: off', $stdout);
    }

    public function test_the_front_server_includes_the_snippet_before_its_locations(): void
    {
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $front = substr($nginx, (int) strpos($nginx, 'listen 80 default_server;'));
        $front = substr($front, 0, (int) strpos($front, 'listen '.TestNetwork::LOOPBACK.':82'));

        $include = strpos($front, 'include '.self::SNIPPET.';');
        $this->assertNotFalse($include, 'the front server must include the https redirect');
        $this->assertLessThan((int) strpos($front, 'location / {'), $include);
        // Only the front server: the backend hop on LOOPBACK:82 is never redirected.
        $backend = substr($nginx, (int) strpos($nginx, 'listen '.TestNetwork::LOOPBACK.':82'));
        $this->assertStringNotContainsString('panelalpha-https-redirect', $backend);
    }

    /**
     * @return string the temp root the script wrote under
     */
    private function runScript(string $url): string
    {
        $root = sys_get_temp_dir().'/panelalpha-https-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);

        [$stdout, $stderr, $code] = $this->runProcess(['bash', base_path('scripts/write-https-redirect.sh'), $root], ['APP_URL' => $url]);
        $this->assertSame(0, $code, $stdout.$stderr);

        return $root;
    }

    /**
     * The https redirect block of entrypoint.sh, runnable on its own.
     *
     * @param  array<string, string>  $env
     * @return array{string, string} the temp root and stdout
     */
    private function runEntrypointBlock(array $env): array
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- https redirect: start ---(.*?)# --- https redirect: end ---/s', $script, $matches),
            'entrypoint.sh must keep the https redirect markers for this test',
        );

        $root = sys_get_temp_dir().'/panelalpha-https-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);
        $fragment = $root.'/fragment.sh';
        file_put_contents($fragment, "#!/bin/bash\nset -e\n".$matches[1]);

        [$stdout, $stderr, $code] = $this->runProcess(['bash', $fragment], array_merge([
            'HTTPS_REDIRECT_ROOT' => $root,
            'HTTPS_REDIRECT_SCRIPT' => base_path('scripts/write-https-redirect.sh'),
        ], $env));
        $this->assertSame(0, $code, $stdout.$stderr);

        return [$root, $stdout];
    }

    /**
     * @param  list<string>  $command
     * @param  array<string, string>  $env
     * @return array{string, string, int}
     */
    private function runProcess(array $command, array $env): array
    {
        $inherited = getenv();
        $pipes = [];
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, array_merge(is_array($inherited) ? $inherited : [], $env));
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [$stdout, $stderr, proc_close($process)];
    }

    private function snippet(string $root): string
    {
        $path = $root.self::SNIPPET;
        $this->assertFileExists($path);

        return (string) file_get_contents($path);
    }
}
