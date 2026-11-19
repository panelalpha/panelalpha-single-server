<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectService;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use Throwable;

/** Finishes a Client Area delete the Engine refused as busy, until it is done or the cap passes. */
final class DeleteProjectJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    /** Below the long worker's 1800 s, as for CopyProjectJob. */
    public int $timeout = 1750;

    public const QUEUE = 'long';

    /** Hard wall-clock cap from the first attempt. */
    public const WALL_CLOCK_SECONDS = 900;

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    /** $startedAt is 0 on the first dispatch; $hiccupAttempt counts consecutive Engine hiccups. */
    public function __construct(
        public readonly int $applicationId,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
        $this->onConnection('database-long');
    }

    public function handle(ProjectService $projects): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $projects->delete($application);
            $projects->announceUserDelete($application);

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 409) {
                $this->retryLater($startedAt, 0);

                return;
            }

            if ($e->engineStatus >= 500) {
                $this->retryLater($startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->giveUp($e);
        } catch (EngineUnavailableException) {
            $this->retryLater($startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineException|EngineValidationException|ProjectProtectedException|ValidationException $e) {
            $this->giveUp($e);
        }
    }

    /** A busy project polls every POLL_SECONDS; an Engine hiccup backs off. */
    private function retryLater(int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            Log::warning('An accepted project delete is still unfinished: the Engine kept the project busy or unreachable.', [
                'application' => $this->applicationId,
            ]);

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch($this->applicationId, $startedAt, $hiccupAttempt)->delay(now()->addSeconds($delay));
    }

    /** The project stays and its own page still deletes it; the log says why. */
    private function giveUp(Throwable $e): void
    {
        Log::warning('An accepted project delete was refused; the project stays.', [
            'application' => $this->applicationId,
            'error' => $e->getMessage(),
        ]);
    }
}
