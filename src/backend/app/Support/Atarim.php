<?php

namespace App\Support;

use App\Models\Setting;

/**
 * Atarim collaboration links.
 *
 * The old panel stored the referral `link` in its `integrations` table and
 * parsed the referral id out of its query string
 * (packages/api/app/Lib/Integrations/Atarim.php:32-53,62-84). Here both values
 * live in the host's `settings` table: `/home` reads `isEnabled()`, and the
 * host binds them as the controller's `AtarimSettings`, which the
 * controller's collaboration link builds the URL from.
 */
final class Atarim
{
    public static function isEnabled(): bool
    {
        return filter_var(Setting::get('atarim-enabled', '0'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * The configured referral link (`atarim-link`), '' when unset.
     */
    public static function referralLink(): string
    {
        return (string) Setting::get('atarim-link', '');
    }
}
