<?php

namespace PanelAlpha\ClientArea\Jobs\WordPress;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ImportDetailsPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\WordPressMigrationsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use Throwable;

/**
 * Follows a WordPress import on the Engine (Engine 2.2.0): polls
 * `GET /wordpress/migrations/{id}`, stores the answer for `import_details` and
 * broadcasts {@see ImportStatusChanged} whenever the status, step, item or
 * percent moved, until the import ends:
 *
 * - `completed` – the project is mirrored again, its type re-probed (it holds
 *   WordPress now) and `installation_finished` sent, with the Engine's
 *   `notices` (the manual method's "remove the plugin") as its message;
 * - `failed` / `cancelled` – `installation_failed` with the failed step's
 *   message; quick-retry resumes it;
 * - `stale` (the Engine's worker died: no heartbeat for 15 minutes) – the
 *   same failure; quick-retry resumes the stalled run.
 *
 * The Engine runs the import in its own bounded jobs, so this watcher only
 * reads. A transport failure or a 5xx re-dispatches with backoff (3, 6, 12 …
 * max 60 s) inside the wall-clock cap; a 404 (the record is gone) ends it as
 * failed. Re-dispatches itself every {@see self::POLL_SECONDS}.
 */
final class WatchWordPressImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    /** The engine-tasks worker reads the `database` connection (src/config/supervisord.conf). */
    public const CONNECTION = 'database';

    /** An import of a large site runs for hours; the Engine's own heartbeat ends a dead one. */
    public const WALL_CLOCK_SECONDS = 86400;

    public const POLL_SECONDS = 10;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    public const STALE = 'The import stopped responding. Retry it to resume.';

    public const CANCELLED = 'The import was cancelled.';

    public const GONE = 'The Engine no longer has this import.';

    public const TOO_LONG = 'The import did not finish in time.';

    public function __construct(
        public readonly int $applicationId,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onConnection(self::CONNECTION);
        $this->onQueue(self::QUEUE);
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $application = Application::query()->find($this->applicationId);
        $import = $application?->wordpressImport;
        if ($application === null || $import === null || $import->engine_migration_id === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $answer = (new WordPressMigrationsApi($application->engine()))->show($import->engine_migration_id);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $import, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $import, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->end($application, $import, $e->engineStatus === 404 ? self::GONE : EngineErrors::message($e));

            return;
        } catch (EngineException $e) {
            report($e);
            $this->end($application, $import, EngineErrors::message($e));

            return;
        }

        $previous = Payload::object($import->engine_status);
        $status = Payload::nullableString($answer['status'] ?? null) ?? $import->status;
        $import->update(['status' => $status, 'engine_status' => $answer]);
        $application->unsetRelation('wordpressImport');

        if (self::moved($previous, $answer)) {
            ImportStatusChanged::forEveryone($application);
        }

        if ($status === WordPressImport::COMPLETED) {
            $this->complete($application, $import, $synchronizer);

            return;
        }
        if ($status === WordPressImport::FAILED || $status === WordPressImport::CANCELLED) {
            $raw = ImportDetailsPresenter::rawFailure($answer);
            $friendly = $raw === null ? null : EngineText::friendly($raw);
            if ($friendly !== null) {
                Log::warning('Engine text hidden from the Client Area.', ['message' => $raw]);
            }
            $message = $friendly ?? $raw ?? ($status === WordPressImport::CANCELLED ? self::CANCELLED : null);
            ClientAreaNotificationRequested::dispatch($application->refresh(), InstallWordPressJob::FAILED_TYPE, message: $message, isError: true, includeInstance: true);

            return;
        }
        if ($import->isStale()) {
            ClientAreaNotificationRequested::dispatch($application->refresh(), InstallWordPressJob::FAILED_TYPE, message: self::STALE, isError: true, includeInstance: true);

            return;
        }

        $this->retryLater($application, $import, $startedAt, 0);
    }

    /**
     * Safety net: an unexpected exception still tells the CA.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        ClientAreaNotificationRequested::dispatch($application, InstallWordPressJob::FAILED_TYPE, message: 'The import watcher stopped.', isError: true, includeInstance: true);
    }

    private function complete(Application $application, WordPressImport $import, ApplicationSynchronizer $synchronizer): void
    {
        // The imported site replaces the placeholder: refresh the mirror, which
        // carries the Engine's type. A mirror hiccup must not turn a finished
        // import into a failure.
        try {
            $synchronizer->sync($application->engine_id);
        } catch (EngineException $e) {
            report($e);
        }

        $notices = array_values(array_filter(
            array_map(static fn (mixed $notice): ?string => Payload::nullableString($notice), (array) (Payload::object($import->engine_status)['notices'] ?? [])),
            static fn (?string $notice): bool => $notice !== null && $notice !== '',
        ));

        ClientAreaNotificationRequested::dispatch(
            $application->refresh(),
            InstallWordPressJob::FINISHED_TYPE,
            message: $notices === [] ? null : implode(' ', $notices),
            includeInstance: true,
        );
    }

    /**
     * Mark the import failed when the Engine can no longer tell how it went.
     */
    private function end(Application $application, WordPressImport $import, string $message): void
    {
        $import->update(['status' => WordPressImport::FAILED, 'error' => $message]);
        $application->unsetRelation('wordpressImport');
        ImportStatusChanged::forEveryone($application);
        ClientAreaNotificationRequested::dispatch($application->refresh(), InstallWordPressJob::FAILED_TYPE, message: $message, isError: true, includeInstance: true);
    }

    private function retryLater(Application $application, WordPressImport $import, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->end($application, $import, self::TOO_LONG);

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch($this->applicationId, $startedAt, $hiccupAttempt)->delay(now()->addSeconds($delay));
    }

    /**
     * Whether the CA would show something new: the status, the stale flag, the
     * current step, its item or its percent.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     */
    private static function moved(array $before, array $after): bool
    {
        $view = static function (array $status): array {
            $progress = Payload::object($status['progress'] ?? null);

            return [
                $status['status'] ?? null,
                $status['stale'] ?? null,
                $progress['step'] ?? null,
                $progress['item'] ?? null,
                $progress['phase_percent'] ?? null,
                $status['steps'] ?? null,
            ];
        };

        return $view($before) !== $view($after);
    }
}
