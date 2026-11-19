<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\FileManagerService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerClipboardRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerItemsRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerPathRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerRenameRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerUnzipRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerUpdateFileRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerUploadRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FileManagerZipRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * File manager for the `fm` SPA under
 * `/api/file-manager/*`. `{application}` is the project id (ownership already
 * checked); the SPA sends `disk`/`path` query parameters. Payloads and
 * responses match the fm SPA 1:1.
 */
final class FileManagerController extends Controller
{
    public function __construct(private readonly FileManagerService $files) {}

    public function initialize(Application $application): JsonResponse
    {
        return response()->json($this->files->initialize($application));
    }

    public function content(FileManagerPathRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->files->content($application, $this->path($request)));
    }

    public function upload(FileManagerUploadRequest $request, Application $application): JsonResponse
    {
        $names = (array) $request->input('names', []);
        $files = self::uploadedFiles($request);

        // A multipart filename is cut at its last backslash, so only names[] can be trusted.
        $named = [];
        foreach ($files as $key => $file) {
            $named[$key] = Payload::string($names[$key] ?? '');
        }
        if (in_array('', $named, true)) {
            throw ValidationException::withMessages(['names' => ['The name of every uploaded file is required.']]);
        }

        $uploads = [];
        foreach ($files as $key => $file) {
            $stream = fopen($file->getRealPath(), 'rb');
            if ($stream === false) {
                continue;
            }

            $uploads[] = ['stream' => $stream, 'name' => $named[$key]];
        }

        try {
            return response()->json($this->files->upload(
                $application,
                $this->path($request),
                $uploads,
                $request->boolean('overwrite'),
            ));
        } finally {
            foreach ($uploads as $upload) {
                if (is_resource($upload['stream'])) {
                    fclose($upload['stream']);
                }
            }
        }
    }

    public function createDirectory(FileManagerRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->createDirectory(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::string($params['name'] ?? ''),
        ));
    }

    public function createFile(FileManagerRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->createFile(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::string($params['name'] ?? ''),
        ));
    }

    public function updateFile(FileManagerUpdateFileRequest $request, Application $application): JsonResponse
    {
        $file = $request->file('file');
        if (! $file instanceof UploadedFile) {
            throw ValidationException::withMessages(['file' => ['The file field is required.']]);
        }

        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false) {
            throw ValidationException::withMessages(['file' => ['The file could not be read.']]);
        }

        return response()->json($this->files->updateFile(
            $application,
            Payload::string($request->input('path', '')),
            $stream,
            Payload::string($request->input('name', '')),
            (int) $file->getSize(),
        ));
    }

    public function delete(FileManagerItemsRequest $request, Application $application): JsonResponse
    {
        /** @var list<array<string, mixed>> $items */
        $items = $request->validated()['items'];

        return response()->json($this->files->delete($application, $items));
    }

    public function rename(FileManagerRenameRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->rename(
            $application,
            Payload::string($params['oldName'] ?? ''),
            Payload::string($params['newName'] ?? ''),
        ));
    }

    public function paste(FileManagerClipboardRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->paste(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::object($params['clipboard'] ?? null),
        ));
    }

    public function zip(FileManagerZipRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->zip(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::string($params['name'] ?? ''),
            Payload::object($params['elements'] ?? null),
        ));
    }

    public function unzip(FileManagerUnzipRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        return response()->json($this->files->unzip(
            $application,
            Payload::string($params['path'] ?? ''),
            Payload::nullableString($params['folder'] ?? null),
        ));
    }

    /**
     * GET /file-manager/download/{id} – streamed; the fm SPA opens it as a link
     * with `?disk=&path=`. `Content-Disposition` marks it a download.
     */
    public function download(FileManagerPathRequest $request, Application $application): StreamedResponse
    {
        return $this->stream($request, $application, $this->path($request), true);
    }

    /**
     * GET /file-manager/stream-file/{id} – the Audio/VideoPlayerModal source.
     * Forwards a Range header so the player can seek; a
     * media stream is never marked as an attachment.
     */
    public function streamFile(FileManagerPathRequest $request, Application $application): StreamedResponse
    {
        return $this->stream($request, $application, $this->path($request), false);
    }

    /**
     * GET /file-manager/preview/{id} – the image PreviewModal source:
     * `{image: 'data:<mime>;base64,…'}` (CA `PreviewModal.vue:133-134`).
     */
    public function preview(FileManagerPathRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->files->preview($application, $this->path($request)));
    }

    /**
     * GET /file-manager/thumbnails/{id} – the Thumbnail.vue source.
     */
    public function thumbnails(FileManagerPathRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->files->thumbnails($application, $this->path($request)));
    }

    private function stream(Request $request, Application $application, string $path, bool $download): StreamedResponse
    {
        $path = $this->files->normalizePath($path);
        $range = $request->header('Range');

        // Open the Engine stream first, so a failed read keeps its status
        // instead of opening as an empty file; copy the status (206) and range
        // headers.
        $response = $this->files->openDownload($application, $path, is_string($range) ? $range : null);

        $headers = [];
        foreach (['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'] as $name) {
            $value = $response->header($name);
            if ($value !== '') {
                $headers[$name] = $value;
            }
        }

        if ($download) {
            // The old panel used Laravel's `streamDownload`, whose
            // Content-Disposition is built with HeaderUtils – non-ASCII
            // filenames get an encoded `filename*` and an ASCII fallback.
            $filename = basename($path);
            $headers['Content-Disposition'] = HeaderUtils::makeDisposition(
                HeaderUtils::DISPOSITION_ATTACHMENT,
                $filename,
                (string) preg_replace('/[^\x20-\x7e]|%/', '_', $filename),
            );
        }

        $body = $response->toPsrResponse()->getBody();

        return response()->stream(function () use ($body): void {
            while (! $body->eof()) {
                echo $body->read(8192);
            }
        }, $response->status(), $headers);
    }

    private function path(Request $request): string
    {
        return Payload::string($request->query('path', $request->input('path', '')));
    }

    /**
     * The uploaded `files[]` entries by their index, ignoring malformed entries.
     *
     * @return array<int|string, UploadedFile>
     */
    private static function uploadedFiles(Request $request): array
    {
        $bag = (array) $request->file('files', []);

        $files = [];
        foreach (array_keys($bag) as $key) {
            $file = self::asUploadedFile($bag[$key] ?? null);
            if ($file !== null) {
                $files[$key] = $file;
            }
        }

        return $files;
    }

    private static function asUploadedFile(mixed $value): ?UploadedFile
    {
        return $value instanceof UploadedFile ? $value : null;
    }
}
