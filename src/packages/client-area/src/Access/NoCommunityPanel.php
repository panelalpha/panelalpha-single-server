<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\CommunityPanel;

/**
 * The default {@see CommunityPanel}: not the Community panel (no community).
 */
final class NoCommunityPanel implements CommunityPanel
{
    public function active(): bool
    {
        return false;
    }
}
