<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployEntry;
use PanelAlpha\ClientArea\Projects\DeployHistoryService;

/**
 * Shapes the Engine's deploy history the way the Client Area reads it
 * (the keys of the old `deploy_logs` resource, old App\Models\DeployLog +
 * DeployLogController).
 *
 * The list omits the log; the show endpoint adds `lines` and the `stages`
 * rebuilt from them; download returns `{data: <text>, filename}`. Times are
 * ISO-8601 strings like the old rows' (the CA formats them with moment,
 * `components/deploy/deployLogUi.js:35-40`).
 */
final class DeployHistoryPresenter
{
    /**
     * One history item, without its log.
     *
     * @return array<string, mixed>
     */
    public function presentList(Application $application, DeployEntry $entry): array
    {
        $startedAt = $entry->startedAt?->toJSON();

        return [
            'id' => $entry->id,
            'application_id' => $application->id,
            'source_type' => $entry->sourceType,
            'status' => $entry->status,
            'engine_deploy_id' => $entry->engineDeployId,
            // The list never carried a log; its stages are the show endpoint's.
            'stages' => [],
            'error' => $entry->error,
            'warning' => $entry->warning,
            'started_at' => $startedAt,
            'finished_at' => $entry->finishedAt?->toJSON(),
            // The Engine has no separate creation time: a deploy is created
            // when it starts.
            'created_at' => $startedAt,
        ];
    }

    /**
     * One deploy with its log lines.
     *
     * @param  list<array{ts: int, stage: string|null, level: string, msg: string}>  $lines
     * @return array<string, mixed>
     */
    public function present(DeployEntry $entry, array $lines): array
    {
        return [
            'id' => $entry->id,
            'status' => $entry->status,
            'source_type' => $entry->sourceType,
            'engine_deploy_id' => $entry->engineDeployId,
            'stages' => DeployHistoryService::stages($lines, $entry->finishedAt, $entry->status),
            'lines' => $lines,
            'error' => $entry->error,
            'warning' => $entry->warning,
            'started_at' => $entry->startedAt?->toJSON(),
            'finished_at' => $entry->finishedAt?->toJSON(),
        ];
    }

    /**
     * The live view the CA polls: the running deploy (so it can download once
     * the deploy ends) and the Engine page.
     *
     * @param  array<string, mixed>|null  $engine
     * @return array{panel: array<string, mixed>|null, engine: array<string, mixed>|null}
     */
    public function live(?DeployEntry $panel, ?array $engine): array
    {
        return [
            'panel' => $panel === null ? null : [
                'id' => $panel->id,
                'status' => $panel->status,
                'source_type' => $panel->sourceType,
                'started_at' => $panel->startedAt?->toJSON(),
            ],
            'engine' => $engine,
        ];
    }

    /**
     * @param  list<array{ts: int, stage: string|null, level: string, msg: string}>  $lines
     * @return array{data: string, filename: string}
     */
    public function presentDownload(DeployEntry $entry, array $lines): array
    {
        $out = [];
        foreach ($lines as $line) {
            $ts = $line['ts'] > 0 ? date('Y-m-d H:i:s', $line['ts']) : '-------------------';
            $out[] = '['.$ts.'] ['.($line['stage'] ?? '-').'] '.$line['msg'];
        }

        return [
            'data' => implode("\n", $out),
            'filename' => "deploy-log-{$entry->id}.txt",
        ];
    }
}
