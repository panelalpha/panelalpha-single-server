<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Whether this panel is paired with PanelAlpha Hub (`/home` `app.hub_paired`,
 * the Community menu reminder in `UserInfoDropdown.vue`). It is the Client Area's
 * (Community) pairing only: the paid product answers false, its Hub is the Admin
 * Area's (`admin-area-controller/src/Hub/HubPairing.php`). The controller's
 * default ({@see \PanelAlpha\ClientArea\Access\NoHubPairingStatus})
 * answers false.
 */
interface HubPairingStatus
{
    public function paired(): bool;
}
