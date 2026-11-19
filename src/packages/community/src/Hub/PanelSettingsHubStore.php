<?php

namespace PanelAlpha\Community\Hub;

use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Hub\Contracts\HubSettings;

/**
 * The Community panel keeps its PanelAlpha Hub pairing in the host's `settings`
 * table.
 */
final class PanelSettingsHubStore implements HubSettings
{
    public function __construct(private readonly PanelSettings $settings) {}

    public function get(string $name): ?string
    {
        return $this->settings->get($name);
    }

    public function set(string $name, string $value): void
    {
        $this->settings->set($name, $value);
    }

    public function forget(string ...$names): void
    {
        $this->settings->forget(...$names);
    }
}
