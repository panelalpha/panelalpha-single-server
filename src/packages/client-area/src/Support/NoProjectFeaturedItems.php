<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\ProjectFeaturedItems;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Community's answer: no admin packages, so no featured plugins or themes – the
 * Client Area shows no featured cards (as since 2026-10-15).
 */
final class NoProjectFeaturedItems implements ProjectFeaturedItems
{
    public function plugins(Application $application): array
    {
        return [];
    }

    public function themes(Application $application): array
    {
        return [];
    }
}
