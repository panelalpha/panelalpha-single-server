<?php

namespace PanelAlpha\ClientArea\Listeners;

use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Sync\WordPressFactsWarmer;

final class QueueMissingWordPressDetails
{
    public function __construct(private readonly WordPressFactsWarmer $warmer) {}

    public function handle(EngineProjectsSynced $event): void
    {
        $this->warmer->queueMissing($event->engineId);
    }
}
