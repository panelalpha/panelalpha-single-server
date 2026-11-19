<?php

namespace Tests\Feature\ClientArea\Hosting;

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use PHPUnit\Framework\Attributes\DataProvider;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionNamedType;
use SplFileInfo;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The long request-path
 * Engine calls stay on the request path (the CA consumes their response) while
 * the Engine work may run up to EngineClient::LONG_TIMEOUT_SECONDS = 1700, with
 * a project show and a create after the delete on the retry path. entrypoint.sh
 * runs backend/scripts/write-long-call-timeouts.sh at container start so nginx
 * and a dedicated `[long]` php-fpm pool allow the whole route, while the default
 * `www` pool keeps its defaults and a fast GET/PUT stays on it. This test
 * executes the **entrypoint block** against a temp root and asserts the
 * generated files (never the script text).
 *
 * The request-path long calls are **discovered** from the source: every real
 * `EngineClient::LONG_TIMEOUT_SECONDS` use outside `Jobs/` (a queued long job
 * passes its own `$timeout` and is not covered by the snippet) is mapped to the
 * route action that triggers it, so a new long call cannot be added without a
 * location and an extra location fails.
 *
 * @see src/entrypoint.sh (long-call timeouts block)
 * @see src/backend/scripts/write-long-call-timeouts.sh
 * @see src/config/nginx.conf (include /etc/nginx/snippets/panelalpha-long-call.conf;)
 */
class LongCallTimeoutsTest extends TestCase
{
    /** The Engine per-call timeout the generated value must exceed. */
    private const ENGINE_LONG_TIMEOUT_SECONDS = 1700;

    /** Asserted literally so a wrong generated value fails here (another test pins the constant too). */
    private const GENERATED_TIMEOUT_SECONDS = 1800;

    /** The dedicated long-call pool socket. */
    private const LONG_SOCKET = '/var/run/php/php8.5-fpm-long.sock';

    /** The default pool a fast read/write of an ambiguous path must stay on. */
    private const WWW_SOCKET = '/var/run/php/php8.5-fpm.sock';

    /** The dedicated stream pool socket. */
    private const STREAM_SOCKET = '/var/run/php/php8.5-fpm-stream.sock';

    /** What the last run of the block wrote to stderr. */
    private string $lastStderr = '';

    /**
     * Package-split seams move a request-path long call out of
     * the service the controller injects into a seam implementation. Map the
     * extracted class back to the class the controller reaches it through, so
     * the route lookup still proves the call has a location.
     *
     * @var array<class-string, class-string>
     */
    private const SEAM_CALLERS = [
        \PanelAlpha\ClientArea\Projects\DeleteAndRecreateStagingRetrier::class
            => \PanelAlpha\ClientArea\Projects\StagingService::class,
    ];

    /**
     * One case per discovered request-path long call so a missing location on
     * one route does not hide the others.
     *
     * @return array<string, array{string, string}>
     */
    public static function longCallSiteProvider(): array
    {
        $provider = [];
        foreach (self::discoverLongCallSites() as $site => $location) {
            $provider[$site] = [$site, $location];
        }

        return $provider;
    }

    /**
     * The real `EngineClient::LONG_TIMEOUT_SECONDS` uses outside `Jobs/`, with
     * the enclosing class and method (the queued long jobs are excluded).
     *
     * @return array<string, string> "FQCN::method" => "path:line"
     */
    private static function discoverLongCallSites(): array
    {
        $backend = dirname(__DIR__, 4);
        $package = dirname($backend).'/packages/client-area/src';
        $roots = [$backend.'/app', $package, dirname($backend).'/packages/client-area-legacy/src'];

        $sites = [];
        foreach ($roots as $root) {
            if (! is_dir($root)) {
                continue;
            }

            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS)
            );

            foreach ($files as $file) {
                if (! $file instanceof SplFileInfo || $file->getExtension() !== 'php') {
                    continue;
                }
                $path = $file->getPathname();
                // Queued long jobs pass their own $timeout; the EngineClient
                // file holds the declaration, not a call.
                if (str_contains($path, '/Jobs/') || $path === $package.'/Engine/EngineClient.php') {
                    continue;
                }

                $namespace = '';
                $class = '';
                $method = '';
                foreach (file($path) ?: [] as $index => $line) {
                    if (preg_match('/^namespace\s+([^;]+);/', $line, $m) === 1) {
                        $namespace = trim($m[1]);
                    }
                    if (preg_match('/\bclass\s+(\w+)/', $line, $m) === 1) {
                        $class = $m[1];
                    }
                    if (preg_match('/function\s+(\w+)\s*\(/', $line, $m) === 1) {
                        $method = $m[1];
                    }

                    $trimmed = ltrim($line);
                    if (str_starts_with($trimmed, '//') || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '*') || str_starts_with($trimmed, '/*')) {
                        continue;
                    }
                    if (str_contains($line, 'LONG_TIMEOUT_SECONDS')) {
                        $sites[$namespace.'\\'.$class.'::'.$method] = $path.':'.($index + 1);
                    }
                }
            }
        }

        ksort($sites);

        return $sites;
    }

    #[DataProvider('longCallSiteProvider')]
    public function test_every_request_path_long_call_has_a_route_scoped_location(string $site, string $location): void
    {
        $routes = $this->routesForSite($site);
        $this->assertNotEmpty($routes, "{$site} ({$location}) is not reached by any route action.");

        $root = $this->runEntrypointBlock();
        $proxy = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf');
        $backend = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf');

        // Both servers that can receive the route carry its location.
        foreach ($routes as $uri => $route) {
            $sample = $this->sampleUri($uri);
            $this->assertNotSame('', $this->matchingLocation($proxy, $sample), "The proxy snippet has no location for {$uri} ({$location}).");
            $this->assertNotSame('', $this->matchingLocation($backend, $sample), "The backend snippet has no location for {$uri} ({$location}).");
        }
    }

    #[DataProvider('longCallSiteProvider')]
    public function test_each_long_location_repeats_its_server_handler(string $site, string $location): void
    {
        $routes = $this->routesForSite($site);
        $this->assertNotEmpty($routes, "{$site} ({$location}) is not reached by any route action.");

        $root = $this->runEntrypointBlock();
        $proxySnippet = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf');
        $backendSnippet = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf');

        foreach ($routes as $uri => $route) {
            $sample = $this->sampleUri($uri);

            // A regex `location` wins over the prefix `/api` (80/81) or `/`
            // (82) location, so it must repeat that server's pass directive,
            // forwarded headers and SCRIPT_FILENAME; without them nginx serves a
            // static 404 or php-fpm cannot find the front controller.
            $proxy = $this->locationBlock($proxySnippet, $this->matchingLocation($proxySnippet, $sample));
            $this->assertStringContainsString('proxy_read_timeout '.self::GENERATED_TIMEOUT_SECONDS.'s;', $proxy);
            $this->assertStringContainsString('proxy_pass http://'.TestNetwork::LOOPBACK.':82;', $proxy);
            foreach (['Host $host', 'X-Real-IP $remote_addr', 'REMOTE_ADDR $remote_addr', 'X-Forwarded-For $remote_addr', 'X-Forwarded-Host $server_name'] as $header) {
                $this->assertStringContainsString('proxy_set_header '.$header.';', $proxy);
            }

            $backend = $this->locationBlock($backendSnippet, $this->matchingLocation($backendSnippet, $sample));
            $this->assertStringContainsString('fastcgi_read_timeout '.self::GENERATED_TIMEOUT_SECONDS.'s;', $backend);
            $this->assertStringContainsString('fastcgi_pass unix:'.self::LONG_SOCKET.';', $backend);
            $this->assertStringContainsString('include /etc/nginx/fastcgi_params;', $backend);
            $this->assertStringContainsString('fastcgi_param SCRIPT_FILENAME $realpath_root/index.php;', $backend);
            $this->assertStringContainsString('fastcgi_param SCRIPT_NAME /index.php;', $backend);
        }
    }

    public function test_the_generated_locations_only_cover_discovered_long_callers(): void
    {
        // An extra hand-written location that no LONG_TIMEOUT_SECONDS caller
        // outside Jobs/ owns fails here.
        $expected = [];
        foreach (self::discoverLongCallSites() as $site => $location) {
            foreach ($this->routesForSite($site) as $uri => $route) {
                $expected[] = $this->sampleUri($uri);
            }
        }
        $this->assertNotEmpty($expected);

        $root = $this->runEntrypointBlock();
        foreach (['panelalpha-long-call.conf', 'panelalpha-long-call-backend.conf'] as $name) {
            $snippet = $this->read($root.'/etc/nginx/snippets/'.$name);
            foreach ($this->locationRegexes($snippet) as $regex) {
                $matched = false;
                foreach ($expected as $sample) {
                    if (preg_match(';'.$regex.';', $sample) === 1) {
                        $matched = true;
                        break;
                    }
                }
                $this->assertTrue($matched, "{$name} location {$regex} matches no LONG_TIMEOUT_SECONDS caller outside Jobs/.");
            }
        }
    }

    public function test_the_entrypoint_block_generates_route_scoped_timeouts(): void
    {
        $root = $this->runEntrypointBlock();

        // The PHP headroom is a dedicated [long] pool, not a global ini: the
        // default www pool keeps the defaults so a long call cannot starve
        // normal requests.
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/fpm/conf.d/99-panelalpha-timeouts.ini');
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/cli/conf.d/99-panelalpha-timeouts.ini');
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-timeouts.conf');

        $pool = $this->read($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-long.conf');
        $this->assertMatchesRegularExpression('/^\[long\]$/m', $pool);
        $this->assertStringContainsString('listen = '.self::LONG_SOCKET, $pool);
        // php-fpm only chowns the socket when listen.owner/listen.group are set;
        // without them it stays root:root and nginx (www-data) gets EACCES -> 502
        // on the long write routes.
        $this->assertStringContainsString('listen.owner = www-data', $pool);
        $this->assertStringContainsString('listen.group = www-data', $pool);
        $this->assertStringContainsString('request_terminate_timeout = '.self::GENERATED_TIMEOUT_SECONDS.'s', $pool);
        $this->assertStringContainsString('php_admin_value[max_execution_time] = '.self::GENERATED_TIMEOUT_SECONDS, $pool);
        // The archive upload pool carries the memory headroom
        // a 256 MB CA-advertised archive needs (pinned literal).
        $this->assertStringContainsString('php_admin_value[memory_limit] = 512M', $pool);

        // nginx gets exactly the four long routes, never an http-wide timeout.
        $nginx = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf');
        // The CA calls the first three through the /instances alias
        // (CA: src/mixins/InstanceActionsMixin.js:298,
        // src/components/modal/CreateStagingModal.vue:313); the files domain step
        // waits for the Engine. upload-files gets its own location.
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/retry-staging/[0-9]+$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/deploy/upload$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/upload-files$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/services/[0-9]+/domains$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/git/connect$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/git/deploy$', $nginx);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/change-branch$', $nginx);
        $this->assertSame(8, substr_count($nginx, 'proxy_read_timeout '.self::GENERATED_TIMEOUT_SECONDS.'s;'));
        $this->assertSame(0, substr_count($nginx, 'fastcgi_read_timeout'));

        $backend = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf');
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/retry-staging/[0-9]+$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/deploy/upload$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/upload-files$', $backend);
        $this->assertStringContainsString('location ~ ^/api/services/[0-9]+/domains$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/git/connect$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/git/deploy$', $backend);
        $this->assertStringContainsString('location ~ ^/api/(projects|instances)/[0-9]+/change-branch$', $backend);
        $this->assertSame(8, substr_count($backend, 'fastcgi_read_timeout '.self::GENERATED_TIMEOUT_SECONDS.'s;'));
        // Every long location passes to the dedicated pool socket.
        $this->assertSame(8, substr_count($backend, 'fastcgi_pass unix:'.self::LONG_SOCKET.';'));

        // The old http-wide conf.d file must not come back.
        $this->assertFileDoesNotExist($root.'/etc/nginx/conf.d/10-panelalpha-long-call.conf');

        $this->assertGreaterThan(self::ENGINE_LONG_TIMEOUT_SECONDS, self::GENERATED_TIMEOUT_SECONDS);
    }

    /**
     * The long-lived `/mcp` pass-through runs on its own
     * php-fpm pool and socket (no total request timeout, no output buffering),
     * so an open SSE stream can never occupy a www worker. The script never
     * writes or replaces the default www pool.
     */
    public function test_the_entrypoint_block_generates_the_fpm_logging_overrides(): void
    {
        // FPM discarded a worker's stdout/stderr, so every
        // web-request failure was invisible. FPM's own error log must go to the
        // container's stderr and every pool must catch the worker output; the
        // package's pool.d/www.conf is never edited (the container check asserts
        // `dpkg --verify php8.5-fpm`), so a later file re-declares only the two
        // [www] directives.
        $root = $this->runEntrypointBlock();

        $logging = $this->read($root.'/etc/php/8.5/fpm/pool.d/zzz-panelalpha-logging.conf');
        $this->assertMatchesRegularExpression('/^\[global\]$/m', $logging);
        $this->assertStringContainsString('error_log = /proc/self/fd/2', $logging);
        $this->assertMatchesRegularExpression('/^\[www\]$/m', $logging);
        $this->assertStringContainsString('catch_workers_output = yes', $logging);
        $this->assertStringContainsString('decorate_workers_output = no', $logging);

        // The package's default pool file is never written or replaced.
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/fpm/pool.d/www.conf');

        foreach (['zz-panelalpha-long.conf', 'zz-panelalpha-stream.conf'] as $name) {
            $pool = $this->read($root.'/etc/php/8.5/fpm/pool.d/'.$name);
            $this->assertStringContainsString('catch_workers_output = yes', $pool, "{$name} must catch worker output");
            $this->assertStringContainsString('decorate_workers_output = no', $pool, "{$name} must keep Laravel's line format");
        }
    }

    public function test_the_entrypoint_block_generates_a_dedicated_stream_pool(): void
    {
        $root = $this->runEntrypointBlock();

        $pool = $this->read($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-stream.conf');
        $this->assertMatchesRegularExpression('/^\[stream\]$/m', $pool);
        $this->assertStringContainsString('listen = '.self::STREAM_SOCKET, $pool);
        $this->assertStringContainsString('listen.owner = www-data', $pool);
        $this->assertStringContainsString('listen.group = www-data', $pool);
        $this->assertMatchesRegularExpression('/^pm\.max_children = 5$/m', $pool);
        // A stream has no total timeout; nginx's 1800 s read timeout is the idle
        // guard, and PHP must not buffer the frames.
        $this->assertStringContainsString('request_terminate_timeout = 0', $pool);
        // PHP's `output_buffering` stays on for the stream pool: the controller's
        // `ob_flush()` is what streams each frame, and the real-image proof must
        // cover that buffering. Disabling it here
        // would make the real-image proof vacuous.
        $this->assertStringNotContainsString('output_buffering', $pool);
        $this->assertStringContainsString('php_admin_value[max_execution_time] = 0', $pool);

        // The default www pool is never written or replaced by the script.
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/fpm/pool.d/www.conf');
        $this->assertFileDoesNotExist($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-www.conf');

        // Both nginx server types that carry /mcp route it; the backend server
        // passes to the [stream] pool.
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        foreach (['/mcp', '/mcp/check'] as $path) {
            $this->assertMatchesRegularExpression(
                '~location = '.preg_quote($path, '~').'\s*\{[^}]*fastcgi_pass unix:'.preg_quote(self::STREAM_SOCKET, '~').';~s',
                $nginx,
                "config/nginx.conf must route {$path} to the [stream] pool.",
            );
        }
    }

    public function test_only_the_long_write_paths_reach_the_long_pool(): void
    {
        $root = $this->runEntrypointBlock();
        $backend = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf');
        // The project-detail location also matches its fast GET/PUT and the
        // services-domains location also matches its fast GET; only the write
        // goes to the long pool and the read/update falls through to www.
        $deleteGate = '/if \(\$request_method = DELETE\) \{\s*fastcgi_pass unix:'.preg_quote(self::LONG_SOCKET, '/').';\s*\}\s*fastcgi_pass unix:'.preg_quote(self::WWW_SOCKET, '/').';/s';
        $postGate = '/if \(\$request_method = POST\) \{\s*fastcgi_pass unix:'.preg_quote(self::LONG_SOCKET, '/').';\s*\}\s*fastcgi_pass unix:'.preg_quote(self::WWW_SOCKET, '/').';/s';

        $this->assertMatchesRegularExpression(
            $deleteGate,
            $this->locationBlock($backend, '^/api/(projects|instances)/[0-9]+$'),
        );
        $this->assertMatchesRegularExpression(
            $postGate,
            $this->locationBlock($backend, '^/api/services/[0-9]+/domains$'),
        );

        // The method-specific locations have no ambiguous fast method.
        foreach (['^/api/(projects|instances)/[0-9]+/retry-staging/[0-9]+$', '^/api/(projects|instances)/upload-files$', '^/api/(projects|instances)/[0-9]+/git/connect$', '^/api/(projects|instances)/[0-9]+/git/deploy$', '^/api/(projects|instances)/[0-9]+/change-branch$'] as $location) {
            $block = $this->locationBlock($backend, $location);
            $this->assertStringNotContainsString('if (', $block);
            $this->assertStringContainsString('fastcgi_pass unix:'.self::LONG_SOCKET.';', $block);
            $this->assertStringNotContainsString('fastcgi_pass unix:'.self::WWW_SOCKET.';', $block);
        }

        // Only two of the four passes are gated; the others are method-specific.
        $this->assertSame(8, substr_count($backend, 'fastcgi_pass unix:'.self::LONG_SOCKET.';'));
        $this->assertSame(2, substr_count($backend, 'fastcgi_pass unix:'.self::WWW_SOCKET.';'));
    }

    public function test_the_script_removes_the_previous_long_call_files(): void
    {
        // An upgraded container may still carry the earlier shape: a global
        // fpm ini, the old [www] pool fragment and the retired http-wide nginx
        // long-call conf.
        $stale = [
            '/etc/php/8.5/fpm/conf.d/99-panelalpha-timeouts.ini',
            '/etc/php/8.5/cli/conf.d/99-panelalpha-timeouts.ini',
            '/etc/php/8.5/fpm/pool.d/zz-panelalpha-timeouts.conf',
            '/etc/nginx/conf.d/10-panelalpha-long-call.conf',
        ];

        $root = $this->runEntrypointBlock([], function (string $root) use ($stale): void {
            foreach ($stale as $file) {
                $path = $root.$file;
                if (! is_dir(dirname($path))) {
                    mkdir(dirname($path), 0777, true);
                }
                file_put_contents($path, "stale\n");
            }
        });

        foreach ($stale as $file) {
            $this->assertFileDoesNotExist($root.$file);
        }
    }

    public function test_the_long_call_documentation_names_the_four_routes(): void
    {
        // Fix stale text: the headroom covers the request-path
        // long calls (five since the archive upload was added), not the
        // teardowns the old text named, and the value is 1800 s, never the
        // retired value. A text guard is the only way to pin a documentation
        // requirement.
        $files = [
            base_path('scripts/write-long-call-timeouts.sh'),
            base_path('../entrypoint.sh'),
            base_path('../config/nginx.conf'),
            __FILE__,
        ];

        // Split so the guard's own literals do not trip its scan.
        $forbidden = ['17'.'60', 'two '.'routes', 'two '.'synchronous Engine', 'two '.'long'];

        foreach ($files as $file) {
            $contents = (string) file_get_contents($file);
            foreach ($forbidden as $needle) {
                $this->assertStringNotContainsString($needle, $contents, $file);
            }
        }
    }

    public function test_the_fragment_honours_the_timeout_override(): void
    {
        $root = $this->runEntrypointBlock(['LONG_CALL_TIMEOUT_SECONDS' => '1900']);

        $this->assertStringContainsString(
            'request_terminate_timeout = 1900s',
            $this->read($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-long.conf'),
        );
        $this->assertStringContainsString(
            'php_admin_value[max_execution_time] = 1900',
            $this->read($root.'/etc/php/8.5/fpm/pool.d/zz-panelalpha-long.conf'),
        );
        $this->assertStringContainsString('proxy_read_timeout 1900s;', $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf'));
        $this->assertStringContainsString('fastcgi_read_timeout 1900s;', $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf'));
    }

    public function test_the_entrypoint_block_wires_the_override_hooks(): void
    {
        $fragment = $this->entrypointBlock();

        // The production default root is `/` and the script lives in the backend
        // image; both stay overridable only for this test.
        $this->assertStringContainsString('LONG_CALL_ROOT="${LONG_CALL_ROOT:-}"', $fragment);
        $this->assertStringContainsString('LONG_CALL_SCRIPT="${LONG_CALL_SCRIPT:-/app/backend/scripts/write-long-call-timeouts.sh}"', $fragment);
    }

    public function test_the_nginx_config_includes_the_snippet_in_every_server(): void
    {
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));

        // 80 proxies to 82 and carries the proxy snippet (the Admin Area server
        // :81 was removed); 82 serves fastcgi and carries the backend snippet,
        // which repeats that server's handler.
        $this->assertSame(1, substr_count($nginx, 'include /etc/nginx/snippets/panelalpha-long-call.conf;'));
        $this->assertSame(1, substr_count($nginx, 'include /etc/nginx/snippets/panelalpha-long-call-backend.conf;'));
    }

    public function test_the_generated_comment_text_survives_the_unquoted_heredocs(): void
    {
        // The heredocs carry the generated values, so they stay unquoted; a
        // backtick in their text then runs as a command at every container
        // start and the comment loses the word. Assert the exact sentences the
        // script writes, not its text.
        $root = $this->runEntrypointBlock();

        $this->assertSame('', trim($this->lastStderr), 'The long-call block printed a shell error at container start.');
        $this->assertStringContainsString(
            '; Web-request errors must reach `docker logs` and the daily file.',
            $this->read($root.'/etc/php/8.5/fpm/pool.d/zzz-panelalpha-logging.conf'),
        );
        $this->assertStringContainsString(
            '# The upstream is the IPv4 loopback, never `localhost` (which may resolve to',
            $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf'),
        );
    }

    public function test_the_generated_nginx_snippet_is_valid(): void
    {
        if (trim((string) shell_exec('command -v nginx 2>/dev/null')) === '') {
            $this->markTestSkipped('nginx is not installed in this image.');
        }

        $root = $this->runEntrypointBlock();
        $conf = $root.'/nginx-test.conf';
        $loopback = TestNetwork::LOOPBACK;
        file_put_contents($conf, <<<CONF
        worker_processes 1;
        error_log $root/nginx-error.log;
        pid $root/nginx.pid;
        events { worker_connections 16; }
        http {
            server {
                listen $loopback:18099;
                include $root/etc/nginx/snippets/panelalpha-long-call.conf;
                location / { return 204; }
            }
            server {
                listen $loopback:18100;
                root $root;
                include $root/etc/nginx/snippets/panelalpha-long-call-backend.conf;
                location / { return 204; }
            }
        }
        CONF);

        exec('nginx -t -c '.escapeshellarg($conf).' 2>&1', $output, $code);
        $this->assertSame(0, $code, implode("\n", $output));
    }

    public function test_the_route_scoped_locations_keep_the_server_handler(): void
    {
        $root = $this->runEntrypointBlock();

        // A regex `location` wins over the prefix `/api` (80/81) or `/` (82)
        // location, so it must repeat that server's pass directive; without it
        // nginx serves a static 404 and the route never reaches the backend.
        $proxy = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call.conf');
        $this->assertSame(8, substr_count($proxy, 'proxy_pass http://'.TestNetwork::LOOPBACK.':82;'));
        $this->assertSame(0, substr_count($proxy, 'fastcgi_pass'));

        $backend = $this->read($root.'/etc/nginx/snippets/panelalpha-long-call-backend.conf');
        $this->assertSame(8, substr_count($backend, 'fastcgi_pass unix:'.self::LONG_SOCKET.';'));
        $this->assertSame(0, substr_count($backend, 'proxy_pass'));
    }

    public function test_the_generated_pool_fragment_is_valid(): void
    {
        $fpm = trim((string) shell_exec('command -v php-fpm8.5 2>/dev/null'));
        if ($fpm === '') {
            $this->markTestSkipped('php-fpm is not installed in this image.');
        }

        $root = $this->runEntrypointBlock();
        $conf = $root.'/php-fpm-test.conf';
        file_put_contents($conf, <<<CONF
        [global]
        error_log = $root/php-fpm-error.log
        include = $root/etc/php/8.5/fpm/pool.d/*.conf
        CONF);

        exec(escapeshellarg($fpm).' -t -y '.escapeshellarg($conf).' 2>&1', $output, $code);
        $this->assertSame(0, $code, implode("\n", $output));
    }

    /**
     * The routes whose action triggers one discovered long call. Every URI the
     * same action answers (the `/projects` route and its `/instances` alias) is
     * returned.
     *
     * @return array<string, Route>
     */
    private function routesForSite(string $site): array
    {
        [$class, $method] = explode('::', $site, 2);
        $class = self::SEAM_CALLERS[$class] ?? $class;

        $routes = [];
        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            $action = $route->getAction('controller');
            if (! is_string($action) || ! str_contains($action, '@')) {
                continue;
            }
            [$controller, $actionMethod] = explode('@', $action, 2);
            if (! class_exists($controller) || ! $this->controllerInjects($controller, $class)) {
                continue;
            }
            $file = (new ReflectionClass($controller))->getFileName();
            if ($file === false) {
                continue;
            }
            $body = $this->actionBody((string) file_get_contents($file), $actionMethod);
            if ($body !== null && str_contains($body, '->'.$method.'(')) {
                $routes[$route->uri()] = $route;
            }
        }

        return $routes;
    }

    private function controllerInjects(string $controller, string $class): bool
    {
        $constructor = (new ReflectionClass($controller))->getConstructor();
        if ($constructor === null) {
            return false;
        }
        foreach ($constructor->getParameters() as $parameter) {
            $type = $parameter->getType();
            if ($type instanceof ReflectionNamedType && ltrim($type->getName(), '?') === $class) {
                return true;
            }
        }

        return false;
    }

    /**
     * The body of one controller action, up to the next method declaration.
     */
    private function actionBody(string $source, string $action): ?string
    {
        $lines = preg_split('/\r?\n/', $source) ?: [];
        $start = null;
        foreach ($lines as $index => $line) {
            if (preg_match('/function\s+'.preg_quote($action, '/').'\s*\(/', $line) === 1) {
                $start = $index;
                break;
            }
        }
        if ($start === null) {
            return null;
        }

        $body = [];
        for ($index = $start + 1; $index < count($lines); $index++) {
            if (preg_match('/^ {4}(?:public|protected|private|final|static)\b.*function\s+\w+\s*\(/', $lines[$index]) === 1) {
                break;
            }
            $body[] = $lines[$index];
        }

        return implode("\n", $body);
    }

    /**
     * A concrete request path for a route URI (`{param}` becomes a number).
     */
    private function sampleUri(string $uri): string
    {
        return '/'.preg_replace('/\{[^}]+\}/', '1', $uri);
    }

    /**
     * The first `location ~ <regex>` in a snippet that matches a sample path.
     */
    private function matchingLocation(string $snippet, string $sample): string
    {
        foreach ($this->locationRegexes($snippet) as $regex) {
            if (preg_match(';'.$regex.';', $sample) === 1) {
                return $regex;
            }
        }

        return '';
    }

    /**
     * @return list<string>
     */
    private function locationRegexes(string $snippet): array
    {
        preg_match_all('/^location\s+~\s+(\S+)\s*\{/m', $snippet, $matches);

        return array_values($matches[1]);
    }

    /**
     * The body of one `location ~ <regex> { … }` block, or '' when absent.
     */
    private function locationBlock(string $snippet, string $location): string
    {
        if ($location === '') {
            return '';
        }
        $matched = preg_match(
            '/location ~ '.preg_quote($location, '/').'\s*\{(.*?)\n\}/s',
            $snippet,
            $matches,
        );

        return $matched === 1 ? $matches[1] : '';
    }

    private function read(string $path): string
    {
        $this->assertFileExists($path, "The block did not generate {$path}.");
        $contents = file_get_contents($path);
        $this->assertIsString($contents);

        return trim($contents);
    }

    /**
     * The long-call block of entrypoint.sh, runnable on its own.
     */
    private function entrypointBlock(): string
    {
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- long-call timeouts: start ---(.*?)# --- long-call timeouts: end ---/s', $script, $matches),
            'entrypoint.sh must keep the long-call markers for this test',
        );

        return $matches[1];
    }

    /**
     * @param  array<string, string>  $env
     * @param  (callable(string): void)|null  $seed  pre-create stale files in the temp root
     * @return string the temp root
     */
    private function runEntrypointBlock(array $env = [], ?callable $seed = null): string
    {
        $root = sys_get_temp_dir().'/panelalpha-long-call-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);
        if ($seed !== null) {
            $seed($root);
        }

        $fragment = $root.'/fragment.sh';
        file_put_contents($fragment, "#!/bin/bash\nset -e\n".$this->entrypointBlock());

        $inherited = getenv();
        $pipes = [];
        $environment = array_merge(is_array($inherited) ? $inherited : [], [
            'LONG_CALL_ROOT' => $root,
            'LONG_CALL_SCRIPT' => base_path('scripts/write-long-call-timeouts.sh'),
        ], $env);

        $process = proc_open(
            ['bash', $fragment],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            $environment,
        );
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        $this->lastStderr = $stderr;
        fclose($pipes[1]);
        fclose($pipes[2]);
        $this->assertSame(0, proc_close($process), $stdout.$stderr);

        return $root;
    }
}
