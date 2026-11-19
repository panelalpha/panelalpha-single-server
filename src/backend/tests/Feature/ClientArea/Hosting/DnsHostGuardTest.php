<?php

namespace Tests\Feature\ClientArea\Hosting;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Hosting\DnsHostGuard;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Outbound requests: reject private, loopback, link-local, CGNAT
 * and cloud-metadata ranges and the **Engine's resolved IPs**, checking A and
 * AAAA. The resolver is injected – the test never resolves a name.
 * The guard is panel-side; it has no Engine endpoint of its own.
 */
class DnsHostGuardTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->configureEngine();
    }

    /**
     * @param  array<string, list<string>>  $map
     */
    private function guard(array $map = []): DnsHostGuard
    {
        // The Engine host resolves to a public IP; the guard must still block it.
        $map['engine.example.com'] ??= [TestNetwork::public(5)];

        $this->app->instance(HostResolver::class, new class($map) implements HostResolver
        {
            /** @param array<string, list<string>> $map */
            public function __construct(private readonly array $map) {}

            public function addresses(string $host): array
            {
                return $this->map[$host] ?? [];
            }
        });

        return $this->app->make(DnsHostGuard::class);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function blockedHosts(): iterable
    {
        yield 'loopback' => [TestNetwork::LOOPBACK];
        yield 'private 10/8' => [TestNetwork::private(5)];
        yield 'private 172.16/12' => [TestNetwork::PRIVATE_172];
        yield 'private 192.168/16' => [TestNetwork::private2(1)];
        yield 'link-local / metadata' => [TestNetwork::METADATA];
        yield 'CGNAT 100.64/10' => [TestNetwork::CGNAT];
        yield 'IPv6 loopback' => ['::1'];
        yield 'IPv6 unique-local' => ['fd00::1'];
        yield 'unspecified' => [TestNetwork::ANY];
        // Ranges PHP's FILTER_FLAG_NO_RES_RANGE does not cover.
        // First **and last** address of each range: a narrower prefix would
        // still pass on the first address and silently let the rest through
        // (e.g. /15→/16 and /4→/8).
        yield 'IPv4 multicast 224/4 first' => [TestNetwork::MULTICAST];
        yield 'IPv4 multicast 224/4 last' => [TestNetwork::MULTICAST_LAST];
        yield 'IPv4 benchmarking 198.18/15 first' => [TestNetwork::BENCHMARK];
        yield 'IPv4 benchmarking 198.18/15 last' => [TestNetwork::BENCHMARK_LAST];
        yield 'IPv4 IETF protocol 192.0.0/24 first' => [TestNetwork::IETF_PROTOCOL_FIRST];
        yield 'IPv4 IETF protocol 192.0.0/24 last' => [TestNetwork::IETF_PROTOCOL_LAST];
        yield 'CGNAT 100.64/10 first' => [TestNetwork::CGNAT];
        yield 'CGNAT 100.64/10 last' => [TestNetwork::CGNAT_LAST];
        yield 'private 10/8 first' => [TestNetwork::PRIVATE_10];
        yield 'private 10/8 last' => [TestNetwork::PRIVATE_10_LAST];
        yield 'private 172.16/12 first' => [TestNetwork::PRIVATE_172];
        yield 'private 172.16/12 last' => [TestNetwork::PRIVATE_172_LAST];
        yield 'private 192.168/16 first' => [TestNetwork::private2(1)];
        yield 'private 192.168/16 last' => [TestNetwork::PRIVATE_192_LAST];
        yield 'IPv6 multicast ff00::/8 first' => ['ff02::1'];
        yield 'IPv6 multicast ff00::/8 last' => ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'];
        yield 'IPv6 NAT64 local-use 64:ff9b:1::/48 first' => ['64:ff9b:1::1'];
        yield 'IPv6 NAT64 local-use 64:ff9b:1::/48 last' => ['64:ff9b:1:ffff:ffff:ffff:ffff:ffff'];
        yield 'IPv6 Teredo 2001::/32 first' => ['2001::1'];
        yield 'IPv6 Teredo 2001::/32 last' => ['2001:0:ffff:ffff:ffff:ffff:ffff:ffff'];
        // PHP's reserved-range flag treats fec0::/10 and 2001:db8::/32 as global
        // unicast.
        yield 'IPv6 site-local fec0::/10 first' => ['fec0::1'];
        yield 'IPv6 site-local fec0::/10 last' => ['feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'];
        yield 'IPv6 documentation 2001:db8::/32 first' => ['2001:db8::1'];
        yield 'IPv6 documentation 2001:db8::/32 last' => ['2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'];
        yield 'IPv6 IPv4-compatible ::/96 first' => ['::102:304'];
        yield 'IPv6 IPv4-compatible ::/96 last' => ['::ffff:ffff'];
        yield 'empty' => [''];
    }

    #[DataProvider('blockedHosts')]
    public function test_internal_hosts_are_blocked(string $host): void
    {
        $this->assertFalse($this->guard()->allows($host));
    }

    public function test_a_public_literal_address_is_allowed(): void
    {
        $this->assertTrue($this->guard()->allows(TestNetwork::routable(8)));
    }

    public function test_the_engine_address_is_blocked_even_via_another_name(): void
    {
        // A name resolving to the Engine's public IP is refused too.
        $guard = $this->guard(['rebind.example.com' => [TestNetwork::public(5)]]);

        $this->assertFalse($guard->allows('engine.example.com'));
        $this->assertFalse($guard->allows('rebind.example.com'));
    }

    public function test_an_ipv6_public_address_is_allowed_and_a_private_one_is_not(): void
    {
        $guard = $this->guard(['v6.example.com' => ['2606:4700:4700::1111'], 'v6bad.example.com' => ['fe80::1']]);

        $this->assertTrue($guard->allows('v6.example.com'));
        $this->assertFalse($guard->allows('v6bad.example.com'));
    }

    public function test_nat64_and_6to4_embedded_private_addresses_are_blocked(): void
    {
        // 64:ff9b::/96 and 2002::/16 carry a real IPv4 address; both embed the private address below.
        $guard = $this->guard([
            'nat64.example.com' => ['64:ff9b::'.$this->embedded(TestNetwork::private(5))],
            'sixto4.example.com' => ['2002:'.$this->embedded(TestNetwork::private(5)).'::'],
        ]);

        $this->assertFalse($guard->allows('nat64.example.com'));
        $this->assertFalse($guard->allows('sixto4.example.com'));
    }

    /** The two 16-bit groups that carry an IPv4 address inside an IPv6 one. */
    private function embedded(string $ipv4): string
    {
        $hex = bin2hex((string) inet_pton($ipv4));

        return ltrim(substr($hex, 0, 4), '0').':'.ltrim(substr($hex, 4), '0');
    }

    public function test_nat64_with_a_public_embedded_address_is_allowed(): void
    {
        $guard = $this->guard(['nat64.example.com' => ['64:ff9b::'.$this->embedded(TestNetwork::routable(8))]]);

        $this->assertTrue($guard->allows('nat64.example.com'));
    }

    public function test_the_engine_address_is_compared_as_an_address(): void
    {
        // The Engine resolves to the expanded spelling, the candidate to the
        // compressed one: a string compare would miss it, inet_pton does not.
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function addresses(string $host): array
            {
                return $host === 'engine.example.com'
                    ? ['2606:4700:4700:0000:0000:0000:0000:1111']
                    : ['2606:4700:4700::1111'];
            }
        });
        $guard = $this->app->make(DnsHostGuard::class);

        $this->assertFalse($guard->allows('rebind.example.com'));
    }

    public function test_validated_addresses_resolves_once(): void
    {
        $resolver = new class implements HostResolver
        {
            /** @var array<string, int> */
            public array $calls = [];

            public function addresses(string $host): array
            {
                $this->calls[$host] = ($this->calls[$host] ?? 0) + 1;

                return $host === 'engine.example.com' ? [TestNetwork::routable(34)] : [TestNetwork::routable(8)];
            }
        };
        $this->app->instance(HostResolver::class, $resolver);
        $guard = $this->app->make(DnsHostGuard::class);

        $this->assertSame([TestNetwork::routable(8)], $guard->validatedAddresses('one.example.com'));
        $this->assertSame(1, $resolver->calls['one.example.com'] ?? 0, 'The guard resolved the name more than once.');
    }

    public function test_the_host_resolver_fake_rejects_a_host_it_does_not_know(): void
    {
        // The shared fixture asserts its host argument:
        // resolving a name the test did not declare must fail the test instead of
        // silently answering and hiding an unexpected lookup.
        $this->fakeHostResolver(['known.example.com' => [TestNetwork::routable(35)]]);

        $this->expectException(\PHPUnit\Framework\AssertionFailedError::class);

        $this->app->make(HostResolver::class)->addresses('unknown.example.com');
    }
}
