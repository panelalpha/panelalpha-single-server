<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Whether the Client Area's login page offers "Sign in with PanelAlpha"
 * (`/home` `app.hub_login`, `Login.vue:547-548`): a ticket from PanelAlpha
 * Connect signs in the panel's user. Only the Community panel offers it in the
 * Client Area (community: paired and single-user); the
 * paid product's Hub login is the Admin Area's, and Multi has none. The
 * controller's default ({@see \PanelAlpha\ClientArea\Access\NoHubLogin})
 * answers false.
 */
interface HubLogin
{
    public function available(): bool;
}
