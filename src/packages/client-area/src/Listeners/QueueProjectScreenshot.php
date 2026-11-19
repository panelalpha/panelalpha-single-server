<?php

namespace PanelAlpha\ClientArea\Listeners;

use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectScreenshotJob;

final class QueueProjectScreenshot
{
    public const TYPES = [
        'user.instance.installation_finished',
        'user.instance.redeploy_finished',
        'user.instance.git_auto_deploy_finished',
        'user.instance.create_staging_finished',
    ];

    public function handle(ClientAreaNotificationRequested $event): void
    {
        if ($event->isError || ! in_array($event->type, self::TYPES, true)) {
            return;
        }

        RefreshProjectScreenshotJob::dispatch($event->application->id);
    }
}
