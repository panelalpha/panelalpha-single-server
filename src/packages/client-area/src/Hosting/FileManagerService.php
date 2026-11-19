<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Http\Client\Response;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The file manager, backing the `fm` SPA under
 * `/api/file-manager/*`. Every Engine path lives in FilesApi; this service
 * shapes the SPA's `{result:{status,message}, directories, files}` envelope and
 * implements the directory-listing workaround.
 *
 * Payloads are the ones the `fm` SPA sends (`fm/src/http/*.js`,
 * `fm/src/store/actions.js`): `items[]`, `oldName`/`newName`,
 * `clipboard{type,directories,files}`, `name`/`elements`, `path`/`folder`,
 * multipart `file`, `files[]`+`overwrite`. Responses carry the `file`/
 * `directory`/`tree` keys `updateContent()` commits.
 */
final class FileManagerService
{
    // The old panel's translated error texts (fm SPA shows the old text or its
    // own `lang.response` key, `fm/src/FileManager.vue:156-165`); copied from
    // packages/api/resources/lang/en/api/messages.php:173-190.
    private const TEXT_DIRECTORY_CONTENT = 'Unable to get content of directory.';

    private const TEXT_DELETE_FILE = 'Cannot delete selected file(s).';

    private const TEXT_COPY_FILE = 'Cannot copy selected file(s).';

    private const TEXT_MOVE_FILE = 'Cannot move selected file(s).';

    private const TEXT_CREATE_DIRECTORY = 'Cannot create directory.';

    private const TEXT_CREATE_FILE = 'Cannot create file.';

    private const TEXT_NOT_WRITABLE = 'This folder is read-only for the project: choose a folder inside the project.';

    private const TEXT_UPDATE_FILE = 'Cannot update file.';

    private const TEXT_GENERATE_THUMBNAIL = 'Unable to generate thumbnail.';

    private const TEXT_GENERATE_PREVIEW = 'Unable to generate preview.';

    private const TEXT_RENAME_FILE = 'Cannot rename file.';

    private const TEXT_CREATE_ZIP = 'Cannot create ZIP archive.';

    private const TEXT_EXTRACT_ZIP = 'Cannot extract ZIP archive.';

    private const TEXT_FILE_MOVED = 'Moved!';

    // The fm grid shows an 88x88 cover thumbnail; the
    // preview box is capped at the Engine's 1024 px maximum (`MAX_SIZE`,
    // core/app/Http/Requests/Files/ThumbnailRequest.php:13).
    private const THUMBNAIL_WIDTH = 88;

    private const THUMBNAIL_HEIGHT = 88;

    private const PREVIEW_BOX = 1024;

    /**
     * Configuration the fm SPA reads on boot (upload limit in bytes, locale).
     *
     * @return array<string, mixed>
     */
    public function initialize(Application $application): array
    {
        return [
            'result' => ['status' => 'success', 'message' => null],
            'config' => [
                'uploadMaxFilesize' => $this->uploadMaxFilesize(),
                'lang' => app()->getLocale() ?: 'en',
                'unsupportedActions' => [],
            ],
        ];
    }

    /**
     * List one directory. `$path` is home-relative, `''` = the home root.
     *
     * Native Engine listing (since Engine `29ae`), one shape for both project
     * kinds: `GET files/list?path&show_hidden`
     * (`core/app/Http/Controllers/User/FileController.php:599`). The old
     * `ls -lA` / `wp-cli eval` scan is gone.
     *
     * @return array<string, mixed>
     */
    public function content(Application $application, string $path): array
    {
        $path = $this->normalizePath($path);

        // A non-2xx Engine answer (missing path, a file instead
        // of a directory, a 5xx) becomes the fm SPA's `danger` envelope, never a
        // raw 502 that carries the Engine path
        // (`fm/src/store/manager/actions.js:56` reloads the root).
        try {
            $entries = $this->files($application)->list($application->engineProject(), $this->enginePath($path));
        } catch (EngineRequestException|EngineValidationException $e) {
            report($e);

            return $this->danger();
        }

        $directories = [];
        $files = [];
        foreach ($entries as $entry) {
            $row = $this->entryRow($entry, $path);
            if ($row === null) {
                continue;
            }

            $row['type'] === 'dir' ? $directories[] = $row : $files[] = $row;
        }

        return [
            'result' => ['status' => 'success', 'message' => null],
            'directories' => $directories,
            'files' => $files,
        ];
    }

    /**
     * Upload one or more files into `path` (the CA sends `files[]`).
     *
     * @param  list<array{stream: resource|string, name: string}>  $uploads
     * @return array<string, mixed>
     */
    public function upload(Application $application, string $path, array $uploads, bool $overwrite = false): array
    {
        $dir = $this->normalizePath($path);
        $api = $this->files($application);

        try {
            foreach ($uploads as $upload) {
                $name = $this->assertFilename((string) $upload['name']);
                $full = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);

                // The Engine always overwrites; honour the CA's `overwrite=0` by
                // pre-checking `files/exists` and skipping the file, as the old
                // panel did (`FileManager::upload` `continue`).
                if (! $overwrite && $this->exists($api, $application, $full)) {
                    continue;
                }

                if (! $this->writeFile($api, $application, $dir, $name, $upload['stream'])) {
                    return ['result' => ['status' => 'warning', 'message' => 'notAllUploaded']];
                }
            }
        } catch (EngineRequestException $e) {
            // Old `upload`: any failure became the fm warning, never a 502.
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return ['result' => ['status' => 'warning', 'message' => 'notAllUploaded']];
        } catch (EngineValidationException $e) {
            return $this->error($this->notWritable($e) ?? throw $e);
        }

        return ['result' => ['status' => 'success', 'message' => 'uploaded']];
    }

    /**
     * Open the Engine's download stream for a home-relative path, forwarding a
     * Range. The response is returned unread so the caller can copy its status
     * and Content-* headers (no FilesApi in the
     * controller).
     */
    public function openDownload(Application $application, string $path, ?string $range = null): Response
    {
        return $this->files($application)->downloadStream(
            $application->engineProject(),
            $this->enginePath($path),
            $range,
        );
    }

    /**
     * Whether a home-relative path already exists on the Engine.
     */
    private function exists(FilesApi $api, Application $application, string $path): bool
    {
        // A failed existence check is never "absent": the
        // caller answers its old error instead of writing over an unknown file.
        return (bool) $api->exists($application->engineProject(), $this->enginePath($path))['exists'];
    }

    /**
     * @return array<string, mixed>
     */
    public function createDirectory(Application $application, string $path, string $name): array
    {
        $dir = $this->normalizePath($path);
        $name = $this->assertFilename($name);
        $full = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);

        try {
            $this->files($application)->mkdir($application->engineProject(), $this->enginePath($full));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error(self::TEXT_CREATE_DIRECTORY);
        } catch (EngineValidationException $e) {
            return $this->error($this->notWritable($e) ?? throw $e);
        }

        $row = $this->directoryRow($full, $name, $dir);

        return [
            'result' => ['status' => 'success', 'message' => 'dirCreated'],
            'directory' => $row,
            'tree' => [$row],
        ];
    }

    /**
     * Create an empty file. The Engine `files/put-contents` rejects an empty
     * `contents`, so an empty upload is used instead.
     *
     * @return array<string, mixed>
     */
    public function createFile(Application $application, string $path, string $name): array
    {
        $dir = $this->normalizePath($path);
        $name = $this->assertFilename($name);
        $full = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);
        $api = $this->files($application);

        // Never truncate an existing file (old `cannot_create_file`, T3); a
        // failed existence check answers the same error.
        try {
            if ($this->exists($api, $application, $full)) {
                return $this->error(self::TEXT_CREATE_FILE);
            }
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error(self::TEXT_CREATE_FILE);
        }

        $empty = fopen('php://temp', 'rb+');
        if ($empty === false) {
            return $this->error(self::TEXT_CREATE_FILE);
        }

        try {
            if (! $this->writeFile($api, $application, $dir, $name, $empty)) {
                return $this->error(self::TEXT_CREATE_FILE);
            }
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error(self::TEXT_CREATE_FILE);
        } catch (EngineValidationException $e) {
            return $this->error($this->notWritable($e) ?? throw $e);
        } finally {
            if (is_resource($empty)) {
                fclose($empty);
            }
        }

        return [
            'result' => ['status' => 'success', 'message' => 'fileCreated'],
            'file' => $this->fileRow($full, $name, $dir, 0),
        ];
    }

    /**
     * Overwrite a file: the CA posts multipart `file` + `path` (the directory).
     *
     * @param  resource|string  $stream
     * @return array<string, mixed>
     */
    public function updateFile(Application $application, string $path, $stream, string $filename, int $size = 0): array
    {
        $dir = $this->normalizePath($path);
        $name = $this->assertFilename($filename);
        $full = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);

        try {
            if (! $this->writeFile($this->files($application), $application, $dir, $name, $stream)) {
                return $this->error(self::TEXT_UPDATE_FILE);
            }
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error(self::TEXT_UPDATE_FILE);
        }

        return [
            'result' => ['status' => 'success', 'message' => 'fileUpdated'],
            'file' => $this->fileRow($full, $name, $dir, $size),
        ];
    }

    /**
     * Delete the CA's `items[]` (each `{path, type}`).
     *
     * @param  list<array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    public function delete(Application $application, array $items): array
    {
        $api = $this->files($application);

        foreach ($items as $item) {
            $path = $this->normalizePath(Payload::string($item['path'] ?? ''));
            if ($path === '') {
                continue;
            }

            try {
                $api->remove($application->engineProject(), $this->enginePath($path));
            } catch (EngineRequestException $e) {
                // The old `rm -rf` was idempotent: a path that no longer exists
                // is already deleted. Only the Engine's per-path 404
                // (`{message:'Invalid path'}`, FileController::remove) means
                // that; a project-level 404 is not success.
                if ($e->engineStatus === 404 && $e->response?->json('message') === 'Invalid path') {
                    continue;
                }

                if ($e->engineStatus !== 400) {
                    throw $e;
                }

                return $this->error(self::TEXT_DELETE_FILE);
            }
        }

        return ['result' => ['status' => 'success', 'message' => 'deleted']];
    }

    /**
     * Rename by moving `oldName` to `newName` (both are full home-relative
     * paths; dots are not trimmed).
     *
     * @return array<string, mixed>
     */
    public function rename(Application $application, string $oldName, string $newName): array
    {
        $source = $this->normalizePath($oldName);
        $destination = $this->normalizePath($newName);

        if ($source === '' || $destination === '') {
            throw ValidationException::withMessages(['path' => ['Invalid path.']]);
        }

        try {
            $this->files($application)->move($application->engineProject(), $this->enginePath($source), $this->enginePath($destination));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error(self::TEXT_RENAME_FILE);
        }

        return ['result' => ['status' => 'success', 'message' => 'renamed']];
    }

    /**
     * Paste the clipboard (`{type, directories[], files[]}`) into `path`.
     *
     * @param  array<string, mixed>  $clipboard
     * @return array<string, mixed>
     */
    public function paste(Application $application, string $path, array $clipboard): array
    {
        $type = Payload::string($clipboard['type'] ?? '');
        if (! in_array($type, ['copy', 'cut'], true)) {
            throw ValidationException::withMessages(['clipboard' => ['Invalid clipboard.']]);
        }

        $destination = $this->normalizePath($path);
        $sources = array_merge(
            Payload::strings($clipboard['directories'] ?? null),
            Payload::strings($clipboard['files'] ?? null),
        );

        try {
            foreach ($sources as $source) {
                $source = $this->normalizePath($source);
                if ($source === '') {
                    continue;
                }
                // The Engine's cp/mv take the destination directory (old
                // `cp -R srcs… dir` / `mv srcs… dir`): never `<dir>/<basename>`,
                // which the Engine nests into an existing directory (§7.5).
                $type === 'cut'
                    ? $this->files($application)->move($application->engineProject(), $this->enginePath($source), $this->enginePath($destination))
                    : $this->files($application)->copy($application->engineProject(), $this->enginePath($source), $this->enginePath($destination));
            }
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            return $this->error($type === 'cut' ? self::TEXT_MOVE_FILE : self::TEXT_COPY_FILE);
        }

        // Old `file_moved` text (messages.php:190); the fm SPA has no `moved`
        // key, so it shows it verbatim.
        return ['result' => ['status' => 'success', 'message' => $type === 'cut' ? self::TEXT_FILE_MOVED : 'copied']];
    }

    /**
     * Zip `path`/`name` from the CA's `elements{…}`. Calls
     * `files/zip` once per element with the same `zip_path`; the Engine appends.
     *
     * @param  array<string, mixed>  $elements
     * @return array<string, mixed>
     */
    public function zip(Application $application, string $path, string $name, array $elements): array
    {
        $dir = $this->normalizePath($path);
        $name = $this->assertFilename($name);
        $zipPath = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);

        $targets = array_merge(
            Payload::strings($elements['directories'] ?? null),
            Payload::strings($elements['files'] ?? null),
        );

        if ($targets === []) {
            return $this->error(self::TEXT_CREATE_ZIP);
        }

        // One `files/zip` call per element with the same `zip_path`: the Engine
        // appends (`zip -r`), so a multi-element zip is composed panel-side
        // (this was never an Engine gap).
        try {
            foreach ($targets as $target) {
                $this->files($application)->zip(
                    $application->engineProject(),
                    $this->enginePath($zipPath),
                    $this->enginePath($target),
                );
            }
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 400) {
                return $this->error(self::TEXT_CREATE_ZIP);
            }

            throw $e;
        }

        return ['result' => ['status' => 'success', 'message' => null]];
    }

    /**
     * Extract `path` into `folder` (under the archive's directory), or beside
     * it when `folder` is empty.
     *
     * @return array<string, mixed>
     */
    public function unzip(Application $application, string $path, ?string $folder): array
    {
        $zipPath = $this->normalizePath($path);
        if ($zipPath === '') {
            throw ValidationException::withMessages(['path' => ['Invalid path.']]);
        }

        $dir = str_contains($zipPath, '/') ? substr($zipPath, 0, (int) strrpos($zipPath, '/')) : '';
        $target = $dir;
        if (is_string($folder) && trim($folder) !== '') {
            $folder = $this->assertFilename($folder);
            $target = $this->normalizePath($dir === '' ? $folder : $dir.'/'.$folder);
        }

        try {
            $this->files($application)->unzip($application->engineProject(), $this->enginePath($zipPath), $this->enginePath($target));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 400) {
                return $this->error(self::TEXT_EXTRACT_ZIP);
            }

            throw $e;
        }

        return ['result' => ['status' => 'success', 'message' => null]];
    }

    /**
     * The image PreviewModal source: `{image: 'data:<mime>;base64,…'}` (CA
     * `PreviewModal.vue:133-134`). An
     * image is resized by the Engine through `files/thumbnail` in a box capped
     * at the Engine's 1024 px maximum with `fit=contain` (best-fit inside,
     * `core/app/Http/Requests/Files/ThumbnailRequest.php:13`), so a large photo is
     * never streamed whole; a non-image keeps `files/download`
     * (`core/app/Http/Controllers/User/FileController.php:709`). A failure answers
     * the old error envelope (`FileManager::preview`, messages.php:183).
     *
     * @return array<string, mixed>
     */
    public function preview(Application $application, string $path): array
    {
        $path = $this->normalizePath($path);

        try {
            if ($this->isImage($path)) {
                $bytes = $this->webpThumbnail($application, $path, self::PREVIEW_BOX, self::PREVIEW_BOX, 'contain');
                $mime = 'image/webp';
            } else {
                $bytes = $this->files($application)->readFile($application->engineProject(), $this->enginePath($path));
                $mime = $this->mime($path);
            }
        } catch (\Throwable $e) {
            report($e);

            return $this->error(self::TEXT_GENERATE_PREVIEW);
        }

        if ($bytes === '') {
            return $this->error(self::TEXT_GENERATE_PREVIEW);
        }

        return ['image' => 'data:'.$mime.';base64,'.base64_encode($bytes)];
    }

    /**
     * The Thumbnail.vue source: an 88x88 cover webp as a data URI (Engine
     * `files/thumbnail`). `Thumbnail.vue:78` builds the request itself for
     * its `<img>` fallback; the fm SPA reads `response.data.image`.
     *
     * Engine: `files/thumbnail` (`core/app/Http/Controllers/User/FileController.php:764`),
     * `{path,width,height,fit=cover|contain}` → `image/webp`
     * (`core/app/Http/Requests/Files/ThumbnailRequest.php:9`). A 422 (`unsupported_image`,
     * `image_too_large`) or 404 answers the old error envelope (messages.php:182).
     *
     * @return array<string, mixed>
     */
    public function thumbnails(Application $application, string $path): array
    {
        try {
            $bytes = $this->webpThumbnail($application, $path, self::THUMBNAIL_WIDTH, self::THUMBNAIL_HEIGHT, 'cover');
        } catch (EngineRequestException|EngineValidationException $e) {
            report($e);

            return $this->error(self::TEXT_GENERATE_THUMBNAIL);
        }

        if ($bytes === '') {
            return $this->error(self::TEXT_GENERATE_THUMBNAIL);
        }

        return [
            'result' => ['status' => 'success', 'message' => null],
            'image' => 'data:image/webp;base64,'.base64_encode($bytes),
        ];
    }

    private function notWritable(EngineValidationException $e): ?string
    {
        foreach ($e->problems as $problem) {
            if (($problem['code'] ?? null) === 'not_writable') {
                $message = Payload::nullableString($problem['message'] ?? null);

                return $message !== null && $message !== '' ? $message : self::TEXT_NOT_WRITABLE;
            }
        }

        return null;
    }

    /**
     * The old panel's `{result:{status:'error',message:…}}` envelope the fm SPA
     * checks before anything else (`FileManager.vue:156-165`).
     *
     * @return array{result: array{status: string, message: string}}
     */
    private function error(string $message): array
    {
        return ['result' => ['status' => 'error', 'message' => $message]];
    }

    /**
     * The fm SPA's `danger` envelope – it selects the root directory and
     * reloads (`fm/src/store/manager/actions.js:56`). A non-2xx Engine listing
     * answer must not surface as a raw 502 carrying the Engine path.
     *
     * @return array{result: array{status: string, message: string}}
     */
    private function danger(string $message = self::TEXT_DIRECTORY_CONTENT): array
    {
        return ['result' => ['status' => 'danger', 'message' => $message]];
    }

    private function mime(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'bmp' => 'image/bmp',
            default => 'application/octet-stream',
        };
    }

    /**
     * The fm SPA's image extensions (`fm/src/store/settings/store.js:151`:
     * png, jpg, jpeg, gif, webp) – the formats `files/thumbnail` can encode
     * (`core/app/Lib/Project/FileThumbnail.php:29`).
     */
    private function isImage(string $path): bool
    {
        return in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), ['png', 'jpg', 'jpeg', 'gif', 'webp'], true);
    }

    /**
     * A filename's extension (no dot), or '' (old `Str::afterLast($name, '.')`).
     */
    private function extension(string $name): string
    {
        $dot = strrpos($name, '.');

        return $dot === false ? '' : substr($name, $dot + 1);
    }

    /**
     * The Engine's webp bytes for one image (empty string when the Engine sent
     * an empty body). The caller turns an Engine error into its old envelope.
     *
     * Engine: `files/thumbnail` (`core/app/Http/Controllers/User/FileController.php:764`).
     *
     * @throws EngineRequestException|EngineValidationException
     */
    private function webpThumbnail(Application $application, string $path, int $width, int $height, string $fit): string
    {
        return $this->files($application)->thumbnail(
            $application->engineProject(),
            $this->enginePath($this->normalizePath($path)),
            $width,
            $height,
            $fit,
        );
    }

    /**
     * The Engine file API for one project.
     */
    private function files(Application $application): FilesApi
    {
        return new FilesApi($application->engine());
    }

    /**
     * Reject a home-relative path that tries to leave the project home.
     * Kept public for the streamed download route.
     */
    public function assertSafePath(string $path): void
    {
        $this->normalizePath($path);
    }

    /**
     * The path as the Engine must receive it: the project home root (`''` from
     * the CA) is sent as `/`, because the Engine turns an empty string into
     * `null` and its `required` rule then answers 422.
     */
    private function enginePath(string $path): string
    {
        $path = $this->normalizePath($path);

        return $path === '' ? '/' : $path;
    }

    /**
     * Normalize a home-relative path: reject an absolute one or a backslash
     * (the Engine's paths are `/`-separated), resolve `.`/`..` (rejecting an
     * escape) and allow `''` (the home root). Every path field goes through
     * this one validator.
     */
    public function normalizePath(string $path): string
    {
        if (str_contains($path, "\0") || str_starts_with($path, '/') || str_contains($path, '\\')) {
            throw ValidationException::withMessages(['path' => ['Invalid path.']]);
        }

        $parts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                if ($parts === []) {
                    throw ValidationException::withMessages(['path' => ['Invalid path.']]);
                }
                array_pop($parts);
                continue;
            }
            $parts[] = $part;
        }

        return implode('/', $parts);
    }

    /**
     * One Engine `FileEntry` as the fm SPA's row, or null for a link the old
     * `ls -lA` parser skipped (`Str::startsWith($permissions, ['-', 'd'])`).
     *
     * Engine keys: `core/app/OpenApi/Schemas/FileEntrySchema.php:10`,
     * built by `core/app/System/Project/FileManager.php:303`.
     *
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>|null
     */
    private function entryRow(array $entry, string $dirname): ?array
    {
        $name = Payload::string($entry['name'] ?? '');
        if ($name === '') {
            return null;
        }

        $type = Payload::string($entry['type'] ?? 'file');
        if ($type === 'link') {
            return null;
        }

        // The Engine's `path` is home-relative with a leading slash
        // (`/public_html/index.php`, `core/app/System/Project/FileManager.php:336`);
        // the fm SPA stores paths without it (old `trim($dirPath.'/'.$name, '/')`).
        $path = ltrim(Payload::string($entry['path'] ?? ''), '/');
        $timestamp = Payload::int($entry['mtime'] ?? null) ?? time();

        if ($type === 'dir') {
            return [
                'type' => 'dir',
                'path' => $path,
                'basename' => $name,
                'dirname' => $dirname,
                'timestamp' => $timestamp,
                'visibility' => true,
                'props' => ['hasSubdirectories' => Payload::bool($entry['has_subdirectories'] ?? null) ?? false],
            ];
        }

        return [
            'type' => 'file',
            'path' => $path,
            'basename' => $name,
            'dirname' => $dirname,
            'filename' => $name,
            'extension' => $this->extension($name),
            'size' => Payload::int($entry['size'] ?? null) ?? 0,
            'timestamp' => $timestamp,
            'visibility' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function directoryRow(string $path, string $basename, string $dirname): array 
    {
        return [
            'type' => 'dir',
            'path' => $path,
            'basename' => $basename,
            'dirname' => $dirname,
            'timestamp' => time(),
            'visibility' => true,
            'props' => ['hasSubdirectories' => false],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function fileRow(string $path, string $basename, string $dirname, int $size): array
    {
        $extension = '';
        $dot = strrpos($basename, '.');
        if ($dot !== false) {
            $extension = substr($basename, $dot + 1);
        }

        return [
            'type' => 'file',
            'path' => $path,
            'basename' => $basename,
            'dirname' => $dirname,
            'filename' => $basename,
            'extension' => $extension,
            'size' => $size,
            'timestamp' => time(),
            'visibility' => true,
        ];
    }

    /**
     * A `"` cannot travel in the multipart `filename` header, so such a name is uploaded under a temporary one and moved.
     *
     * @param  resource|string  $contents
     * @return bool false when a folder already holds the name
     */
    private function writeFile(FilesApi $api, Application $application, string $dir, string $name, $contents): bool
    {
        if (preg_match('/["\r\n]/', $name) !== 1) {
            $api->upload($application->engineProject(), $this->enginePath($dir), $contents, $name);

            return true;
        }

        $full = $this->normalizePath($dir === '' ? $name : $dir.'/'.$name);
        if ($this->isFolder($api, $application, $full)) {
            return false;
        }

        $temporaryName = '.panelalpha-upload-'.bin2hex(random_bytes(8));
        $temporary = $this->normalizePath($dir === '' ? $temporaryName : $dir.'/'.$temporaryName);
        $api->upload($application->engineProject(), $this->enginePath($dir), $contents, $temporaryName);

        try {
            $api->move($application->engineProject(), $this->enginePath($temporary), $this->enginePath($full));
        } catch (EngineRequestException $e) {
            $this->discard($api, $application, $temporary);

            throw $e;
        }

        return true;
    }

    /** `files/mv` nests a file into a folder of the same name instead of replacing it. */
    private function isFolder(FilesApi $api, Application $application, string $path): bool
    {
        try {
            $type = Payload::string($api->stat($application->engineProject(), $this->enginePath($path))['type'] ?? '');
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return false;
        }

        return $type !== '' && $type !== 'file';
    }

    /** Remove an upload that never reached its name; a failed removal leaves a hidden temporary file. */
    private function discard(FilesApi $api, Application $application, string $path): void
    {
        try {
            $api->remove($application->engineProject(), $this->enginePath($path));
        } catch (EngineRequestException $e) {
            report($e);
        }
    }

    private function assertFilename(string $name): string
    {
        // PHP's upload part cuts a name at its last backslash.
        if (
            $name === '' || $name === '.' || $name === '..'
            || strlen($name) > 255
            || str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, "\0")
        ) {
            throw ValidationException::withMessages(['name' => ['Invalid file name.']]);
        }

        return $name;
    }

    /**
     * The fm SPA stores `uploadMaxFilesize` in bytes (its default is
     * `1024*1024*1024`), so convert the configured/ini value.
     */
    private function uploadMaxFilesize(): int
    {
        $configured = Payload::int(config('client-area.upload_max_bytes', 0)) ?? 0;
        if ($configured > 0) {
            return $configured;
        }

        return $this->toBytes((string) ini_get('upload_max_filesize'));
    }

    private function toBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '') {
            return 0;
        }

        $unit = strtolower(substr($value, -1));
        $number = (int) $value;

        return match ($unit) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => (int) $value,
        };
    }
}
