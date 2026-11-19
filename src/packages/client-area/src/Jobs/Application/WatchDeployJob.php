<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\DeployLogUpdated;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Projects\DeployedCommit;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Throwable;

/**
 * Follows one container-project deploy the panel started to its end
 * (formerly client-area-legacy's `WatchDeployLogJob`, which kept a
 * `deploy_logs` row – the history is the Engine's now, so this job keeps
 * none).
 *
 * It polls `GET tasks/{taskId}` until the task names its deploy in
 * `details.deploy_id` (`Jobs/RebuildProject.php::recordDeployId`; a create task
 * too since Engine `6763cdc64`, `Jobs/DeployProject.php::recordDeployId`), then
 * accepts only `deploy-log` pages whose `id` equals it (any other page is the
 * previous deploy) and broadcasts each chunk as `DeployLogUpdated` for the CA's
 * live console. It never compares clock values (`started_at` is unix seconds –
 * `Lib/Deploy/DeployLog/DeployStatus.php:66`). `more=true` is drained over
 * re-dispatches; 403/404 from `deploy-log` are terminal, 5xx is a hiccup.
 *
 * When the deploy ends it deletes the staged archive, syncs the mirror, records
 * the deployed commit, announces the rewritten tree and sends the CA
 * notification it was given (`*_finished` / `*_failed`). A partial deploy is a
 * finished one; its Engine `error` is a warning and is not sent.
 *
 * When the task ends without naming a deploy (it failed or was cancelled before
 * the deploy log started, or an older Engine), or a failed create's rollback
 * deleted the deploy log, the Engine's history has nothing to list: the end of
 * the task's own log (`GET tasks/{id}/logs`, which carries every deploy line and
 * the deploy log's last lines, `Lib/Task/DeployLogTail.php`) is kept as the
 * task's {@see DeployTaskTail}. The tail is best
 * effort and never fails the watcher. `failed()` always ends the CA spinner.
 */
final class WatchDeployJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    /** Hard wall-clock cap from the first poll. */
    public const WALL_CLOCK_SECONDS = 3600;

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    /** Engine deploy-log terminal statuses (`DeployLogger`). */
    private const TERMINAL = ['success', 'partial', 'failed', 'cancelled'];

    /**
     * How long after the deploy log's `finished_at` the watcher waits for the
     * deploy's Engine task to end before it notifies anyway. The Engine closes
     * the log before its post-deploy steps (the generation settle, the
     * webserver rebuild, the create follow-up – Engine #1528), and every
     * project action answers 409 busy until the task ends: a notification
     * sent at the log's end lets the CA enable actions 10–50 s too early.
     */
    public const SETTLE_WAIT_SECONDS = 180;

    /**
     * Task-log lines kept when the deploy log is missing: the Engine keeps the
     * last 150 deploy-log lines of a failed deploy on its task
     * (`DeployLogTail::MAX_LINES`).
     */
    public const TASK_LOG_TAIL_LINES = 150;

    /** Task-log pages (2000 lines each) read for the tail before giving up. */
    public const TASK_LOG_MAX_PAGES = 10;

    public function __construct(
        public readonly int $applicationId,
        /** The Engine task of the accepted deploy (null: the 202 carried none). */
        public readonly ?int $taskId,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly int $startedAt = 0,
        public readonly int $offset = 0,
        public readonly int $hiccupAttempt = 0,
        /**
         * Home-relative archive the deployment was started from, deleted once
         * the task ends. Null for git deploys.
         */
        public readonly ?string $archivePath = null,
        /** The Engine deploy id, once the task named it. */
        public readonly ?string $deployId = null,
        /**
         * What the deploy installs from (`git` or `files`), for a kept task
         * tail; null reads it from the project.
         */
        public readonly ?string $sourceType = null,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            // The project is gone; nobody is waiting for the notification.
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        // 1. Resolve the Engine deploy id from the 202 task.
        $deployId = $this->deployId;
        if ($deployId === null) {
            $deployId = $this->resolveDeployId($application, $startedAt);
            if ($deployId === null) {
                return; // finished, retried, or still waiting – handled inside
            }
        }

        // 2. Poll the deploy log; accept only this deploy.
        try {
            $page = (new ProjectsApi($application->engine()))->deployLog($application->engineProject(), $this->offset);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $deployId, $this->offset, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if (in_array($e->engineStatus, [403, 404], true)) {
                if ($this->finishFromFailedTask($application, $deployId, $startedAt)) {
                    return;
                }

                $this->finish($application, DeployState::STATUS_FAILED, 'The Engine has no deploy log for this project.');

                return;
            }

            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, $deployId, $this->offset, $this->hiccupAttempt + 1);

                return;
            }

            $this->finish($application, DeployState::STATUS_FAILED, EngineErrors::message($e));

            return;
        }

        if (Payload::string($page['id'] ?? '') !== $deployId) {
            // The Engine is still serving the previous deploy's log.
            $this->retryLater($application, $startedAt, $deployId, 0, 0);

            return;
        }

        $status = Payload::string($page['status'] ?? 'none');
        $lines = Payload::objects($page['lines'] ?? null);
        $nextOffset = Payload::int($page['next_offset'] ?? $this->offset + count($lines)) ?? ($this->offset + count($lines));

        if (! in_array($status, self::TERMINAL, true)) {
            if ($lines !== []) {
                $this->broadcast($application, $status, $this->offset, $lines, $nextOffset, $page);
            }

            $this->retryLater($application, $startedAt, $deployId, $nextOffset, 0);

            return;
        }

        // Terminal: broadcast this chunk; drain `more=true` over re-dispatches.
        $this->broadcast($application, $status, $this->offset, $lines, $nextOffset, $page);

        if (($page['more'] ?? false) === true) {
            $this->retryLater($application, $startedAt, $deployId, $nextOffset, 0);

            return;
        }

        if ($this->taskStillSettling($application, $page)) {
            $this->retryLater($application, $startedAt, $deployId, $nextOffset, 0);

            return;
        }

        $this->finish($application, DeployState::caStatus($status), $this->errorOf($page));
    }

    /**
     * Whether the deploy's Engine task is still queued or running although its
     * log ended, within {@see self::SETTLE_WAIT_SECONDS} of the log's
     * `finished_at`. Best effort: no task id, no `finished_at`, or a failed
     * task read never holds the notification back.
     *
     * Engine: core/app/Http/Controllers/TaskController.php:180-185 -> show
     * (`TaskResource`, `status` queued|running|completed|failed|cancelled).
     *
     * @param  array<string, mixed>  $page
     */
    private function taskStillSettling(Application $application, array $page): bool
    {
        $finishedAt = Payload::int($page['finished_at'] ?? null);
        if ($this->taskId === null || $finishedAt === null || now()->getTimestamp() - $finishedAt >= self::SETTLE_WAIT_SECONDS) {
            return false;
        }

        try {
            $task = (new TasksApi($application->engine()))->show($this->taskId);
        } catch (Throwable $e) {
            report($e);

            return false;
        }

        return in_array(Payload::string($task['status'] ?? ''), ['queued', 'running'], true);
    }

    /**
     * Safety net: an unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $this->deleteArchive($application);

        // The watcher gave up: whatever it cached about the deploy is the next
        // read's to re-read, not something to keep showing.
        ProjectSourceDetails::forget($application);

        ClientAreaNotificationRequested::dispatch($application, $this->failedType, message: 'The deploy watcher stopped.', isError: true);
    }

    /**
     * Poll the task until `details.deploy_id` exists; returns the id, or null
     * when this dispatch finished the deploy / re-dispatched (both handled here).
     */
    private function resolveDeployId(Application $application, int $startedAt): ?string
    {
        $taskId = $this->taskId;
        if ($taskId === null) {
            $this->finish($application, DeployState::STATUS_FAILED, 'No Engine task was recorded for this deploy.');

            return null;
        }

        try {
            $task = $application->engine()->task($taskId);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, null, $this->offset, $this->hiccupAttempt + 1);

            return null;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404) {
                $this->finish($application, DeployState::STATUS_FAILED, 'The Engine task is gone.');

                return null;
            }
            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, null, $this->offset, $this->hiccupAttempt + 1);

                return null;
            }

            $this->finish($application, DeployState::STATUS_FAILED, EngineErrors::message($e));

            return null;
        }

        $details = Payload::object($task['details'] ?? null);
        $deployId = $this->deployIdOf($details);
        $status = Payload::string($task['status'] ?? '');

        if ($deployId !== null) {
            return $deployId;
        }

        if ($status === 'completed') {
            // The task finished without ever recording a deploy log (e.g. a
            // rebuild that replaced the tree without a full deploy); finish
            // from the task's own result.
            $deployment = Payload::nullableString($details['deployment_status'] ?? null) ?? 'success';
            $ok = in_array($deployment, ['success', 'partial'], true);
            $outcome = $ok ? DeployState::STATUS_FINISHED : DeployState::STATUS_FAILED;
            $error = $ok ? null : $this->taskError($details);
        } elseif (in_array($status, ['failed', 'cancelled'], true)) {
            // A cancellation is its own terminal state; the installation counts
            // it as failed and retry-install accepts it (V6).
            $outcome = $status === 'cancelled' ? DeployState::STATUS_CANCELLED : DeployState::STATUS_FAILED;
            $error = $this->taskError($details);
        } else {
            // Queued/running, deploy not started yet.
            $this->retryLater($application, $startedAt, null, $this->offset, 0);

            return null;
        }

        // The task never named a deploy, so the Engine's history has no entry
        // for it: its own log is the only record of what ran (kept
        // as the task's tail).
        $this->storeTaskLogTail($application, $taskId, null, $outcome, $error, $startedAt);
        $this->finish($application, $outcome, $error);

        return null;
    }

    /**
     * A failed create rolls the project back, deleting its deploy log, so
     * `deploy-log` answers 404 for a deploy the task did name. When the task
     * failed (or was cancelled), finish from the task and keep its log tail;
     * otherwise (no task, a task still running or completed, a task read that
     * fails) the caller keeps its own answer.
     */
    private function finishFromFailedTask(Application $application, string $deployId, int $startedAt): bool
    {
        $taskId = $this->taskId;
        if ($taskId === null) {
            return false;
        }

        try {
            $task = $application->engine()->task($taskId);
        } catch (EngineException $e) {
            report($e);

            return false;
        }

        $status = Payload::string($task['status'] ?? '');
        if (! in_array($status, ['failed', 'cancelled'], true)) {
            return false;
        }

        $outcome = $status === 'cancelled' ? DeployState::STATUS_CANCELLED : DeployState::STATUS_FAILED;
        $error = $this->taskError(Payload::object($task['details'] ?? null));
        $this->storeTaskLogTail($application, $taskId, $deployId, $outcome, $error, $startedAt);
        $this->finish($application, $outcome, $error);

        return true;
    }

    /**
     * Keep the end of the task's log (`GET /tasks/{id}/logs`, its last
     * `TASK_LOG_TAIL_LINES`) as the task's {@see DeployTaskTail}, which the
     * deploy history lists beside the Engine's deploys. Best effort: a failed
     * read is reported and the deploy finishes without it.
     */
    private function storeTaskLogTail(Application $application, int $taskId, ?string $deployId, string $status, ?string $error, int $startedAt): void
    {
        try {
            $tail = $this->taskLogTail($application, $taskId);
        } catch (EngineException|EngineValidationException $e) {
            report($e);

            return;
        }

        DeployTaskTail::record(
            $application,
            $taskId,
            $deployId,
            $this->sourceType ?? ($this->archivePath !== null ? DeployState::SOURCE_FILES : DeployState::sourceType($application, null)),
            $status,
            $error === null || $error === '' ? null : EngineText::sanitize($error),
            $tail,
            Carbon::createFromTimestampUTC($startedAt),
        );
    }

    /**
     * @return list<array{ts: int, stage: string|null, level: string, msg: string}>
     */
    private function taskLogTail(Application $application, int $taskId): array
    {
        $api = new TasksApi($application->engine());
        $tail = [];
        $afterId = 0;

        for ($page = 0; $page < self::TASK_LOG_MAX_PAGES; $page++) {
            $read = $api->logs($taskId, $afterId);
            foreach ($read['lines'] as $line) {
                $tail[] = [
                    'ts' => self::unixTime($line['created_at'] ?? null),
                    'stage' => Payload::nullableString($line['stage'] ?? null),
                    'level' => Payload::nullableString($line['level'] ?? null) ?? 'info',
                    'msg' => Payload::string($line['log'] ?? ''),
                ];
            }
            $tail = array_slice($tail, -self::TASK_LOG_TAIL_LINES);

            if ($read['lines'] === [] || $read['next_after_id'] <= $afterId) {
                break;
            }
            $afterId = $read['next_after_id'];
        }

        return $tail;
    }

    private static function unixTime(mixed $value): int
    {
        $raw = Payload::nullableString($value);
        if ($raw === null || $raw === '') {
            return time();
        }

        try {
            return Carbon::parse($raw)->getTimestamp();
        } catch (Throwable) {
            return time();
        }
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function deployIdOf(array $details): ?string
    {
        $deployId = Payload::nullableString($details['deploy_id'] ?? null);

        if ($deployId !== null && $deployId !== '') {
            return $deployId;
        }

        $numericId = Payload::int($details['deploy_id'] ?? null);

        return $numericId !== null ? (string) $numericId : null;
    }

    /**
     * @param  array<string, mixed>  $details  task `details` (`error` / `problems[].message`)
     */
    private function taskError(array $details): string
    {
        $error = Payload::nullableString($details['error'] ?? null);
        if ($error !== null && $error !== '') {
            return $error;
        }

        foreach (Payload::objects($details['problems'] ?? null) as $problem) {
            $message = Payload::nullableString($problem['message'] ?? null);
            if ($message !== null && $message !== '') {
                return $message;
            }
        }

        return 'The deploy failed before it started.';
    }

    /**
     * @param  string  $status  CA status: finished, failed or cancelled
     */
    private function finish(Application $application, string $status, ?string $error): void
    {
        // The Engine's own error text is carried in the notification; an
        // Engine-internal path (the archive stage, a `/home/…` path) is replaced
        // by the safe text and logged. The streamed deploy-log
        // body is left exactly as the Engine sent it.
        if ($error !== null && $error !== '') {
            $error = EngineText::sanitize($error);
        }

        $this->deleteArchive($application);

        $this->broadcast($application, $status, $this->offset, [], null, null);

        try {
            app(ApplicationSynchronizer::class)->sync($application->engine_id);
        } catch (EngineException $e) {
            report($e);
        }

        $finished = $status === DeployState::STATUS_FINISHED;

        // Before the notification below: it makes the CA refetch the project,
        // and that must not read the answers cached while the deploy ran.
        ProjectSourceReport::forget($application);
        $this->refreshSourceFacts($application);

        if ($finished) {
            $this->recordDeployedCommit($application);
        }

        // A finished (also partial) deploy's Engine `error` is a warning (e.g.
        // a self-signed certificate) and is not sent.
        $payload = ! $finished && is_string($error) && $error !== '' ? ['message' => $error] : [];

        ClientAreaNotificationRequested::dispatch($application, $finished ? $this->finishedType : $this->failedType, extra: $payload, isError: ! $finished);
    }

    /**
     * Record the commit the Engine actually deployed.
     *
     * The commit is the newest `success` or `partial` item of the Engine deploy
     * list (`GET projects/{u}/deploys`, `Lib/Deploy/DeployLog/DeployHistory.php:109-118`,
     * newest first). A webhook deploy moves the checkout without a new panel
     * deploy, and the frozen `details.git_commit` would then name the old
     * commit; the deploy list names the new one. When the list has no usable
     * item (empty, an archive deploy, an older Engine, or the read fails and is
     * reported), the `details.git_commit` the Engine wrote when the deploy
     * finished is the fallback.
     *
     * The message and the UTC date come from `git/commits` through
     * {@see DeployedCommit::record()}, which writes the three columns together;
     * a hash missing from that list clears the old message and date. The mirror
     * was just synced in `finish`, so read the fresh payload.
     */
    private function recordDeployedCommit(Application $application): void
    {
        $fresh = $application->fresh();
        if ($fresh === null) {
            return;
        }

        $deployed = null;
        try {
            $deployed = DeployedCommit::newestDeployed((new ProjectsApi($fresh->engine()))->deploys($fresh->engineProject()));
        } catch (Throwable $e) {
            // Best effort: the details fallback below still records a commit.
            report($e);
        }

        if ($deployed === null) {
            $details = Payload::object(($fresh->engine_payload ?? [])['details'] ?? null);
            $commit = Payload::nullableString($details['git_commit'] ?? null);
            if ($commit === null || $commit === '') {
                return;
            }

            $deployed = ['commit' => $commit, 'branch' => null];
        }

        DeployedCommit::record($fresh, $deployed['commit'], $deployed['branch']);
    }

    private function retryLater(Application $application, int $startedAt, ?string $deployId, int $offset, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->finish($application, DeployState::STATUS_FAILED, 'The deploy did not finish in time.');

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch(
            $this->applicationId,
            $this->taskId,
            $this->finishedType,
            $this->failedType,
            $startedAt,
            $offset,
            $hiccupAttempt,
            $this->archivePath,
            $deployId,
            $this->sourceType,
        )->delay(now()->addSeconds($delay));
    }

    /**
     * Replace the Source card's cached facts with what the Engine reports now:
     * the deploy just ended, so the `running` last deploy cached during it is
     * wrong and would keep the Upload new version dialog disabled. A failed read
     * drops the facts instead, so the next answer queues a fresh one.
     */
    private function refreshSourceFacts(Application $application): void
    {
        try {
            app(ProjectSourceDetails::class)->refresh($application->fresh() ?? $application);
        } catch (Throwable $e) {
            report($e);
            ProjectSourceDetails::forget($application);
        }
    }

    /**
     * The uploaded archive is no longer needed once the deploy task ends, on
     * any terminal outcome. A failed delete must not
     * fail the watcher – the deploy already ended.
     */
    private function deleteArchive(Application $application): void
    {
        if ($this->archivePath === null || $this->archivePath === '') {
            return;
        }

        try {
            (new FilesApi($application->engine()))->remove($application->engineProject(), $this->archivePath);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @param  array<string, mixed>|null  $page
     */
    private function broadcast(Application $application, string $status, int $baseOffset, array $lines, ?int $nextOffset, ?array $page): void
    {
        $page ??= [];

        try {
            DeployLogUpdated::dispatch(
                $application,
                $status,
                $baseOffset,
                $lines,
                $nextOffset,
                Payload::nullableString($page['stage'] ?? null),
                Payload::objects($page['stages'] ?? null),
            );
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * @param  array<string, mixed>  $page
     */
    private function errorOf(array $page): ?string
    {
        $error = Payload::nullableString($page['error'] ?? null);

        return $error !== null && $error !== '' ? $error : null;
    }
}
