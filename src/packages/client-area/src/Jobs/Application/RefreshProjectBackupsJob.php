<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Models\Application;

final class RefreshProjectBackupsJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 90;

    public int $uniqueFor = 120;

    public function __construct(public readonly int $applicationId)
    {
        $this->onQueue('default');
    }

    public function uniqueId(): string
    {
        return 'client-area:project-backups:'.$this->applicationId;
    }

    public function handle(BackupService $backups): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $backups->refreshDetails($application);
    }
}
