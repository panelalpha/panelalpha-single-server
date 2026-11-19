<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\EngineClient\Api\BackupsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * Follows one backup `202 + task` (`POST /backups`, `…/restore`, `DELETE`) to
 * its end and notifies the CA with the finished row, so the backups table and
 * its status spinner settle. The Engine owns
 * the backup; this reads it back with `GET backups/{id}` once the task is
 * terminal. A delete has no row left, so the pre-delete snapshot is sent with
 * the terminal status.
 *
 * Carries ids and plain arrays, not models: the project may be deleted while the
 * task runs. One poll per dispatch, re-dispatched to the 1 h cap, an Engine
 * hiccup only delaying the next poll.
 */
final class WatchBackupTaskJob implements ShouldQueue
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

    private const TERMINAL = ['completed', 'failed', 'cancelled'];

    /**
     * @param  string  $action  create|restore|delete (the old CA type segment)
     * @param  array<string, mixed>  $snapshot  the 202 row, sent when a terminal read is impossible
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly int $taskId,
        public readonly int $backupId,
        public readonly string $action,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly array $snapshot = [],
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $task = $application->engine()->task($this->taskId);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->finish($application, true, EngineErrors::message($e));

            return;
        }

        $status = Payload::string($task['status'] ?? '');
        if (! in_array($status, self::TERMINAL, true)) {
            $this->retryLater($application, $startedAt, 0);

            return;
        }

        $details = Payload::object($task['details'] ?? null);
        $message = $status === 'completed' ? null : $this->taskError($details);

        RefreshProjectBackupsJob::dispatch($application->id)->onConnection('database');

        $this->finish($application, $status !== 'completed', $message);
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

        // The row was still running; report the watcher failure rather than
        // re-reading a state the Engine may have moved on from.
        ClientAreaNotificationRequested::dispatch(
            $application,
            $this->failedType,
            message: 'The backup watcher stopped.',
            extra: ['backup' => $this->snapshot],
            isError: true,
            includeInstance: false,
        );
    }

    private function finish(Application $application, bool $isError, ?string $message): void
    {
        $backup = $this->snapshot;

        // A delete leaves no backup to read; a create/restore's terminal row is
        // the Engine's (the API marks the status `completed`/`failed`).
        if ($this->action !== 'delete') {
            try {
                $fresh = (new BackupsApi($application->engine()))->show($application->engineProject(), $this->backupId);
                $backup = app(BackupService::class)->present($fresh);
            } catch (Throwable $e) {
                report($e);
            }
        }

        $payload = ['backup' => $backup];
        if ($isError && is_string($message) && $message !== '') {
            $payload['message'] = $message;
        }

        ClientAreaNotificationRequested::dispatch(
            $application,
            $isError ? $this->failedType : $this->finishedType,
            extra: $payload,
            isError: $isError,
            includeInstance: false,
        );
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

    private function retryLater(Application $application, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->finish($application, true, 'The backup did not finish in time.');

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch(
            $this->applicationId,
            $this->taskId,
            $this->backupId,
            $this->action,
            $this->finishedType,
            $this->failedType,
            $this->snapshot,
            $startedAt,
            $hiccupAttempt,
        )->delay(now()->addSeconds($delay));
    }
}
