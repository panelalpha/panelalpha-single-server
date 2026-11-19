<?php

namespace Tests\Unit\Packages\Hub;

use PanelAlpha\Hub\Contracts\HubHost;
use PanelAlpha\Hub\Contracts\HubPanel;

/**
 * A product whose panel also reports the server it runs on.
 */
final class StubHubPanelWithHost implements HubHost, HubPanel
{
    private readonly StubHubPanel $panel;

    /**
     * @param  array{hostname: string|null, os: string|null, kernel: string|null, uptime_seconds: int|null, public_ipv4: string|null}|null  $host
     */
    public function __construct(private readonly ?array $host)
    {
        $this->panel = new StubHubPanel;
    }

    public function host(): ?array
    {
        return $this->host;
    }

    public function product(): string
    {
        return $this->panel->product();
    }

    public function version(): string
    {
        return $this->panel->version();
    }

    public function adminUrl(): string
    {
        return $this->panel->adminUrl();
    }

    public function hostname(string $adminUrl): string
    {
        return $this->panel->hostname($adminUrl);
    }

    public function ip(): string
    {
        return $this->panel->ip();
    }

    public function licenseKey(): ?string
    {
        return $this->panel->licenseKey();
    }

    public function apps(): array
    {
        return $this->panel->apps();
    }

    public function resourceUsage(): ?array
    {
        return $this->panel->resourceUsage();
    }

    public function engineVersion(): ?string
    {
        return $this->panel->engineVersion();
    }
}
