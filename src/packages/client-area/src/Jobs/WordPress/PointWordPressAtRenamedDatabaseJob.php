<?php

namespace PanelAlpha\ClientArea\Jobs\WordPress;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use Throwable;

/**
 * Finishes a WordPress database rename the request could not wait for
 * (`ServerAccountService::renameDatabase()`): it follows the Engine rename task
 * and, once it completed, sets the install's `DB_NAME` to the new name
 * (`PUT wp/config/DB_NAME`, Engine 2.2.0). A failed or cancelled rename left
 * the database where `DB_NAME` points, so nothing changes.
 *
 * Carries ids, not models; one poll per dispatch, re-dispatched every
 * POLL_SECONDS (an Engine hiccup too) until the task ends or the wall-clock cap
 * passes. No CA notification: the old rename had none.
 */
final class PointWordPressAtRenamedDatabaseJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    public const POLL_SECONDS = 5;

    public const WALL_CLOCK_SECONDS = 3600;

    /**
     * @param  int  $startedAt  unix time of the first poll (0 = this dispatch is the first)
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly int $taskId,
        public readonly string $database,
        public readonly int $startedAt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(EngineResolver $engines): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $task = $engines->forEngine($application->engine_id)->task($this->taskId);
        } catch (EngineUnavailableException) {
            $this->pollLater($startedAt);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                $this->pollLater($startedAt);

                return;
            }

            // The task is gone or refused: the rename is not proven.
            report($e);

            return;
        }

        $status = Payload::string($task['status'] ?? '');
        if ($status === 'completed') {
            ServerAccountService::pointWordPressAt($application, $this->database);

            return;
        }

        if (! in_array($status, ['failed', 'cancelled'], true)) {
            $this->pollLater($startedAt);
        }
    }

    public function failed(?Throwable $exception = null): void
    {
        if ($exception !== null) {
            report($exception);
        }
    }

    private function pollLater(int $startedAt): void
    {
        if (now()->getTimestamp() - $startedAt >= self::WALL_CLOCK_SECONDS) {
            report(new \RuntimeException("The database rename task {$this->taskId} did not end within the wait; DB_NAME of application {$this->applicationId} was not updated."));

            return;
        }

        self::dispatch($this->applicationId, $this->taskId, $this->database, $startedAt)->delay(self::POLL_SECONDS);
    }
}
