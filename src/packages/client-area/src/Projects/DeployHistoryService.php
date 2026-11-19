<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;

/**
 * The deploy history and the live deploy view of a container project, read from
 * the Engine (which lists them since `53c9a6ff4`).
 *
 * The Engine lists the deploys it keeps a log of, newest first
 * (`GET /projects/{u}/deploys`), whoever started them – the panel, Connect AI/MCP,
 * `pae` or a deploy hook – and pages any kept deploy's log by its id
 * (`GET /projects/{u}/deploys/{id}/log`). A deploy the Engine no longer keeps is
 * not shown. The only panel-side entries are the task-log tails of watched
 * deploys that never had a log the Engine could list ({@see DeployTaskTail},
 * the fallback); their CA id is `task-<engine task id>`.
 *
 * Each entry is normalised to the Client Area's vocabulary here (status,
 * `source_type`, the warning of a partial deploy) and shaped by
 * `DeployHistoryPresenter`.
 */
final class DeployHistoryService
{
    /**
     * The CA's `{logId}`: an Engine deploy id (`Ymd-His-<6 hex>`, Engine
     * `Lib/Deploy/DeployLog/DeployLogger.php:128`) or a stored task tail.
     */
    public const LOG_ID_PATTERN = '[0-9]{8}-[0-9]{6}-[0-9a-f]{6}|task-[0-9]+';

    private const TAIL_PREFIX = 'task-';

    /**
     * Log pages (2000 lines each, `DeployLogReader::MAX_READ_LINES`) read for one
     * deploy's show or download before the rest is left out.
     */
    public const MAX_LOG_PAGES = 50;

    /** The line `DeployLogger::stage()` opens a stage with. */
    private const STAGE_OPENING = 'Starting stage: ';

    /**
     * The deploy history, newest first: every deploy the Engine keeps, plus the
     * stored task tails the Engine does not list. An Engine failure bubbles.
     *
     * @return list<DeployEntry>
     */
    public function history(Application $application): array
    {
        $entries = [];
        $listed = [];
        foreach ((new ProjectsApi($application->engine()))->deploys($application->engineProject()) as $item) {
            $entry = $this->fromEngine($application, $item);
            if ($entry === null) {
                continue;
            }
            $entries[] = $entry;
            $listed[] = $entry->engineDeployId;
        }

        foreach ($this->tails($application) as $tail) {
            // A tail whose deploy the Engine still lists would show it twice.
            if ($tail->engine_deploy_id !== null && in_array($tail->engine_deploy_id, $listed, true)) {
                continue;
            }
            $entries[] = $this->fromTail($tail);
        }

        // Engine deploy ids start with their start time, so the Engine's list is
        // already newest first; the stored tails are merged in by start time.
        usort($entries, static fn (DeployEntry $a, DeployEntry $b): int => ($b->startedAt?->getTimestamp() ?? 0) <=> ($a->startedAt?->getTimestamp() ?? 0));

        return $entries;
    }

    /**
     * One deploy with its whole log (paged from the Engine), or a stored task
     * tail. An unknown id is a 404, like the old `findOrFail`.
     *
     * @return array{entry: DeployEntry, lines: list<array{ts: int, stage: string|null, level: string, msg: string}>}
     */
    public function find(Application $application, string $logId): array
    {
        if (str_starts_with($logId, self::TAIL_PREFIX)) {
            $tail = DeployTaskTail::query()
                ->where('application_id', $application->id)
                ->where('engine_task_id', (int) substr($logId, strlen(self::TAIL_PREFIX)))
                ->first();
            if ($tail === null) {
                abort(404);
            }

            return ['entry' => $this->fromTail($tail), 'lines' => $tail->parsedLines()];
        }

        $api = new ProjectsApi($application->engine());
        // The Engine keeps only its newest deploy logs: a pruned or unknown
        // deploy is its 404 "Deploy not found", which renders as the CA's 404
        // like the old `findOrFail`.
        $read = $api->deployLogOf($application->engineProject(), $logId);
        $entry = $this->fromEngine($application, $read);
        if ($entry === null) {
            abort(404);
        }

        $lines = [];
        $offset = 0;
        for ($page = 1; ; $page++) {
            foreach (Payload::objects($read['lines'] ?? null) as $line) {
                $lines[] = self::line($line);
            }

            $next = Payload::int($read['next_offset'] ?? null) ?? $offset;
            if (($read['more'] ?? false) !== true || $next <= $offset || $page >= self::MAX_LOG_PAGES) {
                break;
            }
            $offset = $next;
            $read = $api->deployLogOf($application->engineProject(), $logId, $offset);
        }

        return ['entry' => $entry, 'lines' => $lines];
    }

    /**
     * The live view: the running deploy the Engine lists and its current log page
     * (`deploy-log`, which also carries `stage` and `stages`), accepted only when
     * the page is that deploy's (`id` equal). With nothing running, both halves
     * are null and the CA keeps polling; once the CA follows a deploy
     * (`offset > 0`), the newest deploy is served after it ended too, so the poll
     * sees its terminal status. An Engine failure answers both halves null, as a
     * poll must not fail.
     *
     * @return array{panel: DeployEntry|null, engine: array<string, mixed>|null}
     */
    public function live(Application $application, int $offset = 0): array
    {
        try {
            $api = new ProjectsApi($application->engine());
            $newest = null;
            foreach ($api->deploys($application->engineProject()) as $item) {
                $newest = $this->fromEngine($application, $item);
                break;
            }

            if ($newest === null || ($newest->status !== DeployState::STATUS_RUNNING && $offset <= 0)) {
                return ['panel' => null, 'engine' => null];
            }

            $page = $api->deployLog($application->engineProject(), max(0, $offset));
        } catch (EngineException $e) {
            report($e);

            return ['panel' => null, 'engine' => null];
        }

        if (Payload::string($page['id'] ?? null) !== $newest->engineDeployId) {
            // The Engine already serves a newer deploy's log than the one it
            // listed: answer the listed deploy and wait for the next poll.
            return ['panel' => $newest, 'engine' => null];
        }

        // The CA's live error box shows this `error` (DeployLogsViewer.vue:280-281);
        // an Engine-internal path must not reach it, while the streamed `lines`
        // stay exactly as the Engine sent them.
        $error = Payload::nullableString($page['error'] ?? null);
        if ($error !== null && $error !== '') {
            $page['error'] = EngineText::sanitize($error);
        }

        return ['panel' => $newest, 'engine' => $page];
    }

    /**
     * The stages of a deploy, rebuilt from its log the way the Engine records
     * them (`DeployLogger::stage()` writes `Starting stage: <name>` and closes the
     * open stage when the next starts or the deploy finishes,
     * `DeployStatus::closeOpenStage`): `{name, started_at, finished_at}`, unix
     * seconds.
     *
     * The stage a failed or cancelled deploy died in stays open: it never finished.
     *
     * @param  list<array{ts: int, stage: string|null, level: string, msg: string}>  $lines
     * @return list<array{name: string, started_at: int, finished_at: int|null}>
     */
    public static function stages(array $lines, ?Carbon $finishedAt, ?string $status = null): array
    {
        $stages = [];
        $open = null;
        foreach ($lines as $line) {
            if (! str_starts_with($line['msg'], self::STAGE_OPENING)) {
                continue;
            }
            if ($open !== null) {
                $stages[] = ['name' => $open['name'], 'started_at' => $open['started_at'], 'finished_at' => $line['ts']];
            }
            $open = ['name' => substr($line['msg'], strlen(self::STAGE_OPENING)), 'started_at' => $line['ts']];
        }

        if ($open !== null) {
            $aborted = in_array($status, [DeployState::STATUS_FAILED, DeployState::STATUS_CANCELLED], true);
            $stages[] = ['name' => $open['name'], 'started_at' => $open['started_at'], 'finished_at' => $aborted ? null : $finishedAt?->getTimestamp()];
        }

        return $stages;
    }

    /**
     * One Engine history item in the CA's vocabulary, or null without an id.
     *
     * @param  array<string, mixed>  $item
     */
    private function fromEngine(Application $application, array $item): ?DeployEntry
    {
        $id = Payload::nullableString($item['id'] ?? null);
        if ($id === null || $id === '') {
            return null;
        }

        $engineStatus = Payload::nullableString($item['status'] ?? null);
        $status = DeployState::caStatus($engineStatus);
        $error = Payload::nullableString($item['error'] ?? null);
        $error = $error === null || $error === '' ? null : EngineText::sanitize($error);
        // A partial deploy is a finished one with a warning: the CA renders `error` as a red box even on a green
        // deploy.
        $finished = $status === DeployState::STATUS_FINISHED;

        return new DeployEntry(
            id: $id,
            engineDeployId: $id,
            status: $status,
            sourceType: DeployState::sourceType($application, Payload::nullableString($item['source'] ?? null)),
            error: $finished ? null : $error,
            warning: $finished ? self::warningOf($item) : null,
            startedAt: self::time($item['started_at'] ?? null),
            finishedAt: self::time($item['finished_at'] ?? null),
            waitingForFiles: DeployState::waitsForFiles($item),
        );
    }

    /**
     * What a finished deploy warns about: the Engine's `warnings` (coded findings
     * on a partial deploy, one per line), or the sentences of an older Engine
     * that kept them in `error`.
     *
     * @param  array<string, mixed>  $item
     */
    private static function warningOf(array $item): ?string
    {
        $messages = [];
        foreach (Payload::objectsOrStrings($item['warnings'] ?? null) as $warning) {
            $message = is_string($warning) ? $warning : Payload::nullableString($warning['message'] ?? null);
            $message = $message === null ? '' : trim(EngineText::sanitize($message));
            if ($message !== '') {
                $messages[] = $message;
            }
        }

        if ($messages !== []) {
            return implode("\n", $messages);
        }

        $error = Payload::nullableString($item['error'] ?? null);
        $error = $error === null ? '' : trim(EngineText::sanitize($error));

        return $error === '' ? null : $error;
    }

    private function fromTail(DeployTaskTail $tail): DeployEntry
    {
        $finished = $tail->status === DeployState::STATUS_FINISHED;

        return new DeployEntry(
            id: self::TAIL_PREFIX.$tail->engine_task_id,
            engineDeployId: $tail->engine_deploy_id,
            status: $tail->status,
            sourceType: $tail->source_type,
            error: $finished ? null : $tail->error,
            warning: $finished ? $tail->error : null,
            startedAt: $tail->started_at,
            finishedAt: $tail->finished_at,
        );
    }

    /**
     * @return iterable<int, DeployTaskTail>
     */
    private function tails(Application $application): iterable
    {
        return DeployTaskTail::query()
            ->where('application_id', $application->id)
            ->orderByDesc('id')
            ->get();
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array{ts: int, stage: string|null, level: string, msg: string}
     */
    private static function line(array $line): array
    {
        return [
            'ts' => Payload::int($line['ts'] ?? null) ?? 0,
            'stage' => Payload::nullableString($line['stage'] ?? null),
            'level' => Payload::nullableString($line['level'] ?? null) ?? 'dim',
            'msg' => Payload::string($line['msg'] ?? ''),
        ];
    }

    /**
     * An Engine time is unix seconds (`DeployHistory::latestOutcome`,
     * `loggedOutcome`).
     */
    private static function time(mixed $value): ?Carbon
    {
        $seconds = Payload::int($value);

        return $seconds === null || $seconds <= 0 ? null : Carbon::createFromTimestampUTC($seconds);
    }
}
