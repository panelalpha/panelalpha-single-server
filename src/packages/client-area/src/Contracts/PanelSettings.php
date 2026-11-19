<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The panel's named settings (the host's `settings` table), for packages that
 * read or change them.
 *
 * The table is the host's and package code never imports `App\…`, so the host
 * binds this contract – the pattern of `AtarimSettings` and engine-client's
 * `EngineConnection`. The controller binds no default.
 */
interface PanelSettings
{
    /**
     * The stored value, or $default when the setting is unset.
     */
    public function get(string $name, ?string $default = null): ?string;

    /**
     * Store a value; the next `get()` in the same request sees it.
     */
    public function set(string $name, string $value): void;

    /**
     * Delete the settings; the next `get()` in the same request sees them gone.
     */
    public function forget(string ...$names): void;
}
