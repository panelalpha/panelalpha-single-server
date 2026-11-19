<?php

namespace PanelAlpha\Hub\Go;

use RuntimeException;

/**
 * The panel is not paired with PanelAlpha Hub (or the Hub forgot the pairing),
 * so it has no token for PanelAlpha Go.
 */
final class GoNotConnected extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Connect to PanelAlpha Hub to install apps from PanelAlpha Go.');
    }
}
