<?php

namespace PanelAlpha\Hub\Contracts;

/**
 * Where a product keeps the pairing: a string key/value store. Community binds its
 * `settings` table, the paid Admin Area its `system_settings`. The keys are
 * {@see \PanelAlpha\Hub\HubPairing}'s `hub.*` names.
 */
interface HubSettings
{
    public function get(string $name): ?string;

    public function set(string $name, string $value): void;

    public function forget(string ...$names): void;
}
