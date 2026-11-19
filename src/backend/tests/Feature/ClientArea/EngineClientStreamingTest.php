<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\TestCase;

/**
 * The EngineClient helpers for task polling, NDJSON
 * streaming, streamed downloads (Range) and multipart uploads.
 * @see Engine core/routes/api.php:114-117 (tasks/{id}, tasks/{id}/logs/stream)
 */
class EngineClientStreamingTest extends TestCase
{
    use EngineFixtures;

    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(1, self::ENGINE, '1|test-token'));
    }

    public function test_task_unwraps_the_data_envelope(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'engine.example.com/api/tasks/55*' => Http::response(['data' => [
                'id' => 55,
                'status' => 'running',
                'logs' => [['id' => 1, 'log' => 'Cloning']],
                'next_after_id' => 1,
            ]]),
        ]);

        $task = $this->client()->task(55, afterId: 3);

        $this->assertSame('running', $task['status']);
        $this->assertSame(1, $task['next_after_id']);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/tasks/55')
            && str_contains($request->url(), 'after_id=3'));
    }

    public function test_task_404_becomes_engine_request_exception(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['message' => 'Not found'], 404)]);

        $this->expectException(EngineRequestException::class);
        $this->client()->task(999);
    }

    public function test_stream_task_logs_skips_heartbeats_and_stops_at_finish(): void
    {
        Http::preventStrayRequests();
        $ndjson = implode("\n", [
            '{"type":"line","id":1,"log":"step one"}',
            '{"type":"heartbeat"}',
            '{"type":"line","id":2,"log":"step two"}',
            '{"type":"finish","status":"completed"}',
        ]);
        Http::fake(['engine.example.com/api/tasks/7/logs/stream*' => Http::response($ndjson, 200)]);

        $frames = [];
        $finish = $this->client()->streamTaskLogs(7, function (string $type, array $frame) use (&$frames) {
            $frames[] = [$type, $frame['log'] ?? $frame['status'] ?? null];
        });

        $this->assertSame('completed', $finish['status']);
        $this->assertSame([
            ['line', 'step one'],
            ['line', 'step two'],
            ['finish', 'completed'],
        ], $frames);
    }

    public function test_download_streams_the_body_and_forwards_range(): void
    {
        Http::preventStrayRequests();
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('tail-of-log', 200)]);

        $captured = '';
        $this->client()->download(
            'projects/site1/files/download',
            ['path' => 'logs/access.log'],
            function ($stream) use (&$captured) {
                $captured = (string) $stream;
            },
            range: 'bytes=-100',
        );

        $this->assertSame('tail-of-log', $captured);
        Http::assertSent(fn ($request) => $request->hasHeader('Range', 'bytes=-100'));
    }

    public function test_upload_sends_a_multipart_file_field(): void
    {
        Http::preventStrayRequests();
        Http::fake(['engine.example.com/api/projects/site1/files/upload*' => Http::response(['success' => true])]);

        $this->client()->upload(
            'projects/site1/files/upload',
            ['path' => 'public_html/'],
            ['contents' => 'hello-bytes', 'filename' => 'index.php'],
        );

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/files/upload')
                && $request->method() === 'POST'
                && str_contains($request->body(), 'hello-bytes')
                && str_contains($request->body(), 'index.php');
        });
    }
}
