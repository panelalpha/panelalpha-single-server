<?php

namespace PanelAlpha\ClientArea\Sync;

use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;

final class WordPressFactsWarmer
{
    public function __construct(private readonly ProjectWordPressDetails $details) {}

    public function queueMissing(int $engineId): void
    {
        Application::query()
            ->where('engine_id', $engineId)
            ->where('type', Application::TYPE_WORDPRESS)
            ->select('id')
            ->each(function (Application $application): void {
                if (! $this->details->hasEntry($application)) {
                    RefreshProjectWordPressJob::dispatch($application->id)->onConnection('database');
                }
            });
    }
}
