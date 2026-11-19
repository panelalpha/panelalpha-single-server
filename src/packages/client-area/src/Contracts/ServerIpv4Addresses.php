<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The IPv4 addresses of the server the projects run on. A project's own list
 * (`config.ip_addresses.ipv4`) can be empty, for example when the Engine does
 * not assign addresses to users; the presenters then show these, so the DNS
 * instructions still have an A record. The host answers from its cached Engine
 * system info and never calls the Engine on a read. The host answers only in the
 * Community (single-server) edition; the answer is the same for every project,
 * so the host reads it once per request. Without a host binding the list is
 * empty.
 */
interface ServerIpv4Addresses
{
    /**
     * @return list<string>
     */
    public function addresses(): array;
}
