<?php

namespace PanelAlpha\ClientArea\Jobs\Sync;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;

/**
 * Keeps the local applications table close to the Engine(s). Runs on the
 * scheduler so projects created outside the panel, or Engine
 * status changes, show up without waiting for a user request.
 *
 * One failing Engine must not stop the others (Multi-server), so each sync is
 * reported and the loop continues. `syncIfStale` still honours the TTL, so
 * this is cheap even when it runs every minute.
 *
 * Type detection is dispatched only for projects seen for the first time in a
 * sync; known projects are re-probed by the job's own back-off.
 *
 * Internal scheduled job: it has no CA-visible operation and nobody waits on
 * it, so it sends no notification and has no `failed()`; a down Engine is
 * skipped by the breaker.
 */
final class SyncEnginesJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** A lost job row must not block the scheduled sync forever. */
    public int $uniqueFor = 300;

    public function __construct()
    {
        $this->onQueue('sync');
    }

    public function uniqueId(): string
    {
        return 'user-application:sync-engines';
    }

    public function handle(EngineResolver $engines, ApplicationSynchronizer $synchronizer, EngineHealth $health): void
    {
        foreach ($engines->engineIds() as $engineId) {
            // One down Engine must not cost a doomed sync per minute; the breaker
            // reopens after 5 min or as soon as it answers.
            if ($health->isDown($engineId)) {
                continue;
            }

            try {
                $synced = $synchronizer->syncIfStale($engineId);
                // Announce only a real sync of the project list, so listeners
                // stay on the sync TTL.
                if ($synced !== null) {
                    EngineProjectsSynced::dispatch($engineId);
                }
            } catch (EngineException $e) {
                report($e);
            }
        }
    }
}
