<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Support\Payload;
use Psr\Http\Message\StreamInterface;

/**
 * Engine file endpoints for one project (the file
 * manager). Thin and stateless; all Engine paths for this area live here.
 *
 * Paths are home-relative (`public_html/index.php`); the Engine confines them.
 */
final class FilesApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * The Engine answers `{exists: bool, path: string}` (FileController::exists).
     * The body is untrusted JSON: a 200 without a boolean `exists` is malformed,
     * so it becomes the Engine error the callers already handle for a failed
     * existence check instead of an undefined-key error.
     *
     * @return array{exists: bool, path?: string}
     */
    public function exists(EngineProject $project, string $path): array
    {
        $data = Payload::object($this->engine->get($project->enginePath('files/exists'), ['path' => $path])->json());

        $exists = $data['exists'] ?? null;
        if (! is_bool($exists)) {
            throw new EngineRequestException(400, 'The Engine did not answer whether the file exists.');
        }

        $result = ['exists' => $exists];
        $filePath = Payload::nullableString($data['path'] ?? null);
        if ($filePath !== null) {
            $result['path'] = $filePath;
        }

        return $result;
    }

    /**
     * File stats. The Engine answers `{data:{name,path,type,size,mtime,mode,uid,
     * gid,target,target_type,has_subdirectories}}`
     * (`FileController::stat` `core/app/Http/Controllers/User/FileController.php:540`,
     * `OpenApi/Schemas/FileEntrySchema.php:10-20`); the pre-29ae bare
     * `{file_name,size,…}` object is gone.
     *
     * @return array<string, mixed>
     */
    public function stat(EngineProject $project, string $path): array
    {
        return Payload::object($this->engine->get($project->enginePath('files/stat'), ['path' => $path])->json('data'));
    }

    /**
     * One directory's entries (Engine `files/list`, since 29ae).
     * The Engine answers `{data:[FileEntry], meta:{path,truncated,total}}`:
     * `core/app/Http/Controllers/User/FileController.php:599`,
     * `core/app/OpenApi/Schemas/FileEntrySchema.php:10`, entry keys
     * `{name,path,type,size,mtime,mode,uid,gid,target,target_type,has_subdirectories}`
     * (`core/app/System/Project/FileManager.php:303`). `show_hidden` defaults to
     * true on the Engine (old `ls -lA` showed dotfiles); `path` is home-relative
     * with a leading slash and `/` for the home root.
     *
     * @return list<array<string, mixed>>
     */
    public function list(EngineProject $project, string $path, bool $showHidden = true): array
    {
        return Payload::objects($this->engine->get($project->enginePath('files/list'), [
            'path' => $path,
            'show_hidden' => $showHidden ? 1 : 0,
        ])->json('data'));
    }

    /**
     * A webp thumbnail of an image (Engine `files/thumbnail`, since
     * 29ae): `core/app/Http/Controllers/User/FileController.php:764`,
     * `core/app/Http/Requests/Files/ThumbnailRequest.php:9` (`width`/`height`
     * 16–1024, `fit` `cover|contain`); the body is `image/webp`. A non-image or
     * an oversized image answers 422, a missing path 404.
     */
    public function thumbnail(EngineProject $project, string $path, int $width, int $height, string $fit): string
    {
        return $this->engine->get($project->enginePath('files/thumbnail'), [
            'path' => $path,
            'width' => $width,
            'height' => $height,
            'fit' => $fit,
        ])->body();
    }

    /**
     * @param  callable(StreamInterface, \Illuminate\Http\Client\Response): void  $sink
     * @param  array<string, mixed>  $options  Guzzle options (query/headers…)
     */
    public function download(EngineProject $project, string $path, callable $sink, array $options = []): void
    {
        $query = ['path' => $path];
        $range = Payload::nullableString($options['range'] ?? null);

        $this->engine->download($project->enginePath('files/download'), $query, $sink, $range);
    }

    /**
     * Open a home-relative file as a streamed Engine response, so the caller can
     * copy the status (206) and headers before streaming the body.
     */
    public function downloadStream(EngineProject $project, string $path, ?string $range = null): Response
    {
        $options = ['query' => ['path' => $path]];
        if (is_string($range) && $range !== '') {
            $options['headers'] = ['Range' => $range];
        }

        return $this->engine->stream('GET', $project->enginePath('files/download'), $options);
    }

    public function remove(EngineProject $project, string $path, bool $recursive = true): Response
    {
        return $this->engine->delete($project->enginePath('files/remove'), ['path' => $path, 'recursive' => $recursive]);
    }

    public function mkdir(EngineProject $project, string $path): Response
    {
        return $this->engine->post($project->enginePath('files/mkdir'), ['path' => $path, 'parents' => true]);
    }

    public function move(EngineProject $project, string $source, string $destination): Response
    {
        return $this->engine->put($project->enginePath('files/mv'), ['source_path' => $source, 'dest_path' => $destination]);
    }

    public function copy(EngineProject $project, string $source, string $destination): Response
    {
        return $this->engine->put($project->enginePath('files/cp'), ['source_path' => $source, 'dest_path' => $destination]);
    }

    /**
     * Upload a file into a home-relative directory (multipart `file`).
     *
     * @param  resource|string  $contents
     */
    public function upload(EngineProject $project, string $directory, $contents, string $filename): Response
    {
        return $this->engine->upload($project->enginePath('files/upload'), ['path' => $directory], [
            'name' => 'file',
            'contents' => $contents,
            'filename' => $filename,
        ]);
    }

    public function zip(EngineProject $project, string $zipPath, string $path): Response
    {
        return $this->engine->post($project->enginePath('files/zip'), ['zip_path' => $zipPath, 'path' => $path]);
    }

    public function unzip(EngineProject $project, string $zipPath, string $path): Response
    {
        return $this->engine->post($project->enginePath('files/unzip'), ['zip_path' => $zipPath, 'path' => $path]);
    }

    /**
     * Run a WP-CLI command inside the project (classic projects have no
     * ssh/command). Returns the raw `{exit_code, stdout, stderr}`.
     *
     * The deployed Engine (develop) serves this at
     * `wp-cli/command`; `wp/command` exists only on `feat/wordpress`.
     *
     * @param  list<string>  $args
     * @return array<string, mixed>
     */
    public function wpCommand(EngineProject $project, array $args): array
    {
        return Payload::object($this->engine->post($project->enginePath('wp-cli/command'), ['args' => $args])->json());
    }

    /**
     * Run a whole shell command line in a container (DinD) project, as the
     * account (Engine `ssh/command`). Returns `{stdout, stderr,
     * exit_code}`; the Engine answers 422 for non-dind projects.
     *
     * @return array<string, mixed>
     */
    public function sshCommand(EngineProject $project, string $command, ?string $cwd = null, ?int $timeout = null): array
    {
        return Payload::object($this->engine->post($project->enginePath('ssh/command'), array_filter([
            'command' => $command,
            'cwd' => $cwd,
            'timeout' => $timeout,
        ], static fn ($v) => $v !== null))->json());
    }

    // ---- Section F: logs -------------------------------------------------

    /**
     * The newest lines of the project's PHP error log (Engine
     * `GET /projects/{u}/php/error-log?lines=`, `PhpController::errorLog`,
     * `{data: {lines, file, size, mtime, truncated}}`). A classic project reads its own `php_error.log`; a dind
     * project answers its application container's output with `file: null`.
     * `lines` is 1..5000 on the Engine (`PhpErrorLogRequest`). The body is
     * untrusted: a non-string line is dropped.
     *
     * @return list<string>
     */
    public function phpErrorLog(EngineProject $project, int $lines): array
    {
        $data = Payload::object($this->engine->get($project->enginePath('php/error-log'), ['lines' => $lines])->json('data'));

        return Payload::strings($data['lines'] ?? null);
    }

    /**
     * The domain's webserver log files (Engine `domains/{d}/log-files`).
     *
     * @return list<array<string, mixed>>
     */
    public function logFiles(EngineProject $project, string $domain): array
    {
        return Payload::objects($this->engine->get(
            $project->enginePath('domains/'.rawurlencode($domain).'/log-files'),
            ['all_webservers' => 1],
        )->json('data'));
    }

    /**
     * Read a log file (optionally only its tail). Returns the bytes.
     */
    public function logFileContents(EngineProject $project, string $domain, string $filename, ?int $maxBytes = null): string
    {
        $endpoint = $project->enginePath('domains/'.rawurlencode($domain).'/log-files/'.rawurlencode($filename));
        $query = ['all_webservers' => 1];

        try {
            return $this->tail($endpoint, $query, $maxBytes, $maxBytes);
        } catch (EngineRequestException $e) {
            // A suffix `Range: bytes=-N` longer than the file
            // makes the Engine answer 416. Re-read without the Range header and
            // take the tail locally.
            if ($maxBytes === null || $e->engineStatus !== 416) {
                throw $e;
            }

            return $this->tail($endpoint, $query, null, $maxBytes, $maxBytes);
        }
    }

    /**
     * Read bytes `$first..$last` (inclusive) of a domain log file with
     * `Range: bytes=$first-$last` (the Engine answers 206). No 416 fallback: a
     * range past the file's end surfaces as an `EngineRequestException` with
     * `engineStatus` 416 and the caller decides. The read stops after the
     * requested length.
     */
    public function logFileRange(EngineProject $project, string $domain, string $filename, int $first, int $last): string
    {
        $limit = max(0, $last - $first + 1);
        $contents = '';
        $this->engine->download(
            $project->enginePath('domains/'.rawurlencode($domain).'/log-files/'.rawurlencode($filename)),
            ['all_webservers' => 1],
            function (StreamInterface $body) use (&$contents, $limit): void {
                while (! $body->eof() && strlen($contents) < $limit) {
                    $contents .= $body->read(8192);
                }
            },
            'bytes='.$first.'-'.$last,
        );

        return substr($contents, 0, $limit);
    }

    /**
     * Stream a log file to the given sink (Engine `files/download`).
     */
    /**
     * @param  callable(StreamInterface, \Illuminate\Http\Client\Response): void  $sink
     */
    public function streamLogFile(EngineProject $project, string $domain, string $filename, callable $sink): void
    {
        $this->engine->download(
            $project->enginePath('domains/'.rawurlencode($domain).'/log-files/'.rawurlencode($filename)),
            ['all_webservers' => 1],
            $sink,
        );
    }

    /**
     * Read a home-relative file (optionally only its tail), e.g.
     * `{docroot}/wp-content/debug.log`. The Engine error is reported and
     * rethrown; a caller that treats a missing file as empty catches it itself.
     *
     * @throws \PanelAlpha\EngineClient\Exceptions\EngineException
     */
    public function readFile(EngineProject $project, string $path, ?int $maxBytes = null): string
    {
        $endpoint = $project->enginePath('files/download');
        $query = ['path' => $path];

        try {
            return $this->tail($endpoint, $query, $maxBytes !== null ? 2 * $maxBytes : null, $maxBytes);
        } catch (EngineRequestException $e) {
            // The same 416 fallback as `logFileContents` –
            // re-read without a Range header and take the tail locally.
            if ($maxBytes !== null && $e->engineStatus === 416) {
                return $this->tail($endpoint, $query, null, $maxBytes, 2 * $maxBytes);
            }

            // A missing file is a caller-decided state (a missing debug.log is
            // normal) – never report a 404. Real failures still
            // bubble after being reported.
            if ($e->engineStatus !== 404) {
                report($e);
            }

            throw $e;
        } catch (\Throwable $e) {
            report($e);

            throw $e;
        }
    }

    /**
     * Download $endpoint and return its trailing bytes.
     * `$rangeBytes` asks the Engine for that many
     * bytes from the end (null downloads the whole file); `$keepBytes` caps the
     * returned string. `$readCap` bounds the read when the caller asked for a
     * Range but the fallback omits the header – the 416 that triggered it
     * proves the file is shorter than the original range.
     *
     * @param  array<string, mixed>  $query
     */
    private function tail(string $endpoint, array $query, ?int $rangeBytes, ?int $keepBytes, ?int $readCap = null): string
    {
        $limit = $readCap ?? $rangeBytes;
        $contents = '';
        $this->engine->download($endpoint, $query, function ($body) use (&$contents, $limit): void {
            while (! $body->eof()) {
                $contents .= $body->read(8192);
                if ($limit !== null && strlen($contents) >= $limit) {
                    break;
                }
            }
        }, $rangeBytes !== null ? 'bytes=-'.$rangeBytes : null);

        // Read the whole bounded response before slicing, so the result is the
        // file's tail – not the head the read happened to buffer.
        return $keepBytes === null ? $contents : substr($contents, -$keepBytes);
    }

    /**
     * Open a log file's Engine response body without consuming it. The request
     * runs now, so a down Engine still raises before the caller sends headers
     * (the download routes need that).
     */
    public function openLogFileStream(EngineProject $project, string $domain, string $filename): StreamInterface
    {
        return $this->engine
            ->stream('GET', $project->enginePath('domains/'.rawurlencode($domain).'/log-files/'.rawurlencode($filename)), ['query' => ['all_webservers' => 1]])
            ->toPsrResponse()
            ->getBody();
    }

    /**
     * Stream a home-relative file to the sink.
     */
    /**
     * @param  callable(StreamInterface, \Illuminate\Http\Client\Response): void  $sink
     */
    public function streamFile(EngineProject $project, string $path, callable $sink): void
    {
        $this->engine->download($project->enginePath('files/download'), ['path' => $path], $sink);
    }

    /**
     * Open a home-relative file's Engine response body without consuming it
     * (same pre-flight reason as `openLogFileStream`).
     */
    public function openFileStream(EngineProject $project, string $path): StreamInterface
    {
        return $this->engine
            ->stream('GET', $project->enginePath('files/download'), ['query' => ['path' => $path]])
            ->toPsrResponse()
            ->getBody();
    }
}
