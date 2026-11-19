<?php

namespace PanelAlpha\EngineClient;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Events\EngineCallFailed;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\Support\Payload;
use Psr\Http\Message\StreamInterface;
use RuntimeException;

/**
 * HTTP client for one Engine. Obtain it from EngineResolver, never construct it
 * from settings yourself – that is what keeps the code edition-agnostic.
 *
 * Paths are relative to the Engine API base (no leading /api), e.g.
 * "projects/all" or EngineProject::enginePath('domains').
 *
 * Every non-2xx answer is turned into an exception (see Exceptions/), so a
 * returned Response is always successful.
 */
class EngineClient
{
    /**
     * Per-call HTTP timeout for synchronous Engine operations that can run for
     * minutes (clone, project delete, wp/* writes). The
     * calling job's `$timeout` must sit above it.
     */
    public const int LONG_TIMEOUT_SECONDS = 1700;

    /**
     * Total HTTP timeout of an ordinary call when neither the client
     * (`withTimeout()`) nor its connection sets one.
     */
    public const int DEFAULT_TIMEOUT_SECONDS = 30;

    /**
     * Idle read timeout for the MCP streaming pass-through. An
     * MCP SSE stream stays open while the assistant waits, so it must not carry
     * the 30 s total `engine_timeout`; this matches the `/mcp` nginx
     * `proxy_read_timeout` / `fastcgi_read_timeout` (src/config/nginx.conf).
     */
    public const int MCP_STREAM_READ_TIMEOUT_SECONDS = 1800;

    /**
     * A connect refusal to the Engine's MCP origin must fail fast:
     * the default cURL connect timeout would hold the MCP
     * client for 60 s. The read stays open for the stream; only the connect is
     * bounded.
     */
    public const int MCP_CONNECT_TIMEOUT_SECONDS = 5;

    /**
     * @param  array<string, mixed>  $query  sent with every call made through send()
     */
    final public function __construct(
        private readonly EngineConnection $connection,
        private readonly ?int $timeout = null,
        private readonly array $query = [],
    ) {}

    public function connection(): EngineConnection
    {
        return $this->connection;
    }

    /**
     * A copy of this client with a longer HTTP timeout, for operations that run
     * WP-CLI for a while (WordPress install/update).
     */
    public function withTimeout(int $seconds): static
    {
        return new static($this->connection, max(1, $seconds), $this->query);
    }

    /**
     * A copy of this client that sends these query parameters with every call,
     * so one API can address one part of a project (e.g. a WordPress install
     * below the document root). A call's own value wins.
     *
     * @param  array<string, mixed>  $query
     */
    public function withQuery(array $query): static
    {
        return new static($this->connection, $this->timeout, $query);
    }

    /**
     * @param  array<string, mixed>  $query
     */
    public function get(string $path, array $query = []): Response
    {
        return $this->send('GET', $path, ['query' => $query]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function post(string $path, array $data = []): Response
    {
        return $this->send('POST', $path, ['json' => $data]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function put(string $path, array $data = []): Response
    {
        return $this->send('PUT', $path, ['json' => $data]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function delete(string $path, array $data = []): Response
    {
        return $this->send('DELETE', $path, ['json' => $data]);
    }

    /**
     * Every project on this Engine (UserResource items: id, username, domain,
     * name, status, staging_of, staging, details, config, domain_names…).
     *
     * @return list<array<string, mixed>>
     */
    public function listProjects(): array
    {
        $data = $this->get('projects/all', ['with_domain_names' => 1])->json('data');

        if (! is_array($data)) {
            throw new EngineRequestException(200, 'Engine API returned an unexpected projects payload.');
        }

        return Payload::objects($data);
    }

    /**
     * @return array<string, mixed>
     */
    public function project(EngineProject $project): array
    {
        return Payload::object($this->get($project->enginePath())->json('data'));
    }

    /**
     * Poll one Engine task: GET /tasks/{id}. Returns the bare TaskResource
     * (`{data: {...}}` unwrapped) with `status`, `logs`, `details`…
     *
     * @return array<string, mixed>
     */
    public function task(int $taskId, int $afterId = 0): array
    {
        $query = $afterId > 0 ? ['after_id' => $afterId] : [];

        return Payload::object($this->get("tasks/{$taskId}", $query)->json('data'));
    }

    /**
     * Stream one Engine task's log lines until it finishes. `GET
     * /tasks/{id}/logs/stream` answers with chunked NDJSON – one JSON object
     * per line, `{type: heartbeat}` frames (skipped) while idle, and a final
     * `{type: finish, status}` frame. Long-lived; prefer the task-polling job.
     *
     * @param  callable(string, array<string, mixed>): void  $onFrame  line/finish frame
     * @return array<string, mixed>  the finish frame, or [] if the Engine stopped early
     */
    public function streamTaskLogs(int $taskId, callable $onFrame, int $afterId = 0): array
    {
        $query = $afterId > 0 ? ['after_id' => $afterId] : [];

        try {
            $response = $this->stream('GET', "tasks/{$taskId}/logs/stream", ['query' => $query]);
        } catch (EngineRequestException $e) {
            // The Engine answers 503 + `Retry-After: 5` when its task-log stream
            // limiter is full (`TaskController::streamLogs`). That is
            // a retryable "Engine busy" answer, so map it to the documented
            // Engine-down 503 instead of the generic 502.
            if ($e->engineStatus === 503) {
                throw EngineUnavailableException::fromStatus(503, $e);
            }

            throw $e;
        }

        return $this->readNdjson($response->toPsrResponse()->getBody(), $onFrame);
    }

    /**
     * Stream a file from the Engine straight to an output stream, forwarding a
     * Range header so a large log can be tailed. The callback receives the
     * Guzzle stream; nothing is buffered in memory.
     *
     * @param  array<string, mixed>  $query   e.g. ['path' => 'public_html/index.php']
     * @param  callable(StreamInterface, Response): void  $sink  gets the open
     *         response too, so the caller can copy its status and Content-* headers
     */
    public function download(string $path, array $query, callable $sink, ?string $range = null): void
    {
        $options = ['query' => $query];

        if ($range !== null && $range !== '') {
            $options['headers'] = ['Range' => $range];
        }

        $response = $this->stream('GET', $path, $options);
        $sink($response->toPsrResponse()->getBody(), $response);
    }

    /**
     * Multipart upload (file field) – e.g. E:/files/upload. The stream from a
     * Client Area upload is forwarded without being buffered on disk.
     *
     * @param  array<string, mixed>  $fields
     * @param  array{name: string, contents: resource|string, filename?: string, headers?: array<string, string>}  $file
     */
    public function upload(string $path, array $fields, array $file): Response
    {
        $multipart = [];

        foreach (array_keys($fields) as $name) {
            $multipart[] = ['name' => (string) $name, 'contents' => $fields[$name]];
        }

        $multipart[] = [
            'name' => 'file',
            'contents' => $file['contents'],
            'filename' => $file['filename'] ?? 'upload',
            'headers' => $file['headers'] ?? [],
        ];

        return $this->send('POST', $path, ['multipart' => $multipart]);
    }

    /**
     * Like send() but keeps the response body as a stream (no decoding, no
     * whole-file buffering) for downloads and NDJSON endpoints.
     *
     * @param  array<string, mixed>  $options
     */
    public function stream(string $method, string $path, array $options = []): Response
    {
        $options['stream'] = true;

        try {
            $response = $this->request()->send($method, ltrim($path, '/'), $options);
        } catch (ConnectionException $e) {
            if ($this->isConnectFailure($e)) {
                app(EngineHealth::class)->open($this->connection->id);
            }

            $this->reportUnreachable($method, $path, $e);

            throw EngineUnavailableException::from($this->connection, $e);
        }

        // A 2xx/4xx answer proves the Engine is reachable again; a 5xx does not.
        if ($response->status() < 500) {
            app(EngineHealth::class)->close($this->connection->id);
        }

        $this->reportFailedAnswer($method, $path, $response);

        return $this->assertSuccessful($response);
    }

    /**
     * Pass-through for the Engine's MCP server. The MCP
     * server is not under the Engine `/api` base, so `$url` is absolute (the
     * Engine's `system/info.mcp_url`); `$token` is the **caller's own** Engine
     * MCP token, forwarded instead of the panel's connection token.
     *
     * The raw streamed Response is returned **without** the non-2xx → exception
     * mapping, so the panel copies the Engine's own 401/422/5xx and headers to
     * the MCP client instead of turning them into a panel error. The body stays
     * a stream (`stream => true`); the caller reads it chunk by chunk.
     *
     * The Engine MCP server is **not** the Engine API: a connect failure here
     * never opens the API circuit breaker the fan-out jobs read, because MCP
     * being down says nothing about `/api`.
     *
     * @param  array<string, mixed>  $options
     */
    public function proxy(string $method, string $url, string $token, array $options = []): Response
    {
        $options['stream'] = true;

        $request = Http::withToken($token)
            ->acceptJson()
            // No total transfer timeout: an idle SSE stream is not a slow
            // request. The idle read timeout is the only panel-side guard, and
            // it matches the nginx `/mcp` read timeout. The MCP
            // server is reached over TLS like the API, so it honours the same
            // pinned certificate.
            ->timeout(0)
            ->withOptions([
                'read_timeout' => self::MCP_STREAM_READ_TIMEOUT_SECONDS,
                'connect_timeout' => self::MCP_CONNECT_TIMEOUT_SECONDS,
                'verify' => $this->verifyOption(),
            ]);

        try {
            return $request->send($method, $url, $options);
        } catch (ConnectionException $e) {
            throw EngineUnavailableException::from($this->connection, $e);
        }
    }

    /**
     * A non-2xx answer becomes an exception: 422 a validation error, the 409
     * `project_protected` a protected-project refusal, anything else an Engine
     * request error (one check for send()/stream()).
     */
    private function assertSuccessful(Response $response): Response
    {
        if ($response->successful()) {
            return $response;
        }

        if ($response->status() === 422) {
            throw EngineValidationException::fromResponse($response);
        }

        // A protected project's refusal is its own type, not the
        // busy 409.
        if (ProjectProtectedException::isRefusal($response)) {
            throw ProjectProtectedException::fromResponse($response);
        }

        throw EngineRequestException::fromResponse($response);
    }

    /**
     * Reads NDJSON frames line by line. `heartbeat` frames are skipped (the
     * Engine sends one every couple of seconds while a task is quiet); the
     * first `finish` frame ends the read and is returned.
     *
     * @param  callable(string, array<string, mixed>): void  $onFrame
     * @return array<string, mixed>
     */
    private function readNdjson(StreamInterface $body, callable $onFrame): array
    {
        $buffer = '';

        while (! $body->eof()) {
            $chunk = $body->read(8192);
            if ($chunk === '') {
                usleep(50_000);
                continue;
            }

            $buffer .= $chunk;

            while (($newline = strpos($buffer, "\n")) !== false) {
                $line = trim(substr($buffer, 0, $newline));
                $buffer = substr($buffer, $newline + 1);

                $frame = $this->decodeFrame($line, $onFrame);
                if ($frame === null) {
                    continue;
                }
                if (($frame['type'] ?? null) === 'finish') {
                    return $frame;
                }
            }
        }

        // A last frame may arrive without a trailing newline.
        $frame = $this->decodeFrame(trim($buffer), $onFrame);

        return is_array($frame) && ($frame['type'] ?? null) === 'finish' ? $frame : [];
    }

    /**
     * @param  callable(string, array<string, mixed>): void  $onFrame
     * @return array<string, mixed>|null
     */
    private function decodeFrame(string $line, callable $onFrame): ?array
    {
        if ($line === '') {
            return null;
        }

        $decoded = json_decode($line, true);
        if (! is_array($decoded)) {
            return null;
        }

        $frame = Payload::object($decoded);
        if (($frame['type'] ?? null) === 'heartbeat') {
            return null;
        }

        $onFrame(Payload::string($frame['type'] ?? 'line'), $frame);

        return $frame;
    }

    /**
     * @param  array<string, mixed>  $options  Guzzle options (query / json / multipart)
     */
    public function send(string $method, string $path, array $options = []): Response
    {
        if ($this->query !== []) {
            $options['query'] = array_replace($this->query, (array) ($options['query'] ?? []));
        }

        try {
            $response = $this->request()->send($method, ltrim($path, '/'), $options);
        } catch (ConnectionException $e) {
            if ($this->isConnectFailure($e)) {
                app(EngineHealth::class)->open($this->connection->id);
            }

            $this->reportUnreachable($method, $path, $e);

            throw EngineUnavailableException::from($this->connection, $e);
        }

        // A 2xx/4xx answer proves the Engine is reachable again; a 5xx does not.
        if ($response->status() < 500) {
            app(EngineHealth::class)->close($this->connection->id);
        }

        $this->reportFailedAnswer($method, $path, $response);

        return $this->assertSuccessful($response);
    }

    /**
     * Tell listeners the Engine could not be reached ({@see EngineCallFailed}).
     */
    private function reportUnreachable(string $method, string $path, ConnectionException $e): void
    {
        $previous = $e->getPrevious();
        $errno = $previous instanceof \GuzzleHttp\Exception\ConnectException
            ? (int) ($previous->getHandlerContext()['errno'] ?? 0)
            : 0;

        Event::dispatch(new EngineCallFailed(
            $this->connection->id,
            strtoupper($method),
            ltrim($path, '/'),
            null,
            $errno === 28,
            $this->isConnectFailure($e),
            $e->getMessage(),
        ));
    }

    /**
     * Tell listeners the Engine answered a non-2xx status ({@see EngineCallFailed}).
     */
    private function reportFailedAnswer(string $method, string $path, Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        $message = Payload::nullableString($response->json('message'));

        Event::dispatch(new EngineCallFailed(
            $this->connection->id,
            strtoupper($method),
            ltrim($path, '/'),
            $response->status(),
            false,
            false,
            $message === null || $message === '' ? 'Engine API request failed with HTTP '.$response->status().'.' : $message,
        ));
    }

    /**
     * Whether a transport failure means the Engine could not be reached. The
     * decision comes from the Guzzle handler context, never the message text:
     * cURL 6/7 (DNS/TCP never connected) and errno 28 whose `connect_time` is 0
     * (nothing was ever connected) are connect failures. A read timeout on a
     * long call means the Engine accepted the connection but answered too
     * slowly, so it is not proof the Engine is down.
     */
    private function isConnectFailure(ConnectionException $e): bool
    {
        $previous = $e->getPrevious();
        if (! $previous instanceof \GuzzleHttp\Exception\ConnectException) {
            return false;
        }

        $context = $previous->getHandlerContext();
        $errno = (int) ($context['errno'] ?? 0);

        if ($errno === 6 || $errno === 7) {
            return true;
        }

        if ($errno !== 28) {
            return false;
        }

        // errno 28 is a timeout: connected (a connect_time or primary_ip) means
        // a read timeout, not an unreachable Engine.
        $connected = (float) ($context['connect_time'] ?? 0) > 0.0
            || (is_string($context['primary_ip'] ?? null) && $context['primary_ip'] !== '');

        return ! $connected;
    }

    private function request(): PendingRequest
    {
        return Http::baseUrl(rtrim($this->connection->url, '/'))
            ->withToken($this->connection->token)
            ->acceptJson()
            ->timeout($this->timeout ?? $this->connection->timeout ?? self::DEFAULT_TIMEOUT_SECONDS)
            ->withOptions(['verify' => $this->verifyOption()]);
    }

    /**
     * Guzzle's `verify` option for this connection: the path of a private copy of
     * the pinned CA certificate, or `true` for the system CA store. There is no
     * `false` – TLS verification is never switched off.
     */
    private function verifyOption(): string|bool
    {
        $pem = $this->connection->caCertificate;
        if ($pem === null || trim($pem) === '') {
            return true;
        }

        $directory = storage_path('app/private/engine-ca');
        $path = $directory.'/engine-'.$this->connection->id.'.pem';

        if (! is_dir($directory) && ! @mkdir($directory, 0700, true) && ! is_dir($directory)) {
            throw new RuntimeException("Unable to create the Engine CA directory [{$directory}].");
        }

        // A changed setting must reach the next call; an unchanged one is left in
        // place so concurrent workers do not rewrite the file on every request.
        $existing = @file_get_contents($path);
        if ($existing !== $pem) {
            $temporary = $path.'.'.bin2hex(random_bytes(6)).'.tmp';
            if (@file_put_contents($temporary, $pem) === false) {
                throw new RuntimeException("Unable to write the Engine CA certificate to [{$temporary}].");
            }
            @chmod($temporary, 0600);
            if (! @rename($temporary, $path)) {
                @unlink($temporary);

                throw new RuntimeException("Unable to move the Engine CA certificate to [{$path}].");
            }
        }

        return $path;
    }
}
