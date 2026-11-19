<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Hosting\DnsHostGuard;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * DnsHostGuard paths `Hosting/DnsHostGuardTest` does not reach: the address
 * helpers the probes use, an unusable resolver answer, an IPv6 zone id and an
 * Engine that is not configured or has no host in its URL.
 */
class DnsHostGuardGapsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, list<string>>  $map
     */
    private function guard(array $map = []): DnsHostGuard
    {
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

    public function test_a_host_that_resolves_to_nothing_is_refused(): void
    {
        $guard = $this->guard();

        $this->assertFalse($guard->allows('nowhere.example.com'));
    }

    public function test_addresses_of_an_empty_host_is_empty(): void
    {
        $this->assertSame([], $this->guard()->addresses('  '));
    }

    public function test_addresses_of_an_ip_literal_is_the_canonical_address(): void
    {
        $this->assertSame(['2606:4700::1'], $this->guard()->addresses('[2606:4700:0:0:0:0:0:1]'));
    }

    public function test_any_blocked_is_true_when_one_address_is_in_a_blocked_range(): void
    {
        $guard = $this->guard();

        $this->assertTrue($guard->anyBlocked([TestNetwork::public(7), TestNetwork::PRIVATE_10]));
        $this->assertFalse($guard->anyBlocked([TestNetwork::public(7), TestNetwork::public(8)]));
        $this->assertFalse($guard->anyBlocked([]));
    }

    public function test_an_ipv6_zone_id_is_dropped_from_the_address(): void
    {
        $guard = $this->guard(['zone.example.com' => ['2606:4700::1%eth0']]);

        $this->assertSame(['2606:4700::1'], $guard->validatedAddresses('zone.example.com'));
    }

    public function test_an_address_that_is_not_an_ip_is_kept_and_then_refused(): void
    {
        $guard = $this->guard(['odd.example.com' => ['not-an-ip']]);

        $this->assertSame(['not-an-ip'], $guard->addresses('odd.example.com'));
        $this->assertFalse($guard->allows('odd.example.com'));
    }

    public function test_an_engine_without_credentials_does_not_block_other_hosts(): void
    {
        $guard = $this->guard(['site.example.com' => [TestNetwork::public(9)]]);

        $this->assertTrue($guard->allows('site.example.com'));
    }

    public function test_an_engine_url_without_a_host_does_not_block_other_hosts(): void
    {
        Setting::set('engine-api-url', 'engine');
        Setting::set('engine-api-token', '1|test-token');
        $guard = $this->guard(['site.example.com' => [TestNetwork::public(9)]]);

        $this->assertTrue($guard->allows('site.example.com'));
    }

    public function test_the_engine_own_address_is_refused(): void
    {
        Setting::set('engine-api-url', 'https://engine.example.com/api');
        Setting::set('engine-api-token', '1|test-token');
        $guard = $this->guard([
            'engine.example.com' => [TestNetwork::public(5)],
            'site.example.com' => [TestNetwork::public(5)],
        ]);

        $this->assertFalse($guard->allows('site.example.com'));
    }
}
