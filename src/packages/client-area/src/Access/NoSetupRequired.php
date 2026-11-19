<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Contracts\SetupState;

/**
 * The default {@see SetupState}: no first-run wizard. Only the Community package
 * (community) has one and binds its own answer; the paid editions set
 * the panel up in the Admin Area.
 */
final class NoSetupRequired implements SetupState
{
    /**
     * Always the same answer; the contract's callers still treat it as impure.
     *
     * @phpstan-pure
     */
    public function required(): bool
    {
        return false;
    }

    /**
     * @phpstan-pure
     */
    public function blocked(): bool
    {
        return false;
    }
}
