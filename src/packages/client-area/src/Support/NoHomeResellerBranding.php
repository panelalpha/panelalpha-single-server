<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\HomeResellerBranding;

/**
 * Community's answer: no resellers, so `/home` keeps the panel's name and theme and
 * `reseller_settings` is null – the Client Area shows no Reseller Area.
 */
final class NoHomeResellerBranding implements HomeResellerBranding
{
    public function forUser(Authenticatable $user, array $app): array
    {
        return ['app' => $app, 'reseller_settings' => null];
    }
}
