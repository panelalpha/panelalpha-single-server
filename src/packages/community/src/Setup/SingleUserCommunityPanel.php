<?php

namespace PanelAlpha\Community\Setup;

use Illuminate\Contracts\Container\Container;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;

/**
 * The Community panel is this package installed in single-user mode – the same
 * condition its routes answer under (404 otherwise).
 */
final class SingleUserCommunityPanel implements CommunityPanel
{
    public function __construct(private readonly Container $container) {}

    public function active(): bool
    {
        return SingleUserMode::active($this->container);
    }
}
