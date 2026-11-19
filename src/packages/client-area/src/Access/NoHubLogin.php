<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\HubLogin;

/**
 * The default {@see HubLogin}: no Client Area Hub login.
 */
final class NoHubLogin implements HubLogin
{
    public function available(): bool
    {
        return false;
    }
}
