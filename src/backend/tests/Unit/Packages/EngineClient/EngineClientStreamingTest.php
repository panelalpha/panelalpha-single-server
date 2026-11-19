<?php

namespace Tests\Unit\Packages\EngineClient;

use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Psr\Http\Message\StreamInterface;
use RuntimeException;
use Tests\TestCase;

/**
 * The streaming side of `EngineClient`: task log NDJSON, downloads with a
 * Range, multipart upload, the MCP pass-through and the pinned CA file.
 */
final class EngineClientStreamingTest extends TestCase
{
    private const URL = 'https://engine.example.com/api';

    private string $storage = '';

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = sys_get_temp_dir().'/engine-client-'.bin2hex(random_bytes(6));
        mkdir($this->storage, 0700, true);
        $this->app->useStoragePath($this->storage);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->storage);

        parent::tearDown();
    }

    private function removeDirectory(string $directory): void
    {
        foreach (glob($directory.'/{,.}*', GLOB_BRACE) ?: [] as $entry) {
            if (in_array(basename($entry), ['.', '..'], true)) {
                continue;
            }
            is_dir($entry) ? $this->removeDirectory($entry) : unlink($entry);
        }
        is_dir($directory) && rmdir($directory);
    }

    private function client(?string $ca = null): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::URL, '1|token', $ca));
    }

    public function test_a_task_log_stream_calls_back_for_each_line_and_returns_the_finish_frame(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:392
        // Engine: core/app/Http/Controllers/TaskController.php:412
        // Engine: core/app/Http/Controllers/TaskController.php:371
        $body = json_encode(['id' => 1, 'log' => 'cloning', 'level' => 'info'])."\n"
            .json_encode(['type' => 'heartbeat'])."\n"
            ."not json at all\n"
            ."\n"
            .json_encode(['id' => 2, 'log' => 'built', 'level' => 'info'])."\n"
            .json_encode(['type' => 'finish', 'status' => 'completed'])."\n"
            .json_encode(['id' => 3, 'log' => 'after finish'])."\n";
        // Engine: core/app/Http/Controllers/TaskController.php:371
        Http::fake(['*' => Http::response($body)]);

        $frames = [];
        $finish = $this->client()->streamTaskLogs(9, function (string $type, array $frame) use (&$frames): void {
            $frames[] = [$type, $frame['log'] ?? $frame['status']];
        }, 4);

        $this->assertSame([['line', 'cloning'], ['line', 'built'], ['finish', 'completed']], $frames);
        $this->assertSame(['type' => 'finish', 'status' => 'completed'], $finish);
        Http::assertSent(static fn (Request $request): bool => $request->url() === self::URL.'/tasks/9/logs/stream?after_id=4');
    }

    public function test_a_task_log_stream_without_a_cursor_sends_no_after_id(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:371
        Http::fake(['*' => Http::response(json_encode(['type' => 'finish', 'status' => 'failed']))]);

        $finish = $this->client()->streamTaskLogs(9, static function (): void {});

        $this->assertSame('failed', $finish['status']);
        Http::assertSent(static fn (Request $request): bool => $request->url() === self::URL.'/tasks/9/logs/stream');
    }

    public function test_a_finish_frame_without_a_trailing_newline_is_still_read(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:371
        Http::fake(['*' => Http::response(json_encode(['id' => 1, 'log' => 'x'])."\n".json_encode(['type' => 'finish', 'status' => 'completed']))]);

        $this->assertSame('completed', $this->client()->streamTaskLogs(9, static function (): void {})['status']);
    }

    public function test_a_stream_that_ends_before_the_finish_frame_returns_nothing(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:392
        Http::fake(['*' => Http::response(json_encode(['id' => 1, 'log' => 'x'])."\n")]);

        $this->assertSame([], $this->client()->streamTaskLogs(9, static function (): void {}));
    }

    public function test_a_last_line_that_is_not_a_finish_frame_returns_nothing(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:392
        Http::fake(['*' => Http::response(json_encode(['id' => 1, 'log' => 'x']))]);

        $this->assertSame([], $this->client()->streamTaskLogs(9, static function (): void {}));
    }

    public function test_a_stream_that_is_idle_for_a_chunk_waits_and_reads_on(): void
    {
        $finish = json_encode(['type' => 'finish', 'status' => 'completed'])."\n";
        // Defensive (not an Engine shape): Guzzle PSR-7 stream that yields an empty read before its data (a slow chunked answer)
        Http::fake(fn () => Create::promiseFor(new PsrResponse(200, [], $this->idleThenData($finish))));

        $this->assertSame('completed', $this->client()->streamTaskLogs(9, static function (): void {})['status']);
    }

    public function test_a_busy_task_log_stream_is_reported_as_the_engine_being_down(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:327
        Http::fake(['*' => Http::response(['message' => 'Too many log streams', 'code' => 'log_stream_limit'], 503, ['Retry-After' => '5'])]);

        try {
            $this->client()->streamTaskLogs(9, static function (): void {});
            $this->fail('A 503 must become EngineUnavailableException.');
        } catch (EngineUnavailableException $e) {
            $this->assertSame('The Engine answered HTTP 503.', $e->getMessage());
            $this->assertInstanceOf(EngineRequestException::class, $e->getPrevious());
        }
    }

    public function test_any_other_task_log_stream_error_keeps_its_type(): void
    {
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'Task not found'], 404)]);

        try {
            $this->client()->streamTaskLogs(9, static function (): void {});
            $this->fail('A 404 must throw EngineRequestException.');
        } catch (EngineRequestException $e) {
            $this->assertSame(404, $e->engineStatus);
        }
    }

    public function test_a_download_hands_the_body_and_response_to_the_sink_with_a_range(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.7 partial content (206) answer of a ranged GET
        Http::fake(['*' => Http::response('tail of the log', 206, ['Content-Range' => 'bytes 5-19/20'])]);

        $seen = null;
        $this->client()->download('files/download', ['path' => 'a.log'], function (StreamInterface $body, Response $response) use (&$seen): void {
            $seen = [(string) $body, $response->status(), $response->header('Content-Range')];
        }, 'bytes=-15');

        $this->assertSame(['tail of the log', 206, 'bytes 5-19/20'], $seen);
        Http::assertSent(static fn (Request $request): bool => $request->hasHeader('Range', 'bytes=-15')
            && $request->url() === self::URL.'/files/download?path=a.log');
    }

    public function test_a_download_without_a_range_sends_no_range_header(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.1 OK answer of a plain GET
        Http::fake(['*' => Http::response('whole file')]);

        $this->client()->download('files/download', ['path' => 'a.log'], static function (): void {}, '');
        $this->client()->download('files/download', ['path' => 'a.log'], static function (): void {});

        Http::assertSent(static fn (Request $request): bool => ! $request->hasHeader('Range'));
        Http::assertSentCount(2);
    }

    public function test_a_download_error_is_thrown_before_the_sink_runs(): void
    {
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'File not found'], 404)]);

        $called = false;
        try {
            $this->client()->download('files/download', ['path' => 'nope'], function () use (&$called): void {
                $called = true;
            });
            $this->fail('A 404 must throw EngineRequestException.');
        } catch (EngineRequestException $e) {
            $this->assertSame(404, $e->engineStatus);
        }

        $this->assertFalse($called);
    }

    public function test_an_upload_sends_the_fields_then_the_file_as_multipart(): void
    {
        // Engine: core/app/Http/Controllers/UploadController.php:49
        Http::fake(['*' => Http::response(['data' => ['id' => 'upl_1']], 201)]);

        $this->client()->upload('files/upload', ['path' => 'public_html', 'overwrite' => 1], [
            'name' => 'file',
            'contents' => 'zip bytes',
            'filename' => 'site.zip',
            'headers' => ['Content-Type' => 'application/zip'],
        ]);
        $this->client()->upload('uploads', [], ['name' => 'file', 'contents' => 'bytes']);

        $sent = Http::recorded()->map(static fn (array $pair): Request => $pair[0])->all();
        $this->assertTrue($sent[0]->isMultipart());
        $this->assertStringContainsString('name="file"; filename="site.zip"', $sent[0]->body());
        $this->assertStringContainsString('zip bytes', $sent[0]->body());
        $this->assertStringContainsString('name="path"', $sent[0]->body());
        $this->assertStringContainsString('public_html', $sent[0]->body());
        $this->assertStringContainsString('name="overwrite"', $sent[0]->body());
        $this->assertStringContainsString('Content-Type: application/zip', $sent[0]->body());
        $this->assertStringContainsString('name="file"; filename="upload"', $sent[1]->body());
        $this->assertStringNotContainsString('name="path"', $sent[1]->body());
    }

    public function test_an_upload_error_is_mapped_like_any_other_call(): void
    {
        // Engine: core/app/Http/Controllers/UploadController.php:43
        Http::fake(['*' => Http::response(['message' => 'Not an archive', 'errors' => ['file' => ['Not an archive']]], 422)]);

        $this->expectException(EngineValidationException::class);
        $this->client()->upload('uploads', [], ['name' => 'file', 'contents' => 'x']);
    }

    public function test_the_mcp_proxy_uses_the_callers_token_and_does_not_map_errors(): void
    {
        // Defensive (not an Engine shape): Model Context Protocol streamable HTTP transport, a 401 for an unknown bearer token
        Http::fake(['*' => Http::response(['error' => 'unauthorized'], 401)]);

        $response = $this->client()->proxy('POST', 'https://engine.example.com:2011/mcp', 'callers-token', ['json' => ['jsonrpc' => '2.0']]);

        $this->assertSame(401, $response->status());
        Http::assertSent(static fn (Request $request): bool => $request->hasHeader('Authorization', 'Bearer callers-token')
            && $request->url() === 'https://engine.example.com:2011/mcp');
    }

    public function test_the_mcp_proxy_maps_a_transport_failure_without_opening_the_breaker(): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client
        Http::fake(fn () => throw new ConnectionException('refused'));

        try {
            $this->client()->proxy('GET', 'https://engine.example.com:2011/mcp', 'token');
            $this->fail('A transport failure must throw EngineUnavailableException.');
        } catch (EngineUnavailableException) {
        }

        $this->assertFalse(app(EngineHealth::class)->isDown(EngineConnection::DEFAULT_ID));
    }

    public function test_a_pinned_ca_certificate_is_written_once_with_owner_only_rights_and_replaced_on_change(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);
        $path = $this->storage.'/app/private/engine-ca/engine-1.pem';

        $this->client("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")->get('a');
        $this->assertSame("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n", file_get_contents($path));
        $this->assertSame('0600', substr(sprintf('%o', fileperms($path)), -4));
        $modified = filemtime($path);

        $this->client("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")->get('a');
        $this->assertSame($modified, filemtime($path));

        $this->client("-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n")->get('a');
        $this->assertSame("-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n", file_get_contents($path));
        $this->assertSame([], glob($this->storage.'/app/private/engine-ca/*.tmp'));
    }

    public function test_a_blank_ca_certificate_uses_the_system_store_and_writes_nothing(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);

        $this->client("  \n")->get('a');

        $this->assertDirectoryDoesNotExist($this->storage.'/app/private/engine-ca');
    }

    public function test_a_ca_directory_that_cannot_be_created_is_a_clear_error(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);
        file_put_contents($this->storage.'/app', 'a file where the directory should go');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Unable to create the Engine CA directory');
        $this->client("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")->get('a');
    }

    public function test_a_ca_file_that_cannot_be_written_is_a_clear_error_and_leaves_nothing(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);
        $directory = $this->storage.'/app/private/engine-ca';
        mkdir($directory, 0700, true);
        chmod($directory, 0500);

        try {
            if (posix_geteuid() === 0) {
                // Root writes into a read-only directory; the runner starts PHP as the caller.
                $this->assertSame(0, posix_geteuid());

                return;
            }

            $this->client("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")->get('a');
            $this->fail('An unwritable directory must throw.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Unable to write the Engine CA certificate', $e->getMessage());
        } finally {
            chmod($directory, 0700);
        }

        $this->assertSame([], glob($directory.'/*'));
    }

    public function test_a_ca_path_that_cannot_be_replaced_is_a_clear_error_and_leaves_no_temporary_file(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);
        mkdir($this->storage.'/app/private/engine-ca/engine-1.pem', 0700, true);

        try {
            $this->client("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")->get('a');
            $this->fail('A directory at the target path must throw.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Unable to move the Engine CA certificate', $e->getMessage());
        }

        $this->assertSame([], glob($this->storage.'/app/private/engine-ca/*.tmp'));
    }

    private function idleThenData(string $data): StreamInterface
    {
        return new class($data) implements StreamInterface
        {
            private int $reads = 0;

            private int $position = 0;

            public function __construct(private readonly string $data) {}

            public function read(int $length): string
            {
                if ($this->reads++ === 0) {
                    return '';
                }
                $chunk = substr($this->data, $this->position, $length);
                $this->position += strlen($chunk);

                return $chunk;
            }

            public function eof(): bool
            {
                return $this->position >= strlen($this->data);
            }

            public function __toString(): string
            {
                return $this->data;
            }

            public function close(): void {}

            public function detach()
            {
                return null;
            }

            public function getSize(): ?int
            {
                return strlen($this->data);
            }

            public function tell(): int
            {
                return $this->position;
            }

            public function isSeekable(): bool
            {
                return false;
            }

            public function seek(int $offset, int $whence = SEEK_SET): void {}

            public function rewind(): void {}

            public function isWritable(): bool
            {
                return false;
            }

            public function write(string $string): int
            {
                return 0;
            }

            public function isReadable(): bool
            {
                return true;
            }

            public function getContents(): string
            {
                return $this->data;
            }

            public function getMetadata(?string $key = null): mixed
            {
                return null;
            }
        };
    }
}
