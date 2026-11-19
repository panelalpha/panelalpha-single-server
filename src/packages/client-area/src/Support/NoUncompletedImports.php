<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\UncompletedImports;

/**
 * Community's answer: there are no imports, so no uncompleted one.
 */
final class NoUncompletedImports implements UncompletedImports
{
    public function exists(): bool
    {
        return false;
    }
}
