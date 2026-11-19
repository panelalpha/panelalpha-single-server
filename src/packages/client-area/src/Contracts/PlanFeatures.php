<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Which plan the panel runs as and what that plan offers – the one place a
 * plan-dependent yes/no is answered. The plans are `free` and the four licence
 * types of {@see LicenceType}; what each offers is the table in
 * {@see \PanelAlpha\ClientArea\Access\PlanFeature}.
 *
 * Community versus paid is a split by package (the paid code is not installed in
 * Community); the plans of the paid build differ only by this answer, read at call
 * time, so a licence change takes effect without a reinstall. A plan's limits
 * (project counts) are not features: they stay with the code that applies them
 * and read {@see self::plan()}.
 *
 * The controller's default
 * ({@see \PanelAlpha\ClientArea\Access\CommunityPlanFeatures}) answers
 * `free`; the paid edition binds the licence's plan.
 */
interface PlanFeatures
{
    public const string COMMUNITY = 'community';

    /**
     * `free` or one of the {@see LicenceType} constants.
     */
    public function plan(): string;

    /**
     * Whether the plan offers the feature (a
     * {@see \PanelAlpha\ClientArea\Access\PlanFeature} constant).
     */
    public function has(string $feature): bool;
}
