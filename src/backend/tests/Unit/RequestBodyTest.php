<?php

namespace Tests\Unit;

use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Support\RequestBody;
use Tests\TestCase;

/**
 * The raw archive body is copied to a seekable temp stream in
 * fixed chunks, never read whole into a PHP string. A 250 MB CA upload then
 * stays off the PHP heap (the stream spills to disk after 2 MB) and the Engine
 * multipart call carries a Content-Length.
 *
 * @see src/packages/client-area/src/Support/RequestBody.php
 * @see src/packages/client-area/src/Http/Controllers/Project/DeployLogController.php
 */
final class RequestBodyTest extends TestCase
{
    public function test_it_buffers_the_raw_body_to_a_seekable_stream(): void
    {
        $request = Request::create('/api/projects/1/deploy/upload', 'POST', [], [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
        ], 'PK-zip-bytes');

        $buffer = RequestBody::buffer($request);

        $this->assertIsResource($buffer);
        rewind($buffer);
        $this->assertSame('PK-zip-bytes', stream_get_contents($buffer));

        // Rewound and seekable, so the Engine call can send a Content-Length.
        $meta = stream_get_meta_data($buffer);
        $this->assertTrue($meta['seekable']);
        fclose($buffer);
    }

    public function test_it_copies_a_large_body_in_bounded_chunks(): void
    {
        // 32 MB: large enough that a whole-body read would show up as a ~32 MB
        // peak-memory jump; the chunked copy stays far below that.
        $body = str_repeat('A', 32 * 1024 * 1024);
        $request = Request::create('/api/projects/1/deploy/upload', 'POST', [], [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
        ], $body);

        $before = memory_get_peak_usage(true);
        $buffer = RequestBody::buffer($request);
        $growth = memory_get_peak_usage(true) - $before;

        $this->assertIsResource($buffer);
        $this->assertLessThan(16 * 1024 * 1024, $growth, 'the raw body must not be read whole into memory');
        $stat = fstat($buffer);
        $this->assertIsArray($stat);
        $this->assertSame(strlen($body), $stat['size']);
        fclose($buffer);
    }
}
