<?php

namespace Tests\Feature\ClientArea\Hosting;

use PanelAlpha\ClientArea\Contracts\PrimaryDomainSwitcher;
use PanelAlpha\ClientArea\Hosting\ComposedPrimaryDomainSwitch;
use Tests\TestCase;

/**
 * The Engine has no atomic set-as-primary and will not get one, so the
 * composed switch (old PanelAlpha/Account/Domains::setAsPrimaryDomain) is
 * permanent controller code and the
 * `PrimaryDomainSwitcher` default – with or without client-area-legacy (the
 * no-legacy suite proves the latter). The flow itself is DomainsTest's
 * `test_set_as_primary_*`.
 */
final class PrimaryDomainSwitchTest extends TestCase
{
    public function test_the_controller_binds_the_composed_switch(): void
    {
        $this->assertInstanceOf(ComposedPrimaryDomainSwitch::class, app(PrimaryDomainSwitcher::class));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Hosting\\ComposedPrimaryDomainSwitch'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Hosting\\NullPrimaryDomainSwitcher'));
    }
}
