<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\FilesApi;
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
 * Polls one Engine `202 + task` to completion and turns the result into the
 * Client Area notification the user is waiting for. No Engine
 * callbacks exist, so the panel polls; this job is
 * what every async endpoint dispatches.
 *
 * `$finishedType` / `$failedType` are the exact CA notification types (the CA
 * switches on `*_finished` / `*_failed`, e.g. `user.instance.redeploy_finished`).
 * `$includeInstance`/`$payload` shape the notification.
 *
 * Carries ids, not models: the project may be deleted while the task runs.
 * Each dispatch performs one poll and re-dispatches itself (carrying
 * `next_after_id` and the wall-clock start) until the task is terminal or the
 * 1 h cap passes; an Engine hiccup only delays the next poll.
 */
final class WatchApplicationTaskJob implements ShouldQueue
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
     * @param  array<string, mixed>  $payload  extra notification fields (backup, plugin…)
     * @param  int  $startedAt  unix time of the first poll (0 = this dispatch is the first)
     * @param  int  $nextAfterId  Engine task log cursor to carry between polls
     * @param  int  $hiccupAttempt  consecutive Engine hiccups, for the backoff step
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly int $taskId,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly array $payload = [],
        public readonly bool $includeInstance = true,
        public readonly int $startedAt = 0,
        public readonly int $nextAfterId = 0,
        public readonly int $hiccupAttempt = 0,
        /**
         * Home-relative deploy archive to delete when this task ends.
         * Only the files-onboarding fallback watcher sets it; null for
         * every other operation this generic task poller follows.
         */
        public readonly ?string $archivePath = null,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(EngineResolver $engines, ApplicationSynchronizer $synchronizer): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            // The project is gone; nobody is waiting for the notification.
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $task = $engines->forEngine($application->engine_id)->task($this->taskId, $this->nextAfterId);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $this->nextAfterId, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404) {
                // The task is gone: treat as failed.
                $this->fail($application);

                return;
            }

            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, $this->nextAfterId, $this->hiccupAttempt + 1);

                return;
            }

            // Any other Engine refusal is terminal.
            $this->fail($application, EngineErrors::message($e));

            return;
        }

        $status = Payload::string($task['status'] ?? '');
        $nextAfterId = Payload::int($task['next_after_id'] ?? $this->nextAfterId) ?? $this->nextAfterId;

        if (! in_array($status, ['completed', 'failed', 'cancelled'], true)) {
            $this->retryLater($application, $startedAt, $nextAfterId, 0);

            return;
        }

        if ($status === 'completed') {
            $this->deleteArchive($application);

            try {
                $synchronizer->sync($application->engine_id);
            } catch (EngineException $e) {
                report($e);
            }

            ClientAreaNotificationRequested::dispatch($application, $this->finishedType, extra: $this->payload, isError: false, includeInstance: $this->includeInstance);

            return;
        }

        // A failed/cancelled task carries the Engine message in `details.error`
        // (`TaskResource` → `details`).
        $details = Payload::object($task['details'] ?? null);
        $this->fail($application, $this->taskError($details));
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
     * Safety net: any unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $this->deleteArchive($application);

        ClientAreaNotificationRequested::dispatch(
            $application,
            $this->failedType,
            extra: $this->payload,
            isError: true,
            includeInstance: $this->includeInstance,
        );
    }

    /**
     * Re-dispatch the next poll. A running task polls after POLL_SECONDS; an
     * Engine hiccup backs off 3, 6, 12 … up to 60 s. Both stop at the
     * wall-clock cap and fail the chain instead.
     */
    private function retryLater(
        Application $application,
        int $startedAt,
        int $nextAfterId,
        int $hiccupAttempt,
    ): void {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->fail($application);

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
            $this->payload,
            $this->includeInstance,
            $startedAt,
            $nextAfterId,
            $hiccupAttempt,
            $this->archivePath,
        )->delay(now()->addSeconds($delay));
    }

    private function fail(Application $application, ?string $message = null): void
    {
        $this->deleteArchive($application);

        $payload = is_string($message) && $message !== ''
            ? $this->payload + ['message' => $message]
            : $this->payload;

        ClientAreaNotificationRequested::dispatch($application, $this->failedType, extra: $payload, isError: true, includeInstance: $this->includeInstance);
    }

    /**
     * The staged deploy archive is no longer needed once the task ends; a
     * failed delete must not fail the notification.
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
}
