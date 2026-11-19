<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The billing and sign-up flags of the Client Area's `/home` `app` block (old
 * `AuthController::home()`, packages/api/app/Http/Controllers/AuthController.php:861-867):
 * whether the Billing and Services pages show (`billing_enabled`), whether the
 * login page offers sign-up (`registration_enabled`), the terms the sign-up
 * shows and the reCAPTCHA site key it loads. Community has no billing and no
 * sign-up: the controller's default answers today's `false`/`null` values; the
 * paid Admin Area binds the background-billing settings.
 */
interface HomeBillingFlags
{
    /**
     * @return array{billing_enabled: bool, registration_enabled: bool, registration_tos: string|null, recaptcha_site_key: string|null, from_control_panel_registration: array{tos: string|null}}
     */
    public function flags(): array;
}
