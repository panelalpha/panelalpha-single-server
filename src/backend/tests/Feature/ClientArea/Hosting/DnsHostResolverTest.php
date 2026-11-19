<?php

namespace PanelAlpha\ClientArea\Hosting {
    /**
     * Namespaced stubs for the real resolver: PHP resolves an unqualified call
     * inside `PanelAlpha\ClientArea\Hosting` to these first, so the test
     * exercises the real DnsHostResolver without touching DNS.
     */
    function gethostbynamel(string $hostname): array|false
    {
        if (! \Tests\Feature\ClientArea\Hosting\DnsHostResolverTest::$stubbing) {
            return \gethostbynamel($hostname);
        }

        return \Tests\Feature\ClientArea\Hosting\DnsHostResolverTest::$aRecords[$hostname] ?? false;
    }

    function dns_get_record(
        string $hostname,
        int $type = DNS_ANY,
        ?array &$authoritative_name_servers = null,
        ?array &$additional_records = null,
        bool $raw = false,
    ): array|false {
        if (! \Tests\Feature\ClientArea\Hosting\DnsHostResolverTest::$stubbing) {
            return \dns_get_record($hostname, $type, $authoritative_name_servers, $additional_records, $raw);
        }

        // Record what the resolver asked for: a DNS_A request must never pass
        // as an AAAA lookup.
        \Tests\Feature\ClientArea\Hosting\DnsHostResolverTest::$recordTypes[] = $type;

        return \Tests\Feature\ClientArea\Hosting\DnsHostResolverTest::$aaaaRecords[$hostname] ?? [];
    }
}

namespace Tests\Feature\ClientArea\Hosting {

    use Illuminate\Foundation\Testing\RefreshDatabase;
    use PanelAlpha\ClientArea\Hosting\DnsHostGuard;
    use PanelAlpha\ClientArea\Hosting\DnsHostResolver;
    use PanelAlpha\ClientArea\Hosting\HostResolver;
    use Tests\Feature\ClientArea\EngineFixtures;
    use Tests\Support\TestNetwork;
    use Tests\TestCase;

    /**
     * The real resolver must return A **and** AAAA records, so the guard can
     * reject a name that only resolves to a blocked IPv6 address.
     */
    class DnsHostResolverTest extends TestCase
    {
        use EngineFixtures, RefreshDatabase;

        /** True only while this test class runs, so the stubs do not shadow DNS for other tests. */
        public static bool $stubbing = false;

        /** @var array<string, list<string>> */
        public static array $aRecords = [];

        /** @var array<string, list<array{ipv6?: string}>> */
        public static array $aaaaRecords = [];

        /** @var list<int> the `$type` values the resolver asked `dns_get_record` for. */
        public static array $recordTypes = [];

        protected function setUp(): void
        {
            parent::setUp();
            $this->configureEngine();
            self::$stubbing = true;
            self::$aRecords = [];
            self::$aaaaRecords = [];
            self::$recordTypes = [];
        }

        protected function tearDown(): void
        {
            self::$stubbing = false;
            parent::tearDown();
        }

        public function test_addresses_merges_a_and_aaaa_records(): void
        {
            self::$aRecords = ['dual.example.com' => [TestNetwork::public2(7)]];
            self::$aaaaRecords = ['dual.example.com' => [['ipv6' => '2606:4700:4700::1111']]];

            $this->assertSame(
                [TestNetwork::public2(7), '2606:4700:4700::1111'],
                (new DnsHostResolver)->addresses('dual.example.com'),
            );

            // The AAAA lookup must be requested with DNS_AAAA, not DNS_A.
            $this->assertContains(DNS_AAAA, self::$recordTypes);
        }

        public function test_the_guard_allows_a_name_that_only_has_a_public_aaaa_record(): void
        {
            self::$aaaaRecords = ['v6only.example.com' => [['ipv6' => '2606:4700:4700::1111']]];

            $this->app->instance(HostResolver::class, new DnsHostResolver);
            $guard = $this->app->make(DnsHostGuard::class);

            $this->assertTrue($guard->allows('v6only.example.com'));
        }

        public function test_the_guard_blocks_a_name_that_only_has_a_private_aaaa_record(): void
        {
            self::$aaaaRecords = ['v6bad.example.com' => [['ipv6' => 'fd00::1']]];

            $this->app->instance(HostResolver::class, new DnsHostResolver);
            $guard = $this->app->make(DnsHostGuard::class);

            $this->assertFalse($guard->allows('v6bad.example.com'));
        }
    }
}
