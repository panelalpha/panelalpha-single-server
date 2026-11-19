<?php

namespace PanelAlpha\Community\Hub;

/**
 * The pause between two polls of the Hub. A class of its own so tests can
 * record the back-off instead of waiting for it.
 */
class Sleeper
{
    public function sleep(float $seconds): void
    {
        if ($seconds > 0) {
            usleep((int) ($seconds * 1_000_000.0));
        }
    }
}
