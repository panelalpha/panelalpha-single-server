<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\LicenceProjectLimit;

/**
 * Community's answer: there is no licence, so no project limit.
 */
final class NoLicenceProjectLimit implements LicenceProjectLimit
{
    public function limit(): ?int
    {
        return null;
    }
}
