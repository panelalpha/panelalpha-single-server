<?php

namespace Tests\Unit\Packages\Hub;

use PanelAlpha\Hub\Contracts\HubSettings;

/**
 * The pairing store of a product, in memory: what `HubPairing` needs and
 * nothing else, so the Hub package is tested without a database.
 */
class InMemoryHubSettings implements HubSettings
{
    /** @var array<string, string> */
    public array $values = [];

    /** @var list<string> every name written, in order */
    public array $writes = [];

    public function get(string $name): ?string
    {
        return $this->values[$name] ?? null;
    }

    public function set(string $name, string $value): void
    {
        $this->writes[] = $name;
        $this->values[$name] = $value;
    }

    public function forget(string ...$names): void
    {
        foreach ($names as $name) {
            unset($this->values[$name]);
        }
    }
}
