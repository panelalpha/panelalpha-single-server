<?php

namespace PanelAlpha\Community\Hub;

use PanelAlpha\Hub\HubPairing;
use Illuminate\Contracts\Container\Container;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\HubPairingStatus;

/**
 * The Community panel is paired with PanelAlpha Hub when a pairing is stored, in
 * single-user mode (as {@see PairedHubLogin}).
 */
final class SingleUserHubPairingStatus implements HubPairingStatus
{
    public function __construct(
        private readonly Container $container,
        private readonly HubPairing $pairing,
    ) {}

    public function paired(): bool
    {
        return SingleUserMode::active($this->container) && $this->pairing->isPaired();
    }
}
