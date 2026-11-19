<?php

namespace Tests\Unit\Packages\Hub;

use PanelAlpha\Hub\Contracts\HubPanel;

/**
 * What a product tells the Hub, with every answer settable by the test.
 */
final class StubHubPanel implements HubPanel
{
    /**
     * @param  list<array{name: string, type: string, status: string, public_url?: string}>  $apps
     * @param  array{cpu_percent: float|null, ram_percent: float|null, disk_percent: float|null, cpu_cores: int|null, ram_total_bytes: int|null, disk_total_bytes: int|null}|null  $resourceUsage
     */
    public function __construct(
        public string $product = HubPanel::COMMUNITY,
        public string $version = '1.9.0',
        public string $adminUrl = 'https://panel.example.com',
        public string $hostname = 'box.example.com',
        public string $ip = '',
        public ?string $licenseKey = null,
        public array $apps = [],
        public ?array $resourceUsage = null,
        public ?string $engineVersion = null,
    ) {}

    public function product(): string
    {
        return $this->product;
    }

    public function version(): string
    {
        return $this->version;
    }

    public function adminUrl(): string
    {
        return $this->adminUrl;
    }

    public function hostname(string $adminUrl): string
    {
        return $this->hostname;
    }

    public function ip(): string
    {
        return $this->ip;
    }

    public function licenseKey(): ?string
    {
        return $this->licenseKey;
    }

    public function apps(): array
    {
        return $this->apps;
    }

    public function resourceUsage(): ?array
    {
        return $this->resourceUsage;
    }

    public function engineVersion(): ?string
    {
        return $this->engineVersion;
    }
}
