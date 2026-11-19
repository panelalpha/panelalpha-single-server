<?php

namespace PanelAlpha\Community\Setup;

use RuntimeException;

/**
 * The first user exists already, or the setup lock could not be taken because
 * another request is finishing the setup. Callers answer 409.
 */
final class SetupAlreadyDone extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('The setup is already done.');
    }
}
