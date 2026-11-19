<?php

namespace Tests\Feature;

use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The CA builds `<panel>/mcp`
 * (ConnectAi.vue:150-153), so the edge nginx must route `/mcp` and
 * `/mcp/check` to the backend and must not buffer their responses – a
 * buffered proxy would hold the Streamable HTTP / SSE body until the Engine
 * closes, which is exactly what the pass-through must avoid.
 *
 * `nginx.conf` is a static file, so this test pins the wiring; the real image's
 * `nginx -t` is proven by `scripts/check-container-config.sh`.
 */
class McpNginxRoutingTest extends TestCase
{
    public function test_the_client_area_server_routes_mcp_to_the_backend_with_buffering_off(): void
    {
        $server = $this->serverBlock(80);

        foreach (['/mcp', '/mcp/check'] as $path) {
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*proxy_buffering off;~s',
                $server,
                "Server 80 must route {$path} to the backend with proxy_buffering off.",
            );
            // The idle read timeout must match EngineClient's MCP read timeout
            //Or nginx cuts the stream before php does/the other
            // way around.
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*proxy_read_timeout 1800s;~s',
                $server,
                "Server 80 must give {$path} the 1800s read timeout.",
            );
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*proxy_pass http://'.TestNetwork::LOOPBACK.':82;~s',
                $server,
                "Server 80 must proxy {$path} to the IPv4 backend loopback on port 82.",
            );
        }
    }

    public function test_the_backend_server_streams_mcp_without_fastcgi_buffering(): void
    {
        $server = $this->serverBlock(82);

        foreach (['/mcp', '/mcp/check'] as $path) {
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*fastcgi_buffering off;~s',
                $server,
                "Server 82 must serve {$path} with fastcgi_buffering off.",
            );
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*fastcgi_read_timeout 1800s;~s',
                $server,
                "Server 82 must give {$path} the 1800s read timeout.",
            );
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*fastcgi_pass unix:/var/run/php/php8\.5-fpm-stream\.sock;~s',
                $server,
                "Server 82 must pass {$path} to the dedicated [stream] php-fpm pool.",
            );
        }
    }

    /**
     * The config between `server {` and the next top-level server block for one
     * listen port. The backend server (82) binds the loopback addresses
     *So match `:<port>` as well as a bare `listen <port>`.
     */
    private function serverBlock(int $port): string
    {
        foreach (explode('    server {', (string) file_get_contents(base_path('../config/nginx.conf'))) as $chunk) {
            if (str_contains($chunk, ':'.$port.' default_server;') || str_contains($chunk, 'listen '.$port.' default_server;')) {
                return $chunk;
            }
        }

        $this->fail("nginx.conf must define a server on port {$port}.");
    }
}
