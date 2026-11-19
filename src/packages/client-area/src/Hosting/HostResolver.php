<?php

namespace PanelAlpha\ClientArea\Hosting;

/**
 * Resolves a hostname to its addresses (A and AAAA). An injected service so the
 * host guard can be tested without DNS.
 */
interface HostResolver
{
    /**
     * @return list<string> IPv4 and IPv6 literals; [] when the name does not resolve
     */
    public function addresses(string $host): array;
}
