<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ScreenshotService;

final class RefreshProjectScreenshotJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public const QUEUE = 'long';

    public const DELAY_SECONDS = 30;

    public int $tries = 1;

    public int $timeout = 180;

    public int $uniqueFor = 300;

    public function __construct(public readonly int $applicationId)
    {
        $this->onQueue(self::QUEUE);
        $this->onConnection('database-long');
        $this->delay(self::DELAY_SECONDS);
    }

    public function uniqueId(): string
    {
        return 'client-area:project-screenshot:'.$this->applicationId;
    }

    public function handle(ScreenshotService $screenshots): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $screenshots->refresh($application);
    }
}
