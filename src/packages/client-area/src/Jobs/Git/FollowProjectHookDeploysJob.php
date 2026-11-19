<?php

namespace PanelAlpha\ClientArea\Jobs\Git;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\HookDeployFollower;
use PanelAlpha\EngineClient\EngineHealth;
use Throwable;

/**
 * Follows one project's git-hook deploys in the Engine's deploy history
 * ({@see HookDeployFollower}). Fanned out by
 * `FollowGitHookDeploysJob`, one job per hooked application, so a slow or
 * failing project cannot hold up the rest. The queue behaviour is
 * the retired `ImportAutoDeployDeliveriesJob`'s.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller.
 */
final class FollowProjectHookDeploysJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 10;

    public int $maxExceptions = 1;

    /** A bounded number of Engine calls plus at most one provider re-registration. */
    public int $timeout = 60;

    /** How long a per-project run waits while the breaker is open. */
    public const DOWN_RETRY_SECONDS = 60;

    /** How long the run keeps re-queuing while the breaker is open. */
    public const RETRY_WINDOW_SECONDS = 600;

    /**
     * The absolute end of this job's retry window, fixed when it is first
     * dispatched so a release keeps the same window.
     */
    public readonly int $retryDeadline;

    /**
     * The worker must not fail the job before `handle()` can end it silently
     * once the window is over, so the deadline the worker sees sits one release
     * delay beyond the real window, which `handle()` enforces.
     */
    public function retryUntil(): \DateTimeInterface
    {
        return Carbon::createFromTimestamp($this->retryDeadline + self::DOWN_RETRY_SECONDS);
    }

    /**
     * A lost job row must not block this project's follow-up forever; the lock
     * outlives the retry window plus one release delay.
     */
    public int $uniqueFor = self::RETRY_WINDOW_SECONDS + self::DOWN_RETRY_SECONDS;

    public function __construct(public readonly int $applicationId, int $retryDeadline = 0)
    {
        $this->retryDeadline = $retryDeadline > 0
            ? $retryDeadline
            : now()->addSeconds(self::RETRY_WINDOW_SECONDS)->getTimestamp();
        $this->onQueue('sync');
    }

    /**
     * One run per project: a slow run must not stack behind itself.
     */
    public function uniqueId(): string
    {
        return 'user-application:follow-hook-deploys:'.$this->applicationId;
    }

    /**
     * The worker gave up on this run (timeout or an unexpected error): tell the
     * CA with the auto-deploy failure type, as the retired import did. Normal
     * Engine hiccups never reach here – `handle()` reports them so the next
     * scheduled run retries.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        ClientAreaNotificationRequested::dispatch(
            $application,
            'user.instance.git_auto_deploy_failed',
            message: 'The auto-deploy import stopped.',
            isError: true,
            includeInstance: true,
        );
    }

    public function handle(HookDeployFollower $follower, EngineHealth $health): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        // Never call a known-down Engine from a fan-out. Once the retry window
        // is over, return silently instead of releasing so the job never lands
        // in failed_jobs; the scheduler fans out again next cycle.
        if ($health->isDown($application->engine_id)) {
            if (now()->getTimestamp() + self::DOWN_RETRY_SECONDS >= $this->retryDeadline) {
                return;
            }

            $this->release(self::DOWN_RETRY_SECONDS);

            return;
        }

        try {
            $follower->follow($application);
        } catch (Throwable $e) {
            // The marker did not move past what failed; the next scheduled run
            // retries it.
            report($e);
        }
    }
}
