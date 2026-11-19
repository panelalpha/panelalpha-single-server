<?php

namespace PanelAlpha\ClientArea\Hosting;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * The real resolver: A records (IPv4) plus AAAA records (IPv6), so the guard
 * can reject a name that only resolves to a blocked IPv6 address.
 */
final class DnsHostResolver implements HostResolver
{
    public function addresses(string $host): array
    {
        $addresses = [];

        $a = gethostbynamel($host);
        if (is_array($a)) {
            $addresses = array_merge($addresses, $a);
        }

        $records = dns_get_record($host, DNS_AAAA);
        $records = is_array($records) ? $records : [];

        foreach (array_keys($records) as $key) {
            $ipv6 = Payload::nullableString(Payload::object($records[$key])['ipv6'] ?? null);
            if ($ipv6 !== null) {
                $addresses[] = $ipv6;
            }
        }

        return array_values(array_unique($addresses));
    }
}
