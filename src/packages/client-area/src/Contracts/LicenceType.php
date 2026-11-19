<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The licence's type: the one input that decides which paid edition the panel
 * runs as and which single-server tier's limits apply.
 *
 * The paid edition's {@see PlanFeatures} answers it as the plan, and
 * `edition-multi` turns on for the plan's `multi_server` feature, so a
 * `multi-server` licence is what activates Multi; the paid Admin Area's `Licensing\LicenceTier` reads the tier off it.
 *
 * The default binding lives in `edition-pro` (a source build's environment
 * override). A release build's `admin-area-controller` replaces it with the
 * `licensedata`-backed one, which also refuses the override, so the injected
 * licensing client is the only thing that can name a tier there.
 */
interface LicenceType
{
    public const string SINGLE_SERVER_1 = 'single-server-1';

    public const string SINGLE_SERVER_2 = 'single-server-2';

    public const string SINGLE_SERVER_3 = 'single-server-3';

    public const string MULTI_SERVER = 'multi-server';

    /**
     * The effective licence type: one of the constants above.
     */
    public function type(): string;
}
