<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Atarim collaboration links.
 *
 * The old panel stored the referral `link` in its `integrations` table and
 * parsed the referral id out of its query string
 * (packages/api/app/Lib/Integrations/Atarim.php:32-53,62-84). No API call is
 * made – the panel only builds the URL, exactly as before. The settings come
 * from the host through the controller's `AtarimSettings` (moved
 * from the host's `App\Support\Atarim` into client-area-legacy, and then into
 * the controller).
 */
final class AtarimCollaborationLink
{
    public const API_URL = 'https://app.atarim.io/';

    /**
     * The referral id from the configured referral link (old `ref_id`, the last
     * query parameter of the referral link).
     */
    public static function referralId(AtarimSettings $settings): string
    {
        $query = parse_url($settings->referralLink, PHP_URL_QUERY);

        if (! is_string($query) || $query === '') {
            return '';
        }

        parse_str($query, $params);

        return Payload::string(array_pop($params));
    }

    public static function url(
        AtarimSettings $settings,
        string $websiteUrl,
        string $email,
        ?string $firstName,
        ?string $lastName,
    ): string {
        $params = [
            '_from' => self::referralId($settings),
            'email' => $email,
            'url' => $websiteUrl,
            'logo' => app(PanelUrl::class)->base().'/api/logo.png',
            'type' => 'one-click',
        ];

        if ($firstName !== null) {
            $params['first_name'] = $firstName;
        }

        if ($lastName !== null) {
            $params['last_name'] = $lastName;
        }

        return self::API_URL.'fetching?'.http_build_query($params);
    }
}
