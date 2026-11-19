<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\ClientArea\Hosting\LogService;
use PanelAlpha\ClientArea\Http\Requests\Project\LogPageRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Psr\Http\Message\StreamInterface;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Webserver / PHP / WordPress logs for a project. Reads
 * keep their old `general.view_*_logs` privileges.
 */
final class LogsController extends Controller
{
    public function __construct(private readonly LogService $logs) {}

    public function webserverIndex(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->logs->webserverLogFiles($application)]);
    }

    /**
     * Without `page` the old `{data: string}` tail; with it one page of the
     * file for client-area-next (`{data: {lines, page, pages, size, window}}`).
     */
    public function webserverShow(LogPageRequest $request, Application $application, string $filename): JsonResponse
    {
        $params = $request->validated();
        $page = Payload::int($params['page'] ?? null);

        if ($page === null) {
            return response()->json(['data' => $this->logs->webserverLog($application, $filename)]);
        }

        return response()->json(['data' => $this->logs->webserverLogPage(
            $application,
            $filename,
            $page,
            Payload::int($params['size'] ?? null),
        )]);
    }

    public function webserverDownload(Application $application, string $filename): StreamedResponse
    {
        // Open the Engine stream before the response is sent: a down Engine then
        // still answers 503/404 instead of an empty 200 (S4g).
        $body = $this->logs->openWebserverLogStream($application, $filename);

        return response()->streamDownload(fn () => $this->pump($body), $filename);
    }

    /**
     * Without `page` the old `{data: string}`; with it one page of the PHP
     * error log for client-area-next (same shape as `webserverShow`).
     */
    public function phpShow(LogPageRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $page = Payload::int($params['page'] ?? null);

        if ($page !== null) {
            return response()->json(['data' => $this->logs->phpLogPage(
                $application,
                $page,
                Payload::int($params['size'] ?? null),
            )]);
        }

        return response()->json(['data' => $this->logs->phpLog($application)]);
    }

    public function phpDownload(Application $application): StreamedResponse
    {
        // Read before the response is sent: a down Engine still answers 503/404
        // instead of an empty 200 (S4g).
        $contents = $this->logs->phpLogDownload($application);

        return response()->streamDownload(static function () use ($contents): void {
            echo $contents;
        }, 'php_error.log');
    }

    public function wordpressShow(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->logs->wordpressLog($application)]);
    }

    public function wordpressDownload(Application $application): StreamedResponse
    {
        $body = $this->logs->openWordpressLogStream($application);

        return response()->streamDownload(fn () => $this->pump($body), 'debug.log');
    }

    private function pump(?StreamInterface $body): void
    {
        if ($body === null) {
            return;
        }

        while (! $body->eof()) {
            echo $body->read(8192);
        }
    }
}
