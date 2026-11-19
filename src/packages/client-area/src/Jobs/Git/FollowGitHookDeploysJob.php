<?php

namespace PanelAlpha\ClientArea\Jobs\Git;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineHealth;

/**
 * Scheduled entry point of the hook-deploy follower (the
 * successor of the retired `SyncAutoDeployDeliveriesJob`): selects the ids of every project with auto-deploy on and
 * dispatches one {@see FollowProjectHookDeploysJob} per id – the scheduled job
 * itself makes no Engine or provider call.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller.
 */
final class FollowGitHookDeploysJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** A lost job row must not block the scheduled follow-up forever. */
    public int $uniqueFor = 300;

    public function __construct()
    {
        $this->onQueue('sync');
    }

    public function uniqueId(): string
    {
        return 'user-application:git-hook-deploys';
    }

    public function handle(EngineHealth $health): void
    {
        Application::query()
            ->whereNotNull('git_webhook_id')
            ->select('id', 'engine_id')
            ->lazyById(100)
            ->each(function (Application $application) use ($health): void {
                // A down Engine's projects are skipped until its breaker closes.
                if ($health->isDown($application->engine_id)) {
                    return;
                }

                FollowProjectHookDeploysJob::dispatch($application->id)->onConnection('database');
            });
    }
}
