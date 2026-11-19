<?php

namespace PanelAlpha\Hub\Contracts;

/**
 * A panel that also reports the server it runs on (contract §6, `host`),
 * like the host facts the Hub shows for a connected Engine. Not part of
 * `HubPanel`: a product whose panel does not implement it reports no `host`.
 */
interface HubHost
{
    /**
     * Each value null when unknown; null when nothing is known.
     *
     * @return array{hostname: string|null, os: string|null, kernel: string|null, uptime_seconds: int|null, public_ipv4: string|null}|null
     */
    public function host(): ?array;
}
