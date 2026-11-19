<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\HubPairingStatus;

/**
 * The default {@see HubPairingStatus}: no Client Area Hub pairing.
 */
final class NoHubPairingStatus implements HubPairingStatus
{
    public function paired(): bool
    {
        return false;
    }
}
