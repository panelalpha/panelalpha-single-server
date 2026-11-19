<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Throwable;

/**
 * Follows an Engine staging copy: the destination's
 * `details.async_status.staging` flips from `running` to `completed`
 * (`System/Projects.php:1150`) or `failed` + `details.error`
 * (`Models/User.php:markStagingFailed`); a failed copy is deleted on the
 * Engine (`Jobs/CreateStaging.php:86-101`), so a 404 counts as failed too - and
 * the copy task is then the only record of why (`GET tasks/{id}`,
 * `details.error`).
 *
 * The notification carries the **staging** as `instance` (old CreateStaging
 * job). Engine hiccups re-dispatch with backoff until the wall-clock cap;
 * `failed()` is the safety net that always ends the CA spinner.
 */
final class WatchStagingJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    public const FINISHED_TYPE = 'user.instance.create_staging_finished';

    public const FAILED_TYPE = 'user.instance.create_staging_failed';

    /** Hard wall-clock cap from the staging's creating marker. */
    public const WALL_CLOCK_SECONDS = 3600;

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    /** The longest a re-dispatch may delay a poll. */
    public const BACKOFF_MAX_SECONDS = 60;

    /**
     * A `staging_creating_at` older than the watcher's `startedAt` plus the
     * maximum backoff is stale (the watcher was lost): the marker is ignored so
     * the row may be deleted, retried or dropped by a sync again.
     * The marker is set at create/retry just before the watcher is
     * dispatched, so it stands in for `startedAt`.
     */
    public const STALE_AFTER_SECONDS = self::WALL_CLOCK_SECONDS + self::BACKOFF_MAX_SECONDS;

    public function __construct(
        public readonly int $stagingId,
        public readonly int $taskId = 0,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
        public readonly int $parentId = 0,
        // The staging's Engine username, carried so a row deleted mid-copy can
        // still render its name in a notification `html_text`.
        public readonly string $stagingUsername = '',
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $staging = Application::query()->find($this->stagingId);
        if ($staging === null) {
            // The synchronizer keeps a marked row, but the user can delete it
            // while the watcher runs; the CA spinner must still end.
            // Nothing to notify when the parent is gone too.
            $this->notifyParentOfLostStaging();

            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $project = (new ProjectsApi($staging->engine()))->show($staging->engineProject());
        } catch (EngineUnavailableException) {
            $this->retryLater($staging, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                $this->retryLater($staging, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            // 404: the Engine deleted the failed destination (Jobs/CreateStaging),
            // so the failure is confirmed. Any other sub-500 answer (403/409/…)
            // did not prove the copy failed: it ends the creating marker but
            // must not set the failed one, so the delete still reaches the
            // Engine.
            $this->finish(
                $staging,
                false,
                $e->engineStatus === 404
                    ? ($this->failureFromTask($staging) ?? 'The staging project is gone.')
                    : EngineErrors::message($e),
                confirmedFailure: $e->engineStatus === 404,
            );

            return;
        } catch (EngineValidationException $e) {
            // A 422 (EngineClient throws this for every Engine 422) did not
            // prove the copy failed either: end the creating marker, mark the
            // row failed and leave the failed marker unset, so the delete still
            // reaches the Engine.
            $this->finish($staging, false, EngineErrors::message($e));

            return;
        }

        $details = Payload::object($project['details'] ?? null);
        $async = Payload::object($details['async_status'] ?? null);
        $status = Payload::nullableString($async['staging'] ?? null);

        if (! in_array($status, ['completed', 'failed'], true)) {
            // running / pending / queued / not recorded yet.
            $this->retryLater($staging, $startedAt, 0);

            return;
        }

        if ($status === 'completed') {
            // The CA copies the notification's `instance` into the sub-instance
            // (index.vue:168-176), so present the **fresh mirror**, not the row
            // as it was when the job started.
            $staging = $synchronizer->mirror($staging->engine_id, $project) ?? $staging;

            $this->finish($staging, true, null);

            return;
        }

        // A failed copy also presents the mirror's latest state. The Engine
        // reported the failure itself, so this is a confirmed failure.
        $staging = $synchronizer->mirror($staging->engine_id, $project) ?? $staging;

        $this->finish($staging, false, Payload::nullableString($details['error'] ?? null), confirmedFailure: true);
    }

    /**
     * Safety net: an unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $staging = Application::query()->find($this->stagingId);
        if ($staging === null) {
            return;
        }

        // The watcher stopped without recording an outcome: end the creating
        // marker and mark the row failed so it is not pinned forever - but do
        // not set the confirmed-failure marker, so a delete still reaches the
        // Engine.
        $update = [];
        if ($staging->staging_creating_at !== null) {
            $update['staging_creating_at'] = null;
        }
        if ($staging->status !== 'failed') {
            $update['status'] = 'failed';
        }
        if ($update !== []) {
            $staging->forceFill($update)->save();
        }

        ClientAreaNotificationRequested::dispatch($staging, self::FAILED_TYPE, message: 'The staging watcher stopped.', isError: true);
    }

    /**
     * Why the deleted destination failed: the Engine removes the destination
     * on failure, so only its copy task carries the error (`details.error`,
     * `Jobs/CreateStaging::failed`). Null when the task is gone too.
     */
    private function failureFromTask(Application $staging): ?string
    {
        if ($this->taskId <= 0) {
            return null;
        }

        try {
            $task = $staging->engine()->task($this->taskId);
        } catch (EngineException $e) {
            report($e);

            return null;
        }

        $details = Payload::object($task['details'] ?? null);
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

    private function finish(
        Application $staging,
        bool $ok,
        ?string $message,
        bool $confirmedFailure = false,
    ): void {
        if ($ok) {
            // A finished copy is no longer "creating", and a retry that
            // worked clears the panel-owned failure marker (V5c, W5).
            if ($staging->staging_create_failed_at !== null || $staging->staging_creating_at !== null) {
                $staging->forceFill(['staging_create_failed_at' => null, 'staging_creating_at' => null])->save();
            }
        } else {
            // The failed marker is panel-owned state the sync reads: it may only
            // be set when the Engine itself confirmed the failure (a `show` 404
            // or `async_status.staging = failed`; the Engine writes neither
            // `success` nor `error`). A cap or any other
            // error ends the creating marker and marks the row failed
            // **without** it, so a delete goes to the Engine instead of being
            // handled locally.
            $staging->forceFill([
                'status' => 'failed',
                'staging_create_failed_at' => $confirmedFailure ? now() : null,
                'staging_creating_at' => null,
            ])->save();
        }

        $message = is_string($message) && $message !== '' ? $message : null;

        ClientAreaNotificationRequested::dispatch($staging, $ok ? self::FINISHED_TYPE : self::FAILED_TYPE, message: $message, isError: ! $ok);
    }

    private function retryLater(Application $staging, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            // The cap did not confirm the failure (the copy may still be running
            // on the Engine), so no failed marker.
            $this->finish($staging, false, 'The staging copy did not finish in time.');

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch($this->stagingId, $this->taskId, $startedAt, $hiccupAttempt, $this->parentId, $this->stagingUsername)->delay(now()->addSeconds($delay));
    }

    /**
     * The staging row is gone (the user deleted it while the copy ran): the
     * parent's recipients must still get `create_staging_failed` so the CA
     * spinner ends. When the parent is gone too there is nobody left to notify.
     */
    private function notifyParentOfLostStaging(): void
    {
        $parent = Application::query()->find($this->parentId);
        if ($parent === null) {
            return;
        }

        $message = $this->failureFromTask($parent) ?? 'The staging project is gone.';

        // The row was deleted while the copy ran. The notification's `instance`
        // must be the staging itself, not the live parent: the CA's failed
        // handler marks `instance.id` install-failed
        // (Auth.js:393 -> index.vue:165). The row is gone, so present an unsaved
        // staging while the parent still owns the recipients.
        $staging = new Application;
        $staging->forceFill([
            'id' => $this->stagingId,
            'staging_of_id' => $parent->id,
            // The row is gone, so its name goes too: carry the staging's Engine
            // username in the job (fall back to the parent's name) so the
            // notification `html_text` names the staging.
            'engine_username' => $this->stagingUsername !== '' ? $this->stagingUsername : (string) $parent->name,
            'status' => 'failed',
            'staging_create_failed_at' => now(),
        ]);
        // Nothing to load: the row is gone and the presenter must not query for
        // it. The parent is handed over directly.
        $staging->setRelation('stagingOf', $parent);
        $staging->setRelation('applicationLabels', new EloquentCollection);
        $staging->setRelation('wordpressAsyncStatuses', new EloquentCollection);
        $staging->setRelation('stagings', new EloquentCollection);

        ClientAreaNotificationRequested::dispatch(
            $staging,
            self::FAILED_TYPE,
            message: $message,
            isError: true,
            recipients: $parent,
        );
    }
}
