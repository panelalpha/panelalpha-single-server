<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes the application-user SSO answer the Client Area reads (migration
 * section J): `{data: {sso_url}}`. The Engine names the URL `url` in one build
 * and `sso_url` in another, so both are accepted.
 */
final class AppUserPresenter
{
    /**
     * @param  array<string, mixed>  $result  Engine SSO `data`
     * @return array{sso_url: string|null}
     */
    public function ssoUrl(array $result): array
    {
        $url = Payload::nullableString($result['url'] ?? $result['sso_url'] ?? null);

        return ['sso_url' => is_string($url) ? $url : null];
    }
}
