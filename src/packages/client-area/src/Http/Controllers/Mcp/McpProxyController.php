<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Mcp;

use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\ClientArea\Mcp\McpGate;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Connect AI's MCP server. The CA builds `<panel>/mcp`
 * client-side (`ConnectAi.vue:150-153`), so the panel serves it and streams each
 * request to the Engine's own MCP server (`McpApi::mcpUrl()`: the configured
 * `engine-api-url` origin plus `/mcp`, or the `engine-mcp-url` override) with the
 * client's Engine token.
 *
 * It is a gatekeeper too: only a token the panel
 * minted for an existing user is forwarded (`McpGate`), to the Engine that
 * holds it; anything else is a 401
 * `{"message":"Unauthenticated."}` with `WWW-Authenticate: Bearer` and no Engine
 * call. The Engine still checks the secret, revocation and the project scope.
 *
 * The body is never buffered: the Engine's status, `Content-Type` (SSE) and
 * `Mcp-Session-Id` are copied, then the body is read and echoed chunk by chunk
 * as it arrives, so a streamed chunk reaches the client before the Engine
 * finishes. Like the token routes it is reached only through `routes/mcp.php`,
 * loaded in every edition.
 *
 * Engine: `core/app/Mcp/Servers/EngineServer.php:61` (`class EngineServer extends
 * Server`, registered as the `/mcp` server by `core/routes/mcp.php:11`) and
 * `core/app/Http/Controllers/McpTokenController.php:64` (`/mcp/check`).
 */
final class McpProxyController extends Controller
{
    /** Request headers an MCP client sends and the Engine needs upstream. */
    private const FORWARD_REQUEST_HEADERS = [
        'Content-Type',
        'Accept',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
        'Last-Event-ID',
    ];

    /** Response headers the MCP transport needs back (SSE content type, session id). */
    private const FORWARD_RESPONSE_HEADERS = [
        'Content-Type',
        'Mcp-Session-Id',
        'Cache-Control',
    ];

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly McpGate $gate,
    ) {}

    /** `POST /mcp` – JSON-RPC over the Streamable HTTP transport. */
    public function handle(Request $request): Response
    {
        return $this->forward($request, 'POST');
    }

    /** `GET /mcp/check` – validate the calling MCP bearer token. */
    public function check(Request $request): Response
    {
        return $this->forward($request, 'GET', '/check');
    }

    private function forward(Request $request, string $method, string $suffix = ''): Response
    {
        // The Engine that holds the bearer's token: Community and
        // Pro have one; in Multi each token lives on its user's token Engine.
        $engineId = $this->gate->engineFor($request->bearerToken());
        if ($engineId === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401, ['WWW-Authenticate' => 'Bearer']);
        }

        $response = $this->api($engineId)->proxyMcp($method, Payload::string($request->bearerToken()), [
            'body' => $request->getContent(),
            'headers' => $this->requestHeaders($request),
        ], $suffix);

        $headers = [];
        foreach (self::FORWARD_RESPONSE_HEADERS as $name) {
            $value = $response->header($name);
            if ($value !== '') {
                $headers[$name] = $value;
            }
        }

        // Read the Engine's Guzzle stream lazily and echo each chunk, so the
        // response is passed through rather than held back until the Engine
        // closes.
        $body = $response->toPsrResponse()->getBody();

        return response()->stream(function () use ($body): void {
            try {
                while (! $body->eof()) {
                    $chunk = $body->read(8192);
                    if ($chunk === '') {
                        continue;
                    }

                    echo $chunk;
                    // PHP-FPM buffers the script output (`output_buffering = 4096`
                    // in the image), so `flush()` alone still holds an SSE frame
                    // until the whole stream ends. Flush the output buffer first.
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }
            } catch (GuzzleException|\RuntimeException $e) {
                // The status and `text/event-stream` are already on the wire, so a
                // mid-stream Engine read timeout or a dropped connection must end
                // the stream - never append an error page to the SSE body.
                report($e);
            }
        }, $response->status(), $headers);
    }

    /**
     * @return array<string, string>
     */
    private function requestHeaders(Request $request): array
    {
        $headers = [];
        foreach (self::FORWARD_REQUEST_HEADERS as $name) {
            $value = $request->header($name);
            if (is_string($value) && $value !== '') {
                $headers[$name] = $value;
            }
        }

        return $headers;
    }

    /**
     * The `engine-mcp-url` override names the panel's own Engine's MCP server;
     * another Engine's is derived from its own API URL.
     */
    private function api(int $engineId): McpApi
    {
        $override = $engineId === $this->engines->defaultEngineId() ? Payload::nullableString(config('client-area.mcp_url')) : null;

        return new McpApi($this->engines->forEngine($engineId), $override);
    }
}
