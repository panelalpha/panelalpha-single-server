<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * A domain as the Client Area shows it: without a leading `www.`, as the old
 * panel stored it (`Helper::removeWwwPrefix`, packages/api/app/Lib/Helper.php:630-637).
 * Presentation only – the mirror and every Engine call keep the
 * Engine's name.
 */
final class PresentedDomain
{
    public static function of(?string $domain): ?string
    {
        return $domain !== null && str_starts_with($domain, 'www.') ? substr($domain, 4) : $domain;
    }
}
