<?php

namespace PanelAlpha\Community\Hub;

use RuntimeException;

/**
 * The Hub answered 401 to the first report: it does not accept the pairing.
 * Thrown inside the setup transaction so nothing is left behind.
 */
final class PairingRejected extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('The Hub did not accept the pairing.');
    }
}
