<?php

namespace Tests\Feature;

use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The backend server (:82) is an internal hop that only the
 * container nginx may reach. It used to `listen 82` on every interface and
 * `docker-compose.yml` published `9082:82`, so a client on the Docker network
 * could bypass the front server's routing. The server now binds the IPv4
 * loopback address and the host mapping is gone; the front servers on 80/81
 * keep proxying to it.
 *
 * It must **not** bind `[::1]:82`. On a host with IPv6 disabled
 * (`ipv6.disable=1`, `net.ipv6.conf.all.disable_ipv6=1`) that bind fails with
 * `Cannot assign requested address` and nginx refuses to start, and the front
 * upstreams must not use `localhost` (which may resolve to `::1` first). The
 * real image proves it: `backend/scripts/check-container-config.sh` starts its
 * container with IPv6 disabled, so every probe runs with only the IPv4 loopback.
 *
 * @see src/config/nginx.conf
 * @see src/docker-compose.yml
 * @see src/backend/scripts/check-container-config.sh
 */
class BackendLoopbackTest extends TestCase
{
    public function test_the_backend_server_binds_only_ipv4_loopback(): void
    {
        $server = $this->serverBlock(82);

        $this->assertStringContainsString('listen '.TestNetwork::LOOPBACK.':82 default_server;', $server);
        // No IPv6 loopback bind. Where IPv6 is disabled that bind
        // fails (bind() to [::1]:82, EADDRNOTAVAIL) and nginx refuses to start.
        $this->assertStringNotContainsString('listen [::1]:82', $server);
        // No wildcard bind may come back: that is what made :82 reachable from
        // the docker gateway.
        $this->assertStringNotContainsString('listen 82 default_server;', $server);
        $this->assertStringNotContainsString('listen '.TestNetwork::ANY.':82', $server);
        $this->assertStringNotContainsString('listen [::]:82', $server);
    }

    public function test_the_backend_port_is_not_published(): void
    {
        $compose = (string) file_get_contents(base_path('../docker-compose.yml'));

        $this->assertStringNotContainsString('9082:82', $compose);
        // The front server stays published; the Admin Area server (:81) is gone.
        $this->assertStringContainsString('9080:80', $compose);
        $this->assertStringNotContainsString('9081:81', $compose);
    }

    public function test_the_front_servers_proxy_to_the_ipv4_loopback(): void
    {
        // The loopback bind must not break the intended clients: both front
        // servers proxy `/api` to the backend, on the IPv4
        // loopback - `localhost` may resolve to ::1 first, which is gone when
        // IPv6 is disabled.
        foreach ([80] as $port) {
            $server = $this->serverBlock($port);
            $this->assertStringContainsString('proxy_pass http://'.TestNetwork::LOOPBACK.':82/api;', $server, "Server {$port} must proxy /api to the IPv4 backend loopback.");
        }
        // Every front proxy_pass uses the IPv4 loopback; none uses localhost.
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $this->assertStringNotContainsString('localhost:82', $nginx);
    }

    /**
     * The config between `server {` and the next top-level server block for one
     * listen port. The backend server (82) binds the IPv4 loopback address, so
     * match `:<port>` as well as a bare `listen <port>`.
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
