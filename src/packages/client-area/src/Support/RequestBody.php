<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;

/**
 * Buffers a raw request body to a seekable temp stream.
 *
 * The Client Area posts an archive as the raw request body
 * (`Content-Type: application/octet-stream`; `FilesUploadVersionModal.vue:497-509`).
 * `php://input` is a non-seekable stream, so an Engine multipart upload of it is
 * sent chunked and holds no Content-Length; the file-manager multipart path
 * works because PHP stores the part on disk first. Copying the body to
 * `php://temp` in fixed chunks keeps it off the PHP heap (the stream spills to
 * disk after 2 MB) and gives the Engine call a sized, seekable stream. A body at
 * the advertised 256 MB limit (plus multipart overhead) then fits the web pool.
 */
final class RequestBody
{
    /** Bytes copied per read; keeps the copy off the PHP heap. */
    public const int CHUNK_BYTES = 1_048_576;

    /**
     * @return resource a rewound, seekable temp stream with the whole body
     */
    public static function buffer(Request $request)
    {
        /** @var mixed $source */
        $source = self::readContent($request);
        $buffer = fopen('php://temp', 'wb+');
        if ($buffer === false) {
            abort(500, 'Unable to buffer the uploaded archive.');
        }

        if (is_resource($source)) {
            while (! feof($source)) {
                $chunk = fread($source, self::CHUNK_BYTES);
                if ($chunk === false || $chunk === '') {
                    break;
                }
                fwrite($buffer, $chunk);
            }
        }

        rewind($buffer);

        return $buffer;
    }

    /**
     * The Symfony base type is used on purpose: the Laravel plugin's Psalm stub
     * declares `Illuminate\Http\Request::getContent()` without the `$asResource`
     * parameter (psalm/plugin-laravel stubs/common/Http/Request.phpstub:227).
     *
     * @return resource
     */
    private static function readContent(SymfonyRequest $request)
    {
        return $request->getContent(true);
    }
}
