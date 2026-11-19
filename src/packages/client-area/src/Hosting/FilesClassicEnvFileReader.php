<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\ClientArea\Models\Application;
use Psr\Http\Message\StreamInterface;

/**
 * A classic project's real `.env`, read through `files/exists` and
 * `files/download` as the old panel read it through the server's file manager.
 * The Engine does not own that file, so this read is the feature, not an
 * Engine-gap workaround: it moved here from client-area-legacy, which retired
 * the `ClassicEnvFileReader` seam.
 *
 * The old panel capped the editor at 1 MB.
 */
final class FilesClassicEnvFileReader
{
    /** The old panel capped the editor at 1 MB. */
    private const MAX_BYTES = 1048576;

    /**
     * @param  string  $enginePath  the home-relative path the Engine takes
     * @return array{exists: bool, contents: string}
     *
     * @throws ValidationException
     */
    public function read(Application $application, string $enginePath): array
    {
        $api = new FilesApi($application->engine());

        $exists = (bool) $api->exists($application->engineProject(), $enginePath)['exists'];
        $contents = '';
        if ($exists) {
            $chunks = '';
            $api->download($application->engineProject(), $enginePath, function (StreamInterface $body) use (&$chunks): void {
                while (! $body->eof()) {
                    $chunks .= $body->read(8192);
                    if (strlen($chunks) > self::MAX_BYTES) {
                        break;
                    }
                }
            });

            if (strlen($chunks) > self::MAX_BYTES) {
                throw ValidationException::withMessages(['path' => ['File is too large to edit.']]);
            }
            $contents = $chunks;
        }

        return ['exists' => $exists, 'contents' => $contents];
    }
}
