<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Whether this panel is the Community panel: its Client Area has the Community pages
 * (Tasks, Settings, the setup Hub step) and no Admin Area link. `/home` sends
 * it as `app.community_panel` in every edition; the Client Area shows the Community
 * pages when it is true and the Admin Area link and "Full server management"
 * when it is false. The controller's default
 * ({@see \PanelAlpha\ClientArea\Access\NoCommunityPanel}) answers false –
 * the paid product, which has those pages in its Admin Area; the Community package
 * (community, installed only in the Community deployment) binds its own.
 */
interface CommunityPanel
{
    public function active(): bool;
}
