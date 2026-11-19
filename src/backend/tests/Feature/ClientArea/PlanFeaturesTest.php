<?php

namespace Tests\Feature\ClientArea;

use PanelAlpha\ClientArea\Access\CommunityPlanFeatures;
use PanelAlpha\ClientArea\Access\PlanFeature;
use PanelAlpha\ClientArea\Contracts\LicenceType;
use PanelAlpha\ClientArea\Contracts\PlanFeatures;
use Tests\TestCase;

/**
 * The plan and its features ({@see PlanFeatures}): Community is the controller's
 * default and offers none of the paid features; the table names every plan
 * and only known features.
 */
final class PlanFeaturesTest extends TestCase
{
    public function test_community_is_the_community_plan_and_offers_no_paid_feature(): void
    {
        $plan = app(PlanFeatures::class);

        $this->assertInstanceOf(CommunityPlanFeatures::class, $plan);
        $this->assertSame(PlanFeatures::COMMUNITY, $plan->plan());
        foreach (PlanFeature::ALL as $feature) {
            $this->assertFalse($plan->has($feature), $feature);
        }
    }

    public function test_the_table_names_every_plan_and_only_known_features(): void
    {
        $this->assertSame(
            [PlanFeatures::COMMUNITY, LicenceType::SINGLE_SERVER_1, LicenceType::SINGLE_SERVER_2, LicenceType::SINGLE_SERVER_3, LicenceType::MULTI_SERVER],
            array_keys(PlanFeature::TABLE),
        );

        $constants = (new \ReflectionClass(PlanFeature::class))->getConstants();
        unset($constants['ALL'], $constants['TABLE']);
        $this->assertSame(array_values($constants), PlanFeature::ALL, 'PlanFeature::ALL lists every feature constant');

        foreach (PlanFeature::TABLE as $plan => $features) {
            $this->assertSame([], array_values(array_diff($features, PlanFeature::ALL)), "{$plan} names an unknown feature");
            $this->assertSame($features, array_values(array_unique($features)), "{$plan} names a feature twice");
        }
    }

    public function test_an_unknown_plan_offers_nothing(): void
    {
        $this->assertFalse(PlanFeature::offers('single-server-9', PlanFeature::MULTI_SERVER));
        $this->assertFalse(PlanFeature::offers(LicenceType::MULTI_SERVER, 'no_such_feature'));
    }
}
