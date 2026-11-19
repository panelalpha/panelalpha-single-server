<?php

namespace PanelAlpha\Community\Hub;

use PanelAlpha\Hub\HubPairing;
use Illuminate\Contracts\Container\Container;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\HubLogin;

/**
 * The Community panel offers "Sign in with PanelAlpha" while it is paired with
 * PanelAlpha Connect, in single-user mode (old `HubLoginController::isAvailable()`:
 * single-server and paired), and the pairing names the Hub user who approved
 * it: a ticket signs in the panel's only user, so only that Hub user's may.
 * A pairing stored before the id was kept offers no Hub sign-in until it is
 * connected again.
 */
final class PairedHubLogin implements HubLogin
{
    public function __construct(
        private readonly Container $container,
        private readonly HubPairing $pairing,
    ) {}

    public function available(): bool
    {
        return SingleUserMode::active($this->container)
            && $this->pairing->isPaired()
            && $this->pairing->hubUserId() !== null;
    }
}
