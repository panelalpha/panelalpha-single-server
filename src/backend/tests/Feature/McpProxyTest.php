<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Psr7\Request as GuzzleRequest;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use Psr\Http\Message\StreamInterface;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * `/mcp` and `/mcp/check` are a streaming pass-through to
 * the Engine's MCP server with the client's own Engine token.
 *
 * CA: the Connect AI page tells the user to point the assistant at
 * `<panel>/mcp` (`ConnectAi.vue:150-153`).
 * Engine: `core/app/Mcp/Servers/EngineServer.php:61` (`class EngineServer extends
 * Server`, the `/mcp` server) and
 * `core/app/Http/Controllers/McpTokenController.php:64` (`/mcp/check`). The MCP
 * URL is not read from the Engine: it is the `engine-api-url` origin plus the
 * Engine's `/mcp` path (`core/routes/mcp.php:11`), overridden by the
 * `engine-mcp-url` setting.
 *
 * `/mcp` has no panel session: the Engine validates the bearer token, so the
 * panel must pass an Engine 401 through instead of turning it into its own.
 */
class McpProxyTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
        config(['sanctum.stateful' => []]);
    }

    private function fakeMcp(): void
    {
        // Engine: core/app/Http/Controllers/McpTokenController.php:161 -> check()
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/mcp/check' => Http::response(['valid' => true]),
            'engine.example.com/mcp' => Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]),
        ]);
    }

    public function test_mcp_streams_to_the_engine_with_the_clients_token(): void
    {
        $this->configureEngine();
        $this->fakeMcp();
        $this->ownedMcpBearer(6, secret: 'client-engine-token');

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'], [
            'Authorization' => 'Bearer 6|client-engine-token',
            'Accept' => 'application/json, text/event-stream',
        ]);

        $response->assertOk();
        $this->assertStringContainsString('"jsonrpc"', (string) $response->streamedContent());

        // The Engine MCP server receives the client's token and the client's
        // Accept header (MCP needs `application/json, text/event-stream`) and
        // the JSON-RPC body.
        Http::assertSent(static fn ($request): bool => str_ends_with($request->url(), '/mcp')
            && $request->hasHeader('Authorization', 'Bearer 6|client-engine-token')
            && $request->hasHeader('Accept', 'application/json, text/event-stream')
            && ($request->data()['method'] ?? null) === 'tools/list');
    }

    /**
     * A PSR-7 stream that yields the given chunks, runs `$onRead` before each
     * read and, when `$throwOnRead` is set, throws it at read index `$throwAt`
     * instead of a chunk.
     *
     * @param  list<string>  $chunks
     */
    private function streamBody(array $chunks, ?\Closure $onRead = null, ?\Throwable $throwOnRead = null, int $throwAt = 0): StreamInterface
    {
        return new class($chunks, $onRead, $throwOnRead, $throwAt) implements StreamInterface
        {
            private int $index = 0;

            private bool $raised = false;

            /** @param list<string> $chunks */
            public function __construct(
                private readonly array $chunks,
                private readonly ?\Closure $onRead,
                private readonly ?\Throwable $throwOnRead,
                private readonly int $throwAt,
            ) {}

            public function read(int $length): string
            {
                if ($this->onRead !== null) {
                    ($this->onRead)($this->index);
                }
                if ($this->throwOnRead !== null && $this->index === $this->throwAt) {
                    $this->raised = true;

                    throw $this->throwOnRead;
                }

                return $this->chunks[$this->index++] ?? '';
            }

            public function eof(): bool
            {
                if ($this->throwOnRead !== null && ! $this->raised) {
                    return false;
                }

                return $this->index >= count($this->chunks);
            }

            public function __toString(): string { return implode('', $this->chunks); }
            public function close(): void {}
            public function detach() { return null; }
            public function getSize(): ?int { return null; }
            public function tell(): int { return 0; }
            public function isSeekable(): bool { return false; }
            public function seek(int $offset, int $whence = SEEK_SET): void {}
            public function rewind(): void { $this->index = 0; }
            public function isWritable(): bool { return false; }
            public function write(string $string): int { return 0; }
            public function isReadable(): bool { return true; }
            public function getContents(): string { return $this->__toString(); }
            public function getMetadata(?string $key = null): mixed { return $key === null ? [] : null; }
        };
    }

    public function test_a_streamed_chunk_reaches_the_client_before_the_engine_finishes(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();

        $firstVisibleAtSecondRead = false;
        $flushed = '';
        $body = $this->streamBody(
            ['data: first-event'."\n\n", 'data: second-event'."\n\n"],
            function (int $index) use (&$firstVisibleAtSecondRead, &$flushed): void {
                // Runs on the second Engine read: the panel must already have
                // ob_flush()ed the first chunk out of its output buffer, or it
                // buffered the whole body.
                if ($index === 1) {
                    $firstVisibleAtSecondRead = str_contains($flushed, 'first-event');
                }
            },
        );

        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => Http::response($body, 200, ['Content-Type' => 'text/event-stream']),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call'], [
            'Authorization' => 'Bearer '.$bearer,
        ]);

        $response->assertOk();

        // Capture what the controller flushed while the stream ran: `ob_flush()`
        // invokes this handler for every chunk.
        ob_start(static function (string $buffer) use (&$flushed): string {
            $flushed .= $buffer;

            return '';
        });
        $response->baseResponse->sendContent();
        ob_end_clean();

        $this->assertStringContainsString('data: first-event', $flushed);
        $this->assertStringContainsString('data: second-event', $flushed);
        $this->assertTrue($firstVisibleAtSecondRead, 'The first chunk was not streamed before the Engine produced the second.');
    }

    /**
     * The mid-stream read failures the pass-through must end on: an idle-read
     * timeout (PHP raises `RuntimeException`) and a dropped connection (Guzzle
     * raises a `GuzzleException`).
     *
     * @return array<string, array{\Throwable}>
     */
    public static function midStreamErrors(): array
    {
        return [
            'idle-read timeout' => [new \RuntimeException('cURL error 28: Operation timed out')],
            'dropped connection' => [new ConnectException('Connection reset by peer', new GuzzleRequest('GET', 'https://engine.example.com/mcp'))],
        ];
    }

    #[DataProvider('midStreamErrors')]
    public function test_a_mid_stream_engine_error_ends_the_stream_without_an_error_page(\Throwable $error): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        Exceptions::fake();

        $body = $this->streamBody(["data: first-event\n\n"], null, $error, 1);

        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => Http::response($body, 200, ['Content-Type' => 'text/event-stream']),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call'], [
            'Authorization' => 'Bearer '.$bearer,
        ]);

        $response->assertOk();
        $content = (string) $response->streamedContent();

        // The already-sent SSE frames stay; the broken read must not append a
        // PHP/Engine error page to the event stream.
        $this->assertStringContainsString('data: first-event', $content);
        $this->assertStringNotContainsString('cURL error', $content);
        $this->assertStringNotContainsString('Operation timed out', $content);
        $this->assertStringNotContainsString('Connection reset', $content);
        $this->assertStringNotContainsString('RuntimeException', $content);

        // The catch must report the broken read instead of swallowing it: the
        // status and `text/event-stream` are already on the wire, so the panel
        // cannot surface it to the MCP client and the log is the only trace.
        Exceptions::assertReported($error::class);
    }

    public function test_the_mcp_stream_has_no_total_timeout_and_an_idle_read_timeout(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();

        $options = null;
        // Engine: core/app/Http/Controllers/SystemController.php:51 -> info() mcp_url
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => function ($request, array $given) use (&$options) {
                $options = $given;

                // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
                return Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]);
            },
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();

        // A total transfer timeout cuts an idle SSE stream (the pre-fix
        // `engine_timeout` 30 s); an open MCP stream must carry none, while the
        // idle read timeout matches nginx's 1800 s (`proxy_read_timeout` /
        // `fastcgi_read_timeout` in src/config/nginx.conf).
        $this->assertIsArray($options);
        $this->assertSame(0, $options['timeout'] ?? null);
        $this->assertSame(1800, $options['read_timeout'] ?? null);
        // A refused connect to the Engine origin must fail fast instead of
        // holding the MCP client for the cURL default 60 s.
        // Pinned as a literal, not against its own constant, so a changed value
        // is caught.
        $this->assertSame(5, EngineClient::MCP_CONNECT_TIMEOUT_SECONDS);
        $this->assertSame(5, $options['connect_timeout'] ?? null);
    }

    public function test_mcp_without_a_configured_engine_is_503(): void
    {
        $bearer = $this->ownedMcpBearer();
        // The MCP URL is derived from `engine-api-url`;
        // without that setting there is no endpoint at all, so the CA gets the
        // documented 503, never a 500.
        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
            ->assertStatus(503);
    }

    public function test_mcp_check_proxies_to_the_engine_check(): void
    {
        $this->configureEngine();
        $this->fakeMcp();
        $bearer = $this->ownedMcpBearer();

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->getJson('/mcp/check', ['Authorization' => 'Bearer '.$bearer]);

        $response->assertOk();
        $this->assertStringContainsString('"valid":true', str_replace(' ', '', (string) $response->streamedContent()));

        Http::assertSent(static fn ($request): bool => str_ends_with($request->url(), '/mcp/check')
            && $request->hasHeader('Authorization', 'Bearer '.$bearer));
    }

    public function test_mcp_passes_a_down_engine_through_as_503(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => fn () => throw new ConnectionException('down'),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
            ->assertStatus(503);
    }

    public function test_mcp_is_rate_limited(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        $this->fakeMcp();

        for ($i = 0; $i < 60; $i++) {
            // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
            $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
                ->assertOk();
        }

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
            ->assertStatus(429);
    }

    public function test_mcp_is_rate_limited_per_ip_when_the_bearer_rotates(): void
    {
        $this->configureEngine();
        $this->fakeMcp();
        $user = User::factory()->create();
        $bearers = array_map(fn (int $id): string => $this->ownedMcpBearer($id, $user), range(1, 61));

        // Rotating the bearer must not reset the bucket: the limiter also keys
        // on the real client IP.
        for ($i = 0; $i < 60; $i++) {
            // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
            $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
                'Authorization' => 'Bearer '.$bearers[$i],
                'X-Forwarded-For' => TestNetwork::public(9),
            ])->assertOk();
        }

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
            'Authorization' => 'Bearer '.$bearers[60],
            'X-Forwarded-For' => TestNetwork::public(9),
        ])->assertStatus(429);
    }

    public function test_mcp_rate_limit_is_scoped_to_the_forwarded_client_ip(): void
    {
        $this->configureEngine();
        $this->fakeMcp();
        $clientA = $this->ownedMcpBearer(1);
        $clientB = $this->ownedMcpBearer(2);

        for ($i = 0; $i < 60; $i++) {
            // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
            $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
                'Authorization' => 'Bearer '.$clientA,
                'X-Forwarded-For' => TestNetwork::public(9),
            ])->assertOk();
        }

        // A different client behind the same container nginx keeps its own
        // bucket: the trusted proxy makes `$request->ip()` the forwarded address
        //Without it both would share LOOPBACK and this
        // request would be 429.
        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
            'Authorization' => 'Bearer '.$clientB,
            'X-Forwarded-For' => TestNetwork::public(10),
        ])->assertOk();
    }

    public function test_mcp_is_rate_limited_per_token_across_client_ips(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        $this->fakeMcp();

        // The per-token limit sits next to the per-IP one: one
        // token spread over many client IPs still hits its own 60/min bucket,
        // while every IP sees only one request.
        for ($i = 1; $i <= 60; $i++) {
            // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
            $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
                'Authorization' => 'Bearer '.$bearer,
                'X-Forwarded-For' => '198.51.100.'.$i,
            ])->assertOk();
        }

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], [
            'Authorization' => 'Bearer '.$bearer,
            'X-Forwarded-For' => TestNetwork::public2(61),
        ])->assertStatus(429);
    }

    public function test_the_mcp_url_is_derived_from_the_engine_api_origin(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/mcp' => Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();

        // The Engine advertises a public mcp_url a tenant cannot reach; the panel
        // rebuilds it on `engine-api-url`'s origin and
        // spends no `system/info` read on it.
        Http::assertSent(static fn ($request): bool => $request->url() === 'https://engine.example.com/mcp');
        $this->assertCount(0, Http::recorded(static fn ($request): bool => str_contains($request->url(), '/api/system/info')));
    }

    public function test_the_engine_mcp_url_override_wins(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // The `engine-mcp-url` setting overrides the derivation; the host maps
        // it onto the package config key.
        config(['client-area.mcp_url' => 'https://engine.example.com/custom-mcp']);
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/custom-mcp' => Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();

        Http::assertSent(static fn ($request): bool => $request->url() === 'https://engine.example.com/custom-mcp');
    }

    public function test_the_engine_mcp_url_setting_maps_onto_the_package_config(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // The operator sets `engine-mcp-url` with `settings:set`; the host app
        // maps it onto `client-area.mcp_url`, which `McpApi::mcpUrl()`
        // reads. Re-run the provider boot the way a
        // fresh worker does, so the setting -> config mapping is really
        // exercised and not only the package config key.
        Setting::set('engine-mcp-url', 'https://engine.example.com/setting-mcp');
        $provider = $this->app->getProvider(AppServiceProvider::class);
        $this->assertNotNull($provider);
        $provider->boot();

        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/setting-mcp' => Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();

        Http::assertSent(static fn ($request): bool => $request->url() === 'https://engine.example.com/setting-mcp');
    }

    public function test_an_mcp_connect_failure_does_not_open_the_engine_api_breaker(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // Engine: core/app/Http/Controllers/SystemController.php:51 -> info() mcp_url
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => function (): void {
                // A real connect failure: cURL 7 never completed the TCP connect.
                throw new ConnectionException('cURL error 7', 0, new ConnectException(
                    'cURL error 7',
                    new GuzzleRequest('POST', 'https://engine.example.com/mcp'),
                    null,
                    ['errno' => 7, 'connect_time' => 0.0],
                ));
            },
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
            ->assertStatus(503);

        // The MCP server is not the Engine API: its failure must not suppress
        // the panel's API jobs.
        $this->assertFalse(app(EngineHealth::class)->isDown(EngineConnection::DEFAULT_ID));
    }

    public function test_mcp_copies_the_engine_content_type_and_session_header(): void
    {
        $this->configureEngine();
        $bearer = $this->ownedMcpBearer();
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => Http::response(
                '{"jsonrpc":"2.0","id":1,"result":[]}',
                200,
                ['Content-Type' => 'text/event-stream', 'Mcp-Session-Id' => 'engine-session-42'],
            ),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'initialize'], [
            'Authorization' => 'Bearer '.$bearer,
            'Accept' => 'application/json, text/event-stream',
        ]);

        $response->assertOk();
        // The MCP Streamable HTTP transport needs the Engine's content type (SSE)
        // and session id back.
        $this->assertStringContainsString('text/event-stream', (string) $response->headers->get('Content-Type'));
        $this->assertSame('engine-session-42', $response->headers->get('Mcp-Session-Id'));
    }

    public function test_mcp_passes_an_engine_401_through(): void
    {
        $this->configureEngine();
        // A token the panel minted, with a wrong secret: the gate passes it on
        // and the Engine, which checks the secret, refuses it.
        $bearer = $this->ownedMcpBearer(6, secret: 'wrong-secret');
        // The Engine's mcp.auth middleware refuses a bad bearer token with 401.
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['mcp_url' => 'https://engine.example.com/mcp']]),
            'engine.example.com/mcp*' => Http::response(['message' => 'Unauthenticated.'], 401),
        ]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])
            ->assertStatus(401);
    }
}
