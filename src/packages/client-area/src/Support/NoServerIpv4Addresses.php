<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;

/**
 * Default {@see ServerIpv4Addresses}: no server addresses beyond the projects' own.
 */
final class NoServerIpv4Addresses implements ServerIpv4Addresses
{
    public function addresses(): array
    {
        return [];
    }
}
