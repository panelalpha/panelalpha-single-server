<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\SocialLoginCredentials;

/**
 * Community keeps no social-login credentials of its own: the host reads them from
 * `config/services.php`.
 */
final class NoSocialLoginCredentials implements SocialLoginCredentials
{
    public function for(string $provider): ?array
    {
        return null;
    }
}
