<?php

namespace PanelAlpha\ClientArea\Jobs\Git;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Projects\DeployedCommit;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * Settles one accepted-but-queued git operation: a
 * deploy-managed checkout answers a `202 + Task` to `POST git/pull|revert`, so
 * {@see \PanelAlpha\ClientArea\Projects\GitService} records the operation
 * `in_progress` with the task id and dispatches this job. It polls the task
 * like {@see \PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob}
 * but fires no CA notification – the old panel's pull/revert were synchronous.
 *
 * The row carries ids, not models; the project may be deleted while the task
 * runs. An Engine hiccup only delays the next poll; the 1 h cap ends the row
 * failed.
 *
 * Permanent panel code: the git operation history is the old panel's design
 * and the Engine does not need to keep it, so it moved from client-area-legacy
 * into the controller.
 */
final class WatchGitOperationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** One poll per dispatch; the worker timeout is the Engine HTTP timeout. */
    public int $tries = 1;

    public int $timeout = 60;

    /** Hard wall-clock cap from the first poll. */
    public const WALL_CLOCK_SECONDS = 3600;

    public const QUEUE = 'engine-tasks';

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    /**
     * @param  int  $startedAt  unix time of the first poll (0 = this dispatch is the first)
     * @param  int  $hiccupAttempt  consecutive Engine hiccups, for the backoff step
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly int $operationId,
        public readonly int $taskId,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(EngineResolver $engines): void
    {
        $application = Application::query()->find($this->applicationId);
        $operation = GitOperation::query()->find($this->operationId);
        if ($application === null || $operation === null) {
            // The project (or the row) is gone; nothing left to settle.
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $task = $engines->forEngine($application->engine_id)->task($this->taskId);
        } catch (EngineUnavailableException) {
            $this->retryLater($startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404) {
                // The task is gone: treat as failed.
                $this->fail($operation, null);

                return;
            }

            if ($e->engineStatus >= 500) {
                $this->retryLater($startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->fail($operation, EngineErrors::message($e));

            return;
        }

        $status = Payload::string($task['status'] ?? '');

        if (! in_array($status, ['completed', 'failed', 'cancelled'], true)) {
            $this->retryLater($startedAt, 0);

            return;
        }

        if ($status === 'completed') {
            $this->settleSuccess($application, $operation);

            return;
        }

        // A failed/cancelled task carries the Engine message in `details.error`.
        $details = Payload::object($task['details'] ?? null);
        $this->fail($operation, $this->taskError($details));
    }

    /**
     * Safety net: an unexpected exception must still end the in_progress row.
     */
    public function failed(?Throwable $exception = null): void
    {
        $operation = GitOperation::query()->find($this->operationId);
        if ($operation === null) {
            return;
        }

        $this->fail($operation, null);
    }

    private function settleSuccess(Application $application, GitOperation $operation): void
    {
        $commit = $this->headCommit($application);
        $attributes = $commit === null ? [] : GitOperation::commitAttributes($commit);

        $operation->forceFill([
            'status' => GitOperation::STATUS_SUCCESS,
            'error_message' => null,
        ] + $attributes)->save();

        // A completed pull left the checkout at this head; the Engine rebuilt
        // from it, so it is the last deployed commit. Revert and change branch
        // do not move the deployed commit here.
        if ($attributes !== [] && $operation->action === GitOperation::ACTION_PULL) {
            DeployedCommit::store($application, $attributes);
        }
    }

    private function fail(GitOperation $operation, ?string $message): void
    {
        $operation->forceFill([
            'status' => GitOperation::STATUS_FAILED,
            'error_message' => $message,
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function taskError(array $details): ?string
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

        return null;
    }

    /**
     * The newest commit of the checkout (Engine `git/commits` is newest-first),
     * or null when the Engine cannot read it.
     *
     * @return array<string, mixed>|null
     */
    private function headCommit(Application $application): ?array
    {
        try {
            $rows = (new ProjectsApi($application->engine()))->gitCommits($application->engineProject(), $application->gitBranch(), 1);
        } catch (EngineException $e) {
            report($e);

            return null;
        }

        return $rows[0] ?? null;
    }

    /**
     * Re-dispatch the next poll. A running task polls after POLL_SECONDS; an
     * Engine hiccup backs off 3, 6, 12 … up to 60 s. Both stop at the
     * wall-clock cap and fail the row instead.
     */
    private function retryLater(int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $operation = GitOperation::query()->find($this->operationId);
            if ($operation !== null) {
                $this->fail($operation, null);
            }

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch(
            $this->applicationId,
            $this->operationId,
            $this->taskId,
            $startedAt,
            $hiccupAttempt,
        )->delay(now()->addSeconds($delay));
    }
}
