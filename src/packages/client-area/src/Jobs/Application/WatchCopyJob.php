<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ProjectsUnmirrored;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Throwable;

/**
 * Follows a project copy made as a create (`POST /projects` with a `project`
 * source, Engine 2.3.0; `CopyProjectJob`). The Engine answers a `CopyProject`
 * task, which writes no `deploy_id`, so the deploy watcher does not fit: this
 * job polls the task (`GET tasks/{id}`) until it is terminal, like
 * WatchPushJob. On `completed` it mirrors the copy and notifies the CA with it
 * (`user.instance.installation_finished`, as the synchronous clone did); on
 * `failed`/`cancelled` the Engine has discarded the copy and the CA gets
 * `installation_failed` on the original project with the task's error.
 *
 * A transport failure or a 5xx on the task re-dispatches with backoff (3, 6,
 * 12 … max 60 s) until the wall-clock cap; `failed()` is the safety net that
 * always ends the CA spinner.
 */
final class WatchCopyJob implements ShouldQueue
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
        public readonly string $copyUsername,
        public readonly int $taskId,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $source = Application::query()->find($this->sourceId);
        if ($source === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $task = $source->engine()->task($this->taskId);
        } catch (EngineUnavailableException) {
            $this->retryLater($source, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                // An Engine hiccup is not a copy failure.
                $this->retryLater($source, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            if ($e->engineStatus === 404) {
                // The Engine prunes terminal tasks (`TaskPruner::KEEP_OTHER`,
                // core/app/Lib/Task/TaskPruner.php:20-21), so a 404 on the task
                // does not prove the copy failed. The copy is the truth: read
                // it once; a 404 there is the failure, a 5xx is retried and
                // any other 4xx stays a failure (finish()).
                $this->finish($source, $synchronizer, $startedAt);

                return;
            }

            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        } catch (EngineValidationException $e) {
            // Another 4xx on the task read (an Engine 422) is not retried and
            // does not mean the copy succeeded: report it as a failure.
            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        } catch (EngineException $e) {
            report($e);
            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        }

        $status = Payload::nullableString($task['status'] ?? null);

        if ($status === 'queued' || $status === 'running') {
            $this->retryLater($source, $startedAt, 0);

            return;
        }

        if ($status === 'completed') {
            $this->finish($source, $synchronizer, $startedAt);

            return;
        }

        $details = Payload::object($task['details'] ?? null);
        $message = Payload::nullableString($details['error'] ?? null);
        if (($message === null || $message === '') && $status === 'cancelled') {
            $message = 'The copy was cancelled.';
        }

        // failed/cancelled, or a terminal status this panel does not know: the
        // Engine discards the copy (`CopyProject::failed()`), so the pending row
        // CopyProjectJob recorded at the 202 would be a ghost project.
        $this->forgetCopy($source);

        // Its error can name the account's home paths, which the CA must not
        // see.
        ClientAreaNotificationRequested::dispatch(
            $source,
            CopyProjectJob::FAILED_TYPE,
            message: $message !== null && $message !== '' ? EngineText::sanitize($message) : 'The copy did not finish.',
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

        ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: 'The copy did not finish.', isError: true);
    }

    /**
     * Mirror the finished copy; a mirror hiccup is retried like a poll, since
     * the CA needs the copy's row.
     */
    private function finish(Application $source, ApplicationSynchronizer $synchronizer, int $startedAt): void
    {
        try {
            $project = (new ProjectsApi($source->engine()))->show(new EngineProject($source->engine_id, $this->copyUsername));
        } catch (EngineUnavailableException) {
            $this->retryLater($source, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                $this->retryLater($source, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            // A 404 proves the copy is gone (a task 404 that led here, or a
            // completed task whose project the Engine no longer lists), so the
            // pending row must not stay either.
            if ($e->engineStatus === 404) {
                $this->forgetCopy($source);
            }

            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        } catch (EngineValidationException $e) {
            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        }

        $application = $synchronizer->mirror($source->engine_id, $project);
        if ($application === null) {
            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: 'The Engine did not return the cloned project.', isError: true);

            return;
        }

        ClientAreaNotificationRequested::dispatch($application, CopyProjectJob::FINISHED_TYPE, includeInstance: true);
    }

    /**
     * Drop the pending row CopyProjectJob recorded for the copy at the 202.
     * Used only when the Engine has discarded the copy (a failed/cancelled task)
     * or no longer lists it (a 404 on the project read); a copy that may still
     * exist keeps its row, and the next sync mirrors its real status.
     */
    private function forgetCopy(Application $source): void
    {
        $copy = Application::query()
            ->where('engine_id', $source->engine_id)
            ->where('engine_username', $this->copyUsername)
            ->first();
        if ($copy === null) {
            return;
        }

        $engineId = $copy->engine_id;
        $copy->delete();

        // The row leaves its owners' Connect AI scopes, as any removed row
        // does.
        ProjectsUnmirrored::dispatch($engineId);
    }

    private function retryLater(Application $source, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            ClientAreaNotificationRequested::dispatch($source, CopyProjectJob::FAILED_TYPE, message: 'The copy did not finish in time.', isError: true);

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch($this->sourceId, $this->copyUsername, $this->taskId, $startedAt, $hiccupAttempt)
            ->delay(now()->addSeconds($delay));
    }
}
