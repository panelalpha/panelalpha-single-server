<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;

/**
 * `GET /projects/{id}/app-health`: what the Engine's probe of a container
 * project's running application found, for the warning next to the project's
 * "Project Details" tab (CA: InstanceStatusTabAlert.vue). The CA used to show
 * a fixed "Missing index file" and "Wrong listen port" on every custom project;
 * the Engine now says whether either is true.
 *
 * Engine: core/app/Http/Controllers/User/AppHealthController.php:102-125 -> show,
 * `{data: {healthy, serving, ports, checks}}`; a project that is not a
 * container project is a 403 (:36-38).
 *
 * Answer: `{data: {available: false}}` for a classic project (no Engine call)
 * or one the Engine does not probe; otherwise `{data: {available: true,
 * healthy, serving, ports, checks}}`, with `ports` as the Engine lists them
 * (the routed port first) and only the failing `error`/`warning` checks. The
 * probe runs inside the project's container on each published port, so one
 * short attempt is asked for and the answer is kept for a minute: the tab bar
 * loads it on every project page.
 */
final class AppHealthController extends Controller
{
    /** Seconds an answer is reused; a redeploy's own result shows within it. */
    public const int CACHE_SECONDS = 60;

    /** Per-port probe timeout asked of the Engine (its default is 5 s × 3 attempts). */
    public const array PROBE = ['timeout' => 3, 'attempts' => 1];

    public static function cacheKey(int $applicationId): string
    {
        return 'client-area:app-health:'.$applicationId;
    }

    public function show(Application $application): JsonResponse
    {
        if (! $application->isContainer()) {
            return response()->json(['data' => ['available' => false]]);
        }

        $report = Cache::remember(
            self::cacheKey($application->id),
            self::CACHE_SECONDS,
            fn (): array => $this->probe($application),
        );

        return response()->json(['data' => $report]);
    }

    /**
     * @return array<string, mixed>
     */
    private function probe(Application $application): array
    {
        try {
            $report = (new ContainersApi($application->engine()))->appHealth($application->engineProject(), self::PROBE);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 403) {
                return ['available' => false];
            }

            throw $e;
        }

        $ports = [];
        foreach (Payload::objects($report['ports'] ?? null) as $port) {
            $ports[] = [
                'port' => Payload::int($port['port'] ?? null),
                'status' => Payload::string($port['status'] ?? null),
                'http_code' => Payload::int($port['http_code'] ?? null),
                'detail' => Payload::string($port['detail'] ?? null),
            ];
        }

        $checks = [];
        foreach (Payload::objects($report['checks'] ?? null) as $check) {
            $severity = Payload::string($check['severity'] ?? null);
            if (Payload::string($check['status'] ?? null) !== 'fail' || ! in_array($severity, ['error', 'warning'], true)) {
                continue;
            }
            $checks[] = [
                'id' => Payload::string($check['id'] ?? null),
                'severity' => $severity,
                'title' => Payload::nullableString($check['title'] ?? null),
                'detail' => Payload::nullableString($check['detail'] ?? null),
                'fix' => Payload::nullableString($check['fix'] ?? null),
            ];
        }

        return [
            'available' => true,
            'healthy' => Payload::bool($report['healthy'] ?? null),
            'serving' => Payload::nullableString($report['serving'] ?? null),
            'ports' => $ports,
            'checks' => $checks,
        ];
    }
}
