<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Whether the first-run wizard is still owed: single-user mode is active and
 * the panel has no user yet. `/home` reads it in every edition; the
 * controller's default ({@see \PanelAlpha\ClientArea\Access\NoSetupRequired})
 * answers false, and the Community package (community, whose wizard it is)
 * binds its own.
 */
interface SetupState
{
    /**
     * Reads storage, so the answer can change between two calls in a request.
     *
     * @phpstan-impure
     */
    public function required(): bool;

    /**
     * Whether the wizard is closed although the panel still has no account:
     * the first-user variables were delivered and could not create it, so the
     * account is the operator's to repair and no visitor may create one.
     * `/home` sends it as `app.setup_blocked` for the login page; false in the
     * paid editions, which have no wizard.
     */
    public function blocked(): bool;
}
