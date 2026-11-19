<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine-wide (not project-scoped) endpoints:
 * server metrics. Thin and stateless; all Engine paths for this area live here.
 */
final class ServerApi
{
    /** The `{period}` path segments the Client Area sends → Engine paths. */
    public const METRICS_PERIODS = [
        'current' => 'metrics/current',
        'last-5-minutes' => 'metrics/last-5-minutes',
        'last-hour' => 'metrics/last-hour',
        'last-12-hours' => 'metrics/last-12-hours',
    ];

    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return array<string, mixed>
     */
    public function metrics(string $period): array
    {
        $path = self::METRICS_PERIODS[$period] ?? 'metrics/current';

        return Payload::object($this->engine->get($path)->json('data'));
    }

    /**
     * Engine: core/routes/api.php:540 → ServerMetricsController::history: the
     * server's averages over `range` (1h, 24h, 7d, 30d) in buckets (1h: one
     * minute), oldest first, ending with the last complete bucket; a bucket
     * without samples carries only its `period`.
     *
     * @return list<array<string, mixed>>
     */
    public function history(string $range): array
    {
        return Payload::objects($this->engine->get('metrics/history', ['range' => $range])->json('data'));
    }

    /**
     * The averages of the last hour (the Admin Area's resource alerts):
     * `{avg_cpu_percent, avg_ram_percent}`.
     *
     * @return array<string, mixed>
     */
    public function lastHourAverages(): array
    {
        return Payload::object($this->engine->get('metrics/last-hour-averages')->json('data'));
    }
}
