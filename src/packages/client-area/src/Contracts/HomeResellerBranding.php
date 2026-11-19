<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;

/**
 * A reseller's branding in the Client Area's `/home` (old
 * `AuthController::home()`, packages/api/app/Http/Controllers/AuthController.php:898-918):
 * the `app` block with the brand name and theme of the signed-in reseller or
 * of a sub-user's reseller (and `default_theme` for a reseller), and the
 * user's `reseller_settings`, which is the Client Area's gate to the
 * Reseller Area (App.vue:106-113, NavbarTopNavigation.vue:78-85). Community has no
 * resellers: the controller's default answers the payload unchanged and
 * `null`; the paid Admin Area binds the old answer.
 */
interface HomeResellerBranding
{
    /**
     * @param  array<string, mixed>  $app  the `/home` `app` block
     * @return array{app: array<string, mixed>, reseller_settings: array<string, mixed>|null}
     */
    public function forUser(Authenticatable $user, array $app): array;
}
