<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The panel signs a user in and changes account and project state ("Delete
 * Project", "Change Email Address"), so no other site may frame its pages and
 * no browser may second-guess a response's content type; a panel served over
 * https is pinned to it (HSTS). The set reaches the HTML, the static assets,
 * the `/api` answers and nginx's own error pages, while the `/ws` upgrade stays
 * a tunnel that keeps the upstream's handshake answer.
 *
 * The PHP test image has no nginx, so this class pins the generated snippet and
 * the wiring in `config/nginx.conf`; the real image proves it with `nginx -t`
 * (`check-container-config.sh`) and the live gate runs the same requests.
 *
 * @see src/backend/scripts/write-security-headers.sh
 * @see src/entrypoint.sh (security headers block)
 * @see src/config/nginx.conf (the includes)
 */
final class SecurityHeadersTest extends TestCase
{
    private const string SNIPPET = '/etc/nginx/snippets/panelalpha-security-headers.conf';

    /**
     * @var list<string>
     */
    private const array HEADERS = [
        'add_header X-Frame-Options "DENY" always;',
        'add_header X-Content-Type-Options "nosniff" always;',
        'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    ];

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
    public function test_an_https_url_pins_the_browser_to_https(string $url): void
    {
        $snippet = $this->snippet($this->runScript($url));

        foreach (self::HEADERS as $header) {
            $this->assertStringContainsString($header, $snippet);
        }
        $this->assertStringContainsString('add_header Strict-Transport-Security "max-age=31536000" always;', $snippet);
        $this->assertStringContainsString('APP_URL is https', $snippet);
        // Nothing of APP_URL reaches the file: it only decides whether HSTS is there.
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
            'https only later in the url' => ['http://panel.example.com/https://evil.example.com'],
            'another scheme' => ['ftp://panel.example.com'],
        ];
    }

    #[DataProvider('otherUrls')]
    public function test_any_other_url_sends_the_headers_without_hsts(string $url): void
    {
        $snippet = $this->snippet($this->runScript($url));

        foreach (self::HEADERS as $header) {
            $this->assertStringContainsString($header, $snippet);
        }
        $this->assertStringNotContainsString('Strict-Transport-Security', $snippet);
        $this->assertStringContainsString('APP_URL is not https', $snippet);
    }

    public function test_the_front_server_includes_the_snippet_for_the_server_and_the_cache_locations(): void
    {
        $front = $this->frontServer();
        $include = 'include '.self::SNIPPET.';';

        // The server-level set every location inherits ...
        $server = strpos($front, $include);
        $this->assertNotFalse($server, 'the front server must include the security headers');
        $this->assertLessThan((int) strpos($front, 'location / {'), $server, 'the include must sit in the server, not in a location');

        // ... and the two locations that set their own add_header, which drops it.
        $spa = $this->block($front, 'location / {', 'location /api {');
        $this->assertStringContainsString($include, $spa);
        $this->assertStringContainsString('add_header Cache-Control $panelalpha_spa_cache_control;', $spa);

        $hashed = $this->block($spa, 'location ~ "^/', "\n            }");
        $this->assertStringContainsString('add_header Cache-Control "public, max-age=31536000, immutable";', $hashed);
        $this->assertStringContainsString($include, $hashed);

        // Only the front server: the backend hop on :82 is internal.
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $backend = substr($nginx, (int) strpos($nginx, 'listen '.TestNetwork::LOOPBACK.':82 default_server;'));
        $this->assertStringNotContainsString('panelalpha-security-headers', $backend);
    }

    public function test_the_api_answers_and_the_error_page_inherit_the_headers(): void
    {
        $front = $this->frontServer();

        // No add_header in these locations: they inherit the server's set.
        $locations = [
            'location @panelalpha_json_413 {' => 'location / {',
            'location /api {' => 'location = /mcp {',
            'location = /mcp {' => 'location = /mcp/check {',
            'location = /mcp/check {' => 'location /ws {',
        ];
        foreach ($locations as $from => $to) {
            $this->assertStringNotContainsString('add_header', $this->block($front, $from, $to), "{$from} must inherit the server's set");
        }

        // The proxy block answers with the upstream's headers plus the server's set.
        $api = $this->block($front, 'location /api {', 'location = /mcp {');
        $this->assertStringContainsString('proxy_pass http://'.TestNetwork::LOOPBACK.':82/api;', $api);
    }

    public function test_the_websocket_upgrade_keeps_the_upstream_handshake_answer(): void
    {
        $ws = $this->block($this->frontServer(), 'location /ws {', "\n        }");

        // A location with any add_header replaces the server's set; the empty
        // value writes no header at all.
        $this->assertStringContainsString('add_header X-Panelalpha-None "";', $ws);
        $this->assertStringNotContainsString('panelalpha-security-headers', $ws);
        $this->assertStringContainsString('proxy_set_header Upgrade $http_upgrade;', $ws);
        $this->assertStringContainsString('proxy_set_header Connection $connection_upgrade;', $ws);
    }

    public function test_the_entrypoint_writes_the_snippet_from_the_env_file_app_url(): void
    {
        $env = sys_get_temp_dir().'/panelalpha-env-'.bin2hex(random_bytes(6));
        file_put_contents($env, "APP_NAME=x\nAPP_URL=\"http://old.example.com\"\nAPP_URL=\"https://panel.example.com\"\n");

        [$root, $stdout] = $this->runEntrypointBlock(['APP_URL' => '', 'SECURITY_HEADERS_ENV' => $env]);

        $this->assertStringContainsString('Strict-Transport-Security', $this->snippet($root));
        $this->assertStringContainsString('[bootstrap] security headers: hsts', $stdout);
    }

    public function test_the_entrypoint_environment_wins_over_the_env_file(): void
    {
        $env = sys_get_temp_dir().'/panelalpha-env-'.bin2hex(random_bytes(6));
        file_put_contents($env, "APP_URL=https://panel.example.com\n");

        [$root, $stdout] = $this->runEntrypointBlock(['APP_URL' => 'http://panel.example.com', 'SECURITY_HEADERS_ENV' => $env]);

        $this->assertStringNotContainsString('Strict-Transport-Security', $this->snippet($root));
        $this->assertStringContainsString('[bootstrap] security headers: no hsts', $stdout);
    }

    /**
     * @return string the temp root the script wrote under
     */
    private function runScript(string $url): string
    {
        $root = sys_get_temp_dir().'/panelalpha-headers-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);

        [$stdout, $stderr, $code] = $this->runProcess(['bash', base_path('scripts/write-security-headers.sh'), $root], ['APP_URL' => $url]);
        $this->assertSame(0, $code, $stdout.$stderr);

        return $root;
    }

    /**
     * The security headers block of entrypoint.sh, runnable on its own.
     *
     * @param  array<string, string>  $env
     * @return array{string, string} the temp root and stdout
     */
    private function runEntrypointBlock(array $env): array
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- security headers: start ---(.*?)# --- security headers: end ---/s', $script, $matches),
            'entrypoint.sh must keep the security headers markers for this test',
        );

        $root = sys_get_temp_dir().'/panelalpha-headers-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);
        $fragment = $root.'/fragment.sh';
        file_put_contents($fragment, "#!/bin/bash\nset -e\n".$matches[1]);

        [$stdout, $stderr, $code] = $this->runProcess(['bash', $fragment], array_merge([
            'SECURITY_HEADERS_ROOT' => $root,
            'SECURITY_HEADERS_SCRIPT' => base_path('scripts/write-security-headers.sh'),
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

    /** The front server (the Client Area on :80) of config/nginx.conf. */
    private function frontServer(): string
    {
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $start = strpos($nginx, 'listen 80 default_server;');
        $end = strpos($nginx, 'listen '.TestNetwork::LOOPBACK.':82 default_server;');
        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        return substr($nginx, (int) $start, (int) $end - (int) $start);
    }

    /** The config between two markers of one server block. */
    private function block(string $config, string $from, string $to): string
    {
        $start = strpos($config, $from);
        $this->assertNotFalse($start, "missing {$from}");
        $end = strpos($config, $to, (int) $start);
        $this->assertNotFalse($end, "missing {$to} after {$from}");

        return substr($config, (int) $start, (int) $end - (int) $start);
    }
}
