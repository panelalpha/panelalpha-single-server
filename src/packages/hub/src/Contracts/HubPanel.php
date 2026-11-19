<?php

namespace PanelAlpha\Hub\Contracts;

/**
 * What a product tells the Hub about this panel, in the connect request and
 * the signed report (`docs/hub-connect-contract.md` §2, §6).
 */
interface HubPanel
{
    public const string COMMUNITY = 'single-server-community';

    public const string SINGLE_SERVER = 'single';

    public const string MULTI_SERVER = 'multi';

    /** One of the constants above. */
    public function product(): string;

    public function version(): string;

    /** The origin the Hub sends a browser to when the pairing names none. */
    public function adminUrl(): string;

    /** The host name the Hub shows for this panel. */
    public function hostname(string $adminUrl): string;

    /** The panel's public IPv4 address, or an empty string. */
    public function ip(): string;

    public function licenseKey(): ?string;

    /**
     * The panel's applications as the Hub lists them (at most 500), each with
     * the details the panel knows (contract §6): `id` (stable, never reused)
     * names the app in events and login targets. `HubClient` drops details
     * from an item bigger than the Hub's 4 KB.
     *
     * @return list<array{id?: string, name: string, type: string, status: string, public_url?: string, domain?: string|null, created_at?: string|null, framework?: string|null, healthy?: bool|null, allocation?: array<string, int|float|null>, usage?: array<string, int|float|null>|null, disk?: array<string, int|string|null>|null, containers?: list<array<string, int|float|string|null>>}>
     */
    public function apps(): array;

    /**
     * The server the panel runs on, as the Hub shows a connected Engine
     * (contract §6): usage in percent and throughput in bytes per second, the
     * averages since the previous report where the panel can tell, and the
     * hardware totals. Null when the panel cannot read it; the Hub then shows
     * that the panel reports none.
     *
     * @return array{cpu_percent: float|null, ram_percent: float|null, disk_percent: float|null, cpu_cores: int|null, ram_total_bytes: int|null, disk_total_bytes: int|null, net_in_bps?: int|null, net_out_bps?: int|null, disk_read_bps?: int|null, disk_write_bps?: int|null}|null
     */
    public function resourceUsage(): ?array;

    /** The version of the Engine the panel runs on, or null when unknown. */
    public function engineVersion(): ?string;
}
