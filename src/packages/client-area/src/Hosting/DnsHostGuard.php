<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;

/**
 * Default HostGuard: a host is allowed only when it resolves
 * to public addresses. Resolves A **and** AAAA and rejects private, loopback,
 * link-local, CGNAT, NAT64/6to4-embedded private and cloud-metadata ranges, and
 * any address that equals one of the **Engine's resolved IPs** (compared as
 * addresses – never hostnames).
 *
 * The resolver is injected so tests never touch DNS. `validatedAddresses()`
 * resolves **once** and returns the addresses a probe may connect to with SNI
 * (no second lookup – no rebinding window).
 */
final class DnsHostGuard implements HostGuard
{
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly HostResolver $resolver,
    ) {}

    public function assertAllowed(string $host): void
    {
        $this->validatedAddresses($host);
    }

    public function allows(string $host): bool
    {
        try {
            $this->validatedAddresses($host);

            return true;
        } catch (ValidationException) {
            return false;
        }
    }

    public function validatedAddresses(string $host): array
    {
        $host = $this->normalize($host);
        if ($host === '') {
            throw $this->rejected();
        }

        $addresses = filter_var($host, FILTER_VALIDATE_IP)
            ? [$host]
            : $this->resolver->addresses($host);

        if ($addresses === []) {
            throw $this->rejected();
        }

        foreach ($addresses as $address) {
            if ($this->isBlocked($address)) {
                throw $this->rejected();
            }
        }

        return array_values(array_unique(array_map(
            fn (string $address): string => $this->normalizeAddress($address),
            $addresses,
        )));
    }

    /**
     * The addresses a host resolves to, without the range check. Used to learn
     * the Engine's own address (which is blocked by definition).
     *
     * @return list<string>
     */
    public function addresses(string $host): array
    {
        $host = $this->normalize($host);
        if ($host === '') {
            return [];
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$this->normalizeAddress($host)];
        }

        return array_values(array_unique(array_map(
            fn (string $address): string => $this->normalizeAddress($address),
            $this->resolver->addresses($host),
        )));
    }

    /**
     * @param  list<string>  $addresses
     */
    public function anyBlocked(array $addresses): bool
    {
        foreach ($addresses as $address) {
            if ($this->isBlocked($address)) {
                return true;
            }
        }

        return false;
    }

    private function rejected(): ValidationException
    {
        return ValidationException::withMessages([
            'host' => [HostGuard::REFUSAL],
        ]);
    }

    private function normalize(string $host): string
    {
        $host = strtolower(trim($host));

        return rtrim(trim($host, '[]'), '.');
    }

    /**
     * A canonical spelling, so `2001:0db8::1` and `2001:db8::1` compare equal.
     * Strips an IPv6 zone id and brackets; invalid addresses stay as-is and
     * are rejected by the range check.
     */
    private function normalizeAddress(string $address): string
    {
        $address = trim(trim($address), '[]');
        if (str_contains($address, '%')) {
            $scope = strstr($address, '%', true);
            if ($scope !== false && $scope !== '') {
                $address = $scope;
            }
        }

        $packed = @inet_pton($address);
        if ($packed === false) {
            return $address;
        }

        $normalized = inet_ntop($packed);

        return $normalized === false ? $address : $normalized;
    }

    private function isBlocked(string $address): bool
    {
        $address = $this->normalizeAddress($address);

        // Private + reserved ranges (loopback, link-local, 0.0.0.0/8, 240/4…).
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return true;
        }

        // The Engine's own resolved IPs (compared as addresses, inet_pton).
        $packed = @inet_pton($address);
        foreach ($this->engineAddresses() as $engineAddress) {
            $enginePacked = @inet_pton($engineAddress);
            if ($packed !== false && $enginePacked !== false && hash_equals($enginePacked, $packed)) {
                return true;
            }
        }

        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            [$first, $second] = array_map('intval', explode('.', $address));
            // CGNAT 100.64.0.0/10 is not part of PHP's reserved ranges.
            if ($first === 100 && $second >= 64 && $second <= 127) {
                return true;
            }

            // Ranges PHP's FILTER_FLAG_NO_RES_RANGE does not cover:
            // 224.0.0.0/4 multicast, 198.18.0.0/15 benchmarking and
            // 192.0.0.0/24 IETF protocol assignments.
            if ($this->inIpv4Range($address, '224.0.0.0', 4)
                || $this->inIpv4Range($address, '198.18.0.0', 15)
                || $this->inIpv4Range($address, '192.0.0.0', 24)
            ) {
                return true;
            }
        } elseif ($this->inIpv6Range($address, '64:ff9b:1::', 48)
            || $this->inIpv6Range($address, '::', 96)
            || $this->inIpv6Range($address, '2001::', 32)
            || $this->inIpv6Range($address, 'ff00::', 8)
            // Deprecated site-local fec0::/10 and the documentation 2001:db8::/32
            // are global-unicast to PHP's reserved-range check.
            || $this->inIpv6Range($address, 'fec0::', 10)
            || $this->inIpv6Range($address, '2001:db8::', 32)
        ) {
            // IPv6 ranges a global-unicast check must also refuse:
            // NAT64 local-use, IPv4-compatible, Teredo and multicast.
            return true;
        }

        // NAT64 64:ff9b::/96 and 6to4 2002::/16 carry a real IPv4 address the
        // sender would reach; check the embedded address too.
        $embedded = $this->embeddedIpv4($address);
        if ($embedded !== null && $this->isBlocked($embedded)) {
            return true;
        }

        return false;
    }

    /**
     * Whether an address is inside an IPv4 network with the given prefix length.
     */
    private function inIpv4Range(string $address, string $network, int $prefix): bool
    {
        $packed = @inet_pton($address);
        $base = @inet_pton($network);
        if ($packed === false || $base === false || strlen($packed) !== 4) {
            return false;
        }

        return $this->sharesPrefix($packed, $base, $prefix);
    }

    /**
     * Whether an address is inside an IPv6 network with the given prefix length.
     */
    private function inIpv6Range(string $address, string $network, int $prefix): bool
    {
        $packed = @inet_pton($address);
        $base = @inet_pton($network);
        if ($packed === false || $base === false || strlen($packed) !== 16) {
            return false;
        }

        return $this->sharesPrefix($packed, $base, $prefix);
    }

    /**
     * Compare the first `$prefix` bits of two packed inet_pton() addresses.
     */
    private function sharesPrefix(string $packed, string $base, int $prefix): bool
    {
        $bytes = intdiv($prefix, 8);
        $bits = $prefix % 8;

        if ($bytes > 0 && substr($packed, 0, $bytes) !== substr($base, 0, $bytes)) {
            return false;
        }
        if ($bits === 0) {
            return true;
        }

        $mask = (0xff << (8 - $bits)) & 0xff;

        return (ord($packed[$bytes]) & $mask) === (ord($base[$bytes]) & $mask);
    }

    private function embeddedIpv4(string $address): ?string
    {
        $packed = @inet_pton($address);
        if ($packed === false || strlen($packed) !== 16) {
            return null;
        }

        $hex = bin2hex($packed);

        // 64:ff9b::/96 → the last 32 bits are the IPv4 address.
        if (str_starts_with($hex, '0064ff9b0000000000000000')) {
            $packed4 = hex2bin(substr($hex, 24, 8));
            if ($packed4 === false) {
                return null;
            }

            $ip = @inet_ntop($packed4);

            return is_string($ip) ? $ip : null;
        }

        // 2002::/16 → bits 16-47 are the IPv4 address.
        if (str_starts_with($hex, '2002')) {
            $packed4 = hex2bin(substr($hex, 4, 8));
            if ($packed4 === false) {
                return null;
            }

            $ip = @inet_ntop($packed4);

            return is_string($ip) ? $ip : null;
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function engineAddresses(): array
    {
        $addresses = [];
        foreach ($this->engines->engineIds() as $engineId) {
            try {
                $url = $this->engines->forEngine($engineId)->connection()->url;
            } catch (EngineNotConfiguredException) {
                continue;
            }

            $host = parse_url($url, PHP_URL_HOST);
            if (! is_string($host) || $host === '') {
                continue;
            }
            $addresses = array_merge($addresses, $this->addresses($host));
        }

        return array_values(array_unique($addresses));
    }
}
