<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * A project the Engine gave no IPv4 (`disable-user-ip-assign`, or a user
 * without an address and no default) gets the server's addresses from the
 * cached Engine system info, so the Set Your Domain DNS instructions keep an
 * A record. A project's own list stays as it is. The fallback reads only the
 * cache, and only the Community edition has it.
 *
 * @see Engine core/app/Http/Controllers/UserController.php:122 -> listAll
 */
class ServerIpv4FallbackTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
    }

    /**
     * @param  array<string, mixed>|null  $info
     */
    private function serverAddress(?array $info = null): void
    {
        $this->configureEngine();
        Cache::forever('host:engine-system-info:1', ['fetched_at' => time(), 'info' => $info ?? [
            'default_ipv4' => TestNetwork::public(50),
        ]]);
    }

    private function panel(bool $community): void
    {
        $this->app->instance(CommunityPanel::class, new class($community) implements CommunityPanel
        {
            public function __construct(private readonly bool $community) {}

            public function active(): bool
            {
                return $this->community;
            }
        });
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function project(array $config): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['config' => $config]),
        ]])]);
    }

    public function test_an_empty_project_list_takes_the_server_address(): void
    {
        $this->serverAddress();
        $this->project(['ip_addresses' => ['ipv4' => [], 'ipv6' => []]]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(50)])
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.details.ip_address', TestNetwork::public(50));

        $id = Application::query()->firstOrFail()->id;
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/projects/{$id}")
            ->assertOk()
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record address, host_ipv4_addresses)
            ->assertJsonPath('data.host_ipv4_addresses', [TestNetwork::public(50)])
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record address, host_ipv4_addresses)
            ->assertJsonPath('data.host_ip_address', TestNetwork::public(50));
    }

    public function test_a_missing_project_list_takes_the_server_address(): void
    {
        $this->serverAddress();
        $this->project([]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs(User::factory()->create())->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(50)]);
    }

    public function test_a_project_with_its_own_address_keeps_it(): void
    {
        $this->serverAddress();
        $this->project(['ip_addresses' => ['ipv4' => [TestNetwork::public(10)], 'ipv6' => []]]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(10)]);

        $id = Application::query()->firstOrFail()->id;
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/projects/{$id}")
            ->assertOk()
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record address, host_ipv4_addresses)
            ->assertJsonPath('data.host_ipv4_addresses', [TestNetwork::public(10)]);
    }

    public function test_without_cached_system_info_the_list_stays_empty_and_the_engine_is_not_called(): void
    {
        $this->configureEngine();
        $this->project(['ip_addresses' => ['ipv4' => [], 'ipv6' => []]]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs(User::factory()->create())->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', []);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/system/info'));
    }

    public function test_a_list_of_only_ranges_takes_the_server_address_in_both_endpoints(): void
    {
        $this->serverAddress();
        $this->project(['ip_addresses' => ['ipv4' => [TestNetwork::prefix(TestNetwork::public(0), 24)], 'ipv6' => []]]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(50)]);

        $id = Application::query()->firstOrFail()->id;
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/projects/{$id}")
            ->assertOk()
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record address, host_ipv4_addresses)
            ->assertJsonPath('data.host_ipv4_addresses', [TestNetwork::public(50)]);
    }

    public function test_the_nat_map_public_address_is_a_source(): void
    {
        $this->serverAddress(['ipv4_nat_maps' => [['public' => TestNetwork::public(60), 'private' => TestNetwork::private(60)]]]);
        $this->project(['ip_addresses' => ['ipv4' => [], 'ipv6' => []]]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs(User::factory()->create())->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(60)]);
    }

    public function test_an_invalid_cached_address_is_dropped(): void
    {
        $this->serverAddress(['default_ipv4' => 'not-an-ip', 'ipv4_nat_maps' => [['public' => TestNetwork::public(61)]]]);
        $this->project(['ip_addresses' => ['ipv4' => [], 'ipv6' => []]]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs(User::factory()->create())->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', [TestNetwork::public(61)]);
    }

    public function test_outside_the_community_edition_the_list_stays_empty(): void
    {
        $this->panel(false);
        $this->serverAddress();
        $this->project(['ip_addresses' => ['ipv4' => [], 'ipv6' => []]]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:253 (ipv4_addresses, details.ip_address)
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', []);

        $id = Application::query()->firstOrFail()->id;
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/projects/{$id}")
            ->assertOk()
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record address, host_ipv4_addresses)
            ->assertJsonPath('data.host_ipv4_addresses', []);
    }

    public function test_the_list_is_resolved_once_per_request(): void
    {
        $this->assertSame($this->app->make(ServerIpv4Addresses::class), $this->app->make(ServerIpv4Addresses::class));
    }
}
