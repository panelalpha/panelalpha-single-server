<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Http\Client\Response;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Psr\Http\Message\StreamInterface;

/**
 * Webserver / PHP / WordPress log readers for one project.
 *
 * The Engine serves the domain's log files (`domains/{d}/log-files`); the panel
 * shapes the CA's `{name, plain_text, size}` list and reads/downloads files.
 * PHP logs come from the Engine's PHP error-log endpoint (`php/error-log`)
 * for classic and dind projects alike; the old
 * panel read the Apache error log instead. WordPress debug.log is read from the
 * install's own `wp-content/debug.log` through `files/download`.
 */
final class LogService
{
    public function __construct(private readonly DocumentRootResolver $documentRoot) {}

    private const PREVIEW_BYTES = 50 * 1024;

    /**
     * Lines the PHP log view asks for; the old view showed the last
     * PREVIEW_BYTES of the file, which the result is still capped to.
     */
    public const int PHP_LOG_VIEW_LINES = 1000;

    /** The PHP log's name on the Engine's list of a classic project. */
    private const PHP_LOG_FILE = 'php_error.log';

    /** Lines the PHP log download carries: the Engine's maximum (`PhpErrorLogRequest`). */
    public const int PHP_LOG_DOWNLOAD_LINES = 5000;

    private function api(Application $application): FilesApi
    {
        return new FilesApi($application->engine());
    }

    /**
     * @return list<array{name: string, plain_text: bool, size: int|null}>
     */
    public function webserverLogFiles(Application $application): array
    {
        $files = $this->api($application)->logFiles($application->engineProject(), (string) $application->domain);

        $mapped = array_map(fn (array $file) => [
            'name' => Payload::string($file['file'] ?? ''),
            'plain_text' => $this->isPlainText(Payload::string($file['file'] ?? '')),
            'size' => Payload::int($file['size'] ?? null),
        ], $files);

        // Plain-text files first (old collection sort).
        usort($mapped, static fn (array $a, array $b) => ($b['plain_text'] <=> $a['plain_text']));

        return $mapped;
    }

    public function webserverLog(Application $application, string $filename): string
    {
        $this->assertFilename($filename);

        return $this->api($application)->logFileContents(
            $application->engineProject(),
            (string) $application->domain,
            $filename,
            self::PREVIEW_BYTES,
        );
    }

    /**
     * One page of a webserver log file for the paged view of
     * client-area-next (`LogWindow`): the file's size comes from the Engine's
     * list, the page's bytes from one `Range: bytes=a-b` read. A file the list
     * does not hold is a 404 (as the Engine's answer for a missing file), a
     * page past the last one a 422 on `page`, and an Engine 416 (the file
     * shrank since the list, e.g. after a rotation) a 409.
     *
     * @return array{lines: list<string>, page: int, pages: int, size: int|null, window: int}
     */
    public function webserverLogPage(Application $application, string $filename, int $page, ?int $size): array
    {
        $this->assertFilename($filename);

        $api = $this->api($application);
        $project = $application->engineProject();
        $domain = (string) $application->domain;

        $fileSize = $this->listedFileSize($api->logFiles($project, $domain), $filename);
        abort_if($fileSize === null, 404, 'Log file not found.');

        return $this->logPage($page, $size, $fileSize, static fn (int $first, int $last): string => $api->logFileRange($project, $domain, $filename, $first, $last));
    }

    /**
     * One page of the PHP error log for the paged view of client-area-next.
     * A classic project lists `php_error.log` with the Engine's log files, so it
     * pages like a webserver log (`log-files/php_error.log`). A dind project has
     * no such file: its Engine tail (`php/error-log?lines=1000`, file order) is
     * the one and only page, and a later page is a 422 like a page past the end.
     *
     * @return array{lines: list<string>, page: int, pages: int, size: int|null, window: int}
     */
    public function phpLogPage(Application $application, int $page, ?int $size): array
    {
        $api = $this->api($application);
        $project = $application->engineProject();
        $domain = (string) $application->domain;

        $fileSize = $this->listedFileSize($api->logFiles($project, $domain), self::PHP_LOG_FILE);
        if ($fileSize !== null) {
            return $this->logPage($page, $size, $fileSize, static fn (int $first, int $last): string => $api->logFileRange($project, $domain, self::PHP_LOG_FILE, $first, $last));
        }

        if ($page > 1) {
            throw ValidationException::withMessages(['page' => ['The page is past the end of the log.']]);
        }

        return [
            'lines' => array_map(static fn (string $line): string => mb_scrub($line, 'UTF-8'), $api->phpErrorLog($project, self::PHP_LOG_VIEW_LINES)),
            'page' => 1,
            'pages' => 1,
            'size' => null,
            'window' => LogWindow::WINDOW,
        ];
    }

    /**
     * @param  callable(int, int): string  $read  reads bytes `first..last` of the file
     * @return array{lines: list<string>, page: int, pages: int, size: int|null, window: int}
     */
    private function logPage(int $page, ?int $size, int $fileSize, callable $read): array
    {
        try {
            $window = LogWindow::for($fileSize, $size, $page);
        } catch (\OutOfRangeException) {
            throw ValidationException::withMessages(['page' => ['The page is past the end of the log.']]);
        }

        $bytes = '';
        if ($window->hasBytes()) {
            try {
                $bytes = $read($window->readFirst, $window->readLast);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 416) {
                    throw $e;
                }

                abort(409, 'The log file changed while it was read. Load the first page again.');
            }
        }

        return [
            // Log lines are not guaranteed UTF-8; a bad byte must not break the JSON.
            'lines' => array_map(static fn (string $line): string => mb_scrub($line, 'UTF-8'), $window->lines($bytes)),
            'page' => $page,
            'pages' => $window->pages,
            'size' => $window->size,
            'window' => LogWindow::WINDOW,
        ];
    }

    /**
     * The size the Engine's list gives the file; null when the list does not
     * hold it.
     *
     * @param  list<array<string, mixed>>  $files
     */
    private function listedFileSize(array $files, string $filename): ?int
    {
        foreach ($files as $file) {
            if (Payload::string($file['file'] ?? '') === $filename) {
                return Payload::int($file['size'] ?? null) ?? 0;
            }
        }

        return null;
    }

    /**
     * @param  callable(StreamInterface, Response): void  $sink
     */
    public function streamWebserverLog(Application $application, string $filename, callable $sink): void
    {
        $this->assertFilename($filename);

        $this->api($application)->streamLogFile($application->engineProject(), (string) $application->domain, $filename, $sink);
    }

    /**
     * Open the log file's Engine stream without sending panel headers, so the
     * download answers the Engine's own 404/503 instead of an empty 200 (S4g).
     */
    public function openWebserverLogStream(Application $application, string $filename): StreamInterface
    {
        $this->assertFilename($filename);

        return $this->api($application)->openLogFileStream($application->engineProject(), (string) $application->domain, $filename);
    }

    /**
     * The PHP log view: the CA shows `data` as text (`fetchData.js:68`), so the
     * Engine's lines are joined back into the log's own text and capped to the
     * old preview size. An empty log is `''` (the CA's empty state).
     */
    public function phpLog(Application $application): string
    {
        return substr($this->phpLogText($application, self::PHP_LOG_VIEW_LINES), -self::PREVIEW_BYTES);
    }

    /**
     * The PHP log download (`php_error.log`). Read before the response is sent,
     * so a down Engine still answers 503/404 instead of an empty 200 (S4g).
     */
    public function phpLogDownload(Application $application): string
    {
        return $this->phpLogText($application, self::PHP_LOG_DOWNLOAD_LINES);
    }

    /**
     * WordPress debug.log: the file lives at
     * `{install path}/wp-content/debug.log` relative to the project home.
     */
    public function wordpressLog(Application $application): string
    {
        // A missing debug.log is the normal state (Engine 404);
        // `FilesApi::readFile` reports and rethrows a real failure, which must
        // still reach the CA.
        try {
            return $this->api($application)->readFile($application->engineProject(), $this->wordpressDebugLogPath($application), self::PREVIEW_BYTES);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return '';
        }
    }

    /**
     * @param  callable(StreamInterface, Response): void  $sink
     */
    public function streamWordpressLog(Application $application, callable $sink): bool
    {
        try {
            $this->api($application)->streamFile($application->engineProject(), $this->wordpressDebugLogPath($application), $sink);

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Null when the debug.log is absent (a normal state, an empty download); a
     * real failure (Engine down) still bubbles so the download answers 503
     * instead of an empty 200 (S4g).
     */
    public function openWordpressLogStream(Application $application): ?StreamInterface
    {
        try {
            return $this->api($application)->openFileStream($application->engineProject(), $this->wordpressDebugLogPath($application));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return null;
        }
    }

    private function phpLogText(Application $application, int $lines): string
    {
        $found = $this->api($application)->phpErrorLog($application->engineProject(), $lines);

        return $found === [] ? '' : implode("\n", $found)."\n";
    }

    private function wordpressDebugLogPath(Application $application): string
    {
        $install = $this->documentRoot->wordpressInstallPath($application);
        if ($install !== null) {
            return $install.'/wp-content/debug.log';
        }

        $docroot = $this->documentRoot->documentRoot($application);

        return ($docroot === '' ? '' : $docroot.'/').'wp-content/debug.log';
    }

    private function isPlainText(string $filename): bool
    {
        return (bool) preg_match('/\.(log|txt)$/i', $filename);
    }

    private function assertFilename(string $filename): void
    {
        abort_unless((bool) preg_match('/^[A-Za-z0-9._-]+$/', $filename), 422, 'Invalid log filename.');
    }
}
