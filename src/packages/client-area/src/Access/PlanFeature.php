<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\LicenceType;
use PanelAlpha\ClientArea\Contracts\PlanFeatures;

/**
 * The plan-dependent features and the table of what each plan offers
 * ({@see PlanFeatures}). Moving a feature between plans is a change to
 * {@see self::TABLE} alone; `PlanFeatureTableTest` pins it.
 *
 * Every row was ported from a licence check of the old panel
 * (`SystemSetting::isAppSingleServer()`, `getLicenseType()`, the tier rules of
 * `Plan`), so the table changes no behaviour.
 */
final class PlanFeature
{
    /**
     * Multi-server mode: several Engines, the multi-server Admin Area menus and
     * the Hub's `multi` product. Without it the panel is the old single-server
     * edition – one Engine with a default plan, user and service, and the
     * licence's project limit.
     */
    public const string MULTI_SERVER = 'multi_server';

    /**
     * A user may hold several services: the Admin Area's Add user, Add service
     * and Quick Add (old tiers 1 and 2 hold the one default service).
     */
    public const string MULTIPLE_SERVICES = 'multiple_services';

    /**
     * More than one plan (old `Plan::canCreateAnotherPlan()`).
     */
    public const string MULTIPLE_PLANS = 'multiple_plans';

    /**
     * A plan's domains settings may be changed (old
     * `Plan::assertCanUpdateDomainsSettings()`).
     */
    public const string PLAN_DOMAIN_SETTINGS = 'plan_domain_settings';

    /**
     * "Sign in with PanelAlpha" into the Admin Area (none in
     * multi-server mode).
     */
    public const string ADMIN_HUB_LOGIN = 'admin_hub_login';

    /**
     * @var list<string>
     */
    public const array ALL = [
        self::MULTI_SERVER,
        self::MULTIPLE_SERVICES,
        self::MULTIPLE_PLANS,
        self::PLAN_DOMAIN_SETTINGS,
        self::ADMIN_HUB_LOGIN,
    ];

    /**
     * What each plan offers. Community lists none: its Client Area features are the
     * controller's and `community`'s, installed only there.
     *
     * @var array<string, list<string>>
     */
    public const array TABLE = [
        PlanFeatures::COMMUNITY => [],
        LicenceType::SINGLE_SERVER_1 => [
            self::ADMIN_HUB_LOGIN,
        ],
        LicenceType::SINGLE_SERVER_2 => [
            self::ADMIN_HUB_LOGIN,
        ],
        LicenceType::SINGLE_SERVER_3 => [
            self::MULTIPLE_SERVICES,
            self::MULTIPLE_PLANS,
            self::PLAN_DOMAIN_SETTINGS,
            self::ADMIN_HUB_LOGIN,
        ],
        LicenceType::MULTI_SERVER => [
            self::MULTI_SERVER,
            self::MULTIPLE_SERVICES,
            self::MULTIPLE_PLANS,
            self::PLAN_DOMAIN_SETTINGS,
        ],
    ];

    /**
     * Whether the plan offers the feature; an unknown plan offers nothing.
     */
    public static function offers(string $plan, string $feature): bool
    {
        return in_array($feature, self::TABLE[$plan] ?? [], true);
    }
}
