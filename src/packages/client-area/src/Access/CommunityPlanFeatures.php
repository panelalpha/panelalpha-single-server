<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\PlanFeatures;

/**
 * The default {@see PlanFeatures}: the Community plan (no paid edition installed).
 */
final class CommunityPlanFeatures implements PlanFeatures
{
    public function plan(): string
    {
        return self::COMMUNITY;
    }

    public function has(string $feature): bool
    {
        return PlanFeature::offers(self::COMMUNITY, $feature);
    }
}
