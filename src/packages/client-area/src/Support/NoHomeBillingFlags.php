<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\HomeBillingFlags;

/**
 * Community's answer: no billing and no sign-up, so the Client Area hides the
 * Billing and Services pages and the sign-up link.
 */
final class NoHomeBillingFlags implements HomeBillingFlags
{
    public function flags(): array
    {
        return [
            'billing_enabled' => false,
            'registration_enabled' => false,
            'registration_tos' => null,
            'recaptcha_site_key' => null,
            'from_control_panel_registration' => ['tos' => null],
        ];
    }
}
