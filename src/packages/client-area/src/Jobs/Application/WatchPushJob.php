<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Throwable;

/**
 * Follows an Engine staging push. The push
 * 202 carries a top-level `task_id` (`StagingController::push`
 * `->additional(['task_id' => $task->id])`), so the job polls **that task**
 * (`GET tasks/{id}`, `EngineClient::task()`) until it is terminal, then mirrors
 * the **target** project and notifies the CA
 * (`user.instance.push_to_live_finished|failed` or the staging pair). The
 * notification names the **source** project, as the old PushToLive /
 * PushToStaging jobs did. The old untasked `async_status.push`
 * watcher is gone: without a task id the push cannot be followed, so it fails
 * closed.
 *
 * A transport failure or a 5xx on the task re-dispatches with backoff (3, 6,
 * 12 … max 60 s) until the wall-clock cap; `failed()` is the safety net that
 * always ends the CA spinner.
 */
final class WatchPushJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    /** Hard wall-clock cap. */
    public const WALL_CLOCK_SECONDS = 3600;

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    public function __construct(
        public readonly int $sourceId,
        public readonly int $targetId,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly int $taskId = 0,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $target = Application::query()->find($this->targetId);
        $source = Application::query()->find($this->sourceId);
        if ($target === null || $source === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        // The Engine always records the push as a task; with no id there is no
        // record of when it ended, so fail closed (the old untasked shape is gone).
        if ($this->taskId <= 0) {
            ClientAreaNotificationRequested::dispatch($source, $this->failedType, message: 'The Engine did not return a push task.', isError: true);

            return;
        }

        try {
            $task = $target->engine()->task($this->taskId);
        } catch (EngineUnavailableException) {
            $this->retryLater($source, $target, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                // An Engine hiccup is not a push failure.
                $this->retryLater($source, $target, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            ClientAreaNotificationRequested::dispatch($source, $this->failedType, message: EngineErrors::message($e), isError: true);

            return;
        } catch (EngineException $e) {
            report($e);
            ClientAreaNotificationRequested::dispatch($source, $this->failedType, message: EngineErrors::message($e), isError: true);

            return;
        }

        $status = Payload::nullableString($task['status'] ?? null);

        if ($status === 'queued' || $status === 'running') {
            $this->retryLater($source, $target, $startedAt, 0);

            return;
        }

        // The transfer is over: mirror the target so the source's presented push
        // state (and the push's own history) is fresh before the CA is notified
        // A mirror hiccup is reported but must not re-fail a push the Engine
        // already recorded as terminal.
        try {
            $project = (new ProjectsApi($target->engine()))->show($target->engineProject());
            $synchronizer->mirror($target->engine_id, $project);
        } catch (EngineException $e) {
            report($e);
        }

        if ($status === 'completed') {
            // The CA notification names the **source** project, as the old
            // PushToLive/PushToStaging jobs did (U1c).
            ClientAreaNotificationRequested::dispatch($source, $this->finishedType, includeInstance: true);
            RefreshProjectScreenshotJob::dispatch($target->id);

            return;
        }

        $details = Payload::object($task['details'] ?? null);
        $message = Payload::nullableString($details['error'] ?? null);
        if ($message === null && $status === 'cancelled') {
            $message = 'The push was cancelled.';
        }

        // failed/cancelled, or a terminal status this panel does not know.
        // An empty Engine error is still dropped, as the old `array_filter`
        // did.
        ClientAreaNotificationRequested::dispatch(
            $source,
            $this->failedType,
            message: $message !== null && $message !== '' ? $message : null,
            isError: true,
        );
    }

    /**
     * Safety net: any unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $source = Application::query()->find($this->sourceId);
        if ($source === null) {
            return;
        }

        ClientAreaNotificationRequested::dispatch($source, $this->failedType, message: 'The push watcher stopped.', isError: true);
    }

    private function retryLater(Application $source, Application $target, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            ClientAreaNotificationRequested::dispatch($source, $this->failedType, message: 'The push did not finish in time.', isError: true);

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch($this->sourceId, $this->targetId, $this->finishedType, $this->failedType, $this->taskId, $startedAt, $hiccupAttempt)
            ->delay(now()->addSeconds($delay));
    }
}
