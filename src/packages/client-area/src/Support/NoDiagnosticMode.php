<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\DiagnosticMode;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Community's answer: there is no diagnostic mode, so no project is ever
 * blocked by one.
 */
final class NoDiagnosticMode implements DiagnosticMode
{
    public function blockedEntity(Application $application): ?string
    {
        return null;
    }
}
