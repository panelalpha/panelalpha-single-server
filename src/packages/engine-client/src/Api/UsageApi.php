<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine bandwidth/visitor reporting for one project.
 * Thin and stateless; all Engine paths for this area live here.
 */
final class UsageApi
{
    /** The CA's `{type}` → Engine visitor dimension. */
    public const DIMENSIONS = [
        'visits-by-page' => 'pages',
        'visits-by-country' => 'countries',
        'visits-by-continent' => 'continents',
        'visits-by-region' => 'regions',
        'visits-by-referrer' => 'referrers',
        'visits-by-device-os' => 'os',
        'visits-by-device-browser' => 'browsers',
    ];

    public function __construct(readonly EngineClient $engine) {}

    /**
     * Project resource usage. The Engine answers with **bare** JSON, not a
     * `data` envelope (Engine: core/routes/api.php:149 → UsageController::getUsage).
     *
     * @return array<string, mixed>
     */
    public function usage(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('usage'))->json());
    }

    /**
     * @return array<string, mixed>
     */
    public function bandwidth(EngineProject $project, string $start, string $end, string $groupBy): array
    {
        return Payload::object($this->engine->get($project->enginePath('bandwidth'), [
            'start' => $start,
            'end' => $end,
            'group_by' => $groupBy,
        ])->json());
    }

    /**
     * @return array<string, mixed>
     */
    public function visitors(EngineProject $project, string $domain, string $start, string $end): array
    {
        return Payload::object($this->engine->get($project->enginePath('domains/'.rawurlencode($domain).'/visitors'), [
            'start' => $start,
            'end' => $end,
        ])->json());
    }

    /**
     * @return array<string, mixed>
     */
    public function visitorBreakdown(EngineProject $project, string $domain, string $dimension, string $start, string $end): array
    {
        return Payload::object($this->engine->get(
            $project->enginePath('domains/'.rawurlencode($domain).'/visitors/'.rawurlencode($dimension)),
            ['start' => $start, 'end' => $end],
        )->json());
    }
}
