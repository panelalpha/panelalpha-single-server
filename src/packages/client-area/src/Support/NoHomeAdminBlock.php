<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\HomeAdminBlock;

/**
 * Community's answer: there is no admin, so `/home` has no `admin` block.
 */
final class NoHomeAdminBlock implements HomeAdminBlock
{
    public function forCurrentSession(): ?array
    {
        return null;
    }
}
