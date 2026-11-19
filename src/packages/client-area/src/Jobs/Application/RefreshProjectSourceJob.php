<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;

/**
 * Reads a deployed project's Source card facts from the Engine (its
 * containers and deploy history) into the cache the project answer reads
 * ({@see ProjectSourceDetails}). The project page dispatches it when the
 * cache is empty, so the request itself never calls the Engine.
 * Carries the id only; one per project at a time.
 */
final class RefreshProjectSourceJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    /** A lost job row must not keep the card empty for long. */
    public int $uniqueFor = 120;

    public function __construct(public readonly int $applicationId)
    {
        $this->onQueue('default');
    }

    public function uniqueId(): string
    {
        return 'client-area:project-source:'.$this->applicationId;
    }

    public function handle(ProjectSourceDetails $details): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $details->refresh($application);
    }
}
