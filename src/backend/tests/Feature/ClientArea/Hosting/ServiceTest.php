<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The one virtual service and its instance options.
 * @see packages/client-area/src/views/Services.vue:166 (GET /services)
 * @see packages/client-area/src/views/Services.vue:168 (`response.data.data`)
 * @see packages/client-area/src/mixins/InstanceActionsMixin.js:643 (GET /services/{id}/instance-options)
 * @see packages/client-area/src/mixins/InstanceActionsMixin.js:645 (`response.data.data.user_configurable_options`)
 * @see Engine core/routes/api.php:337-341 (containers)
 */
class ServiceTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    public function test_services_index_returns_the_virtual_service(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        // CA reads: packages/client-area/src/views/Services.vue:168 (response.data.data)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services')
            ->assertOk()
            ->assertJsonPath('data.0.id', VirtualService::ID)
            ->assertJsonPath('data.0.plan_name', VirtualService::PLAN_NAME)
            ->assertJsonPath('data.0.server_accounts.0.username', 'site1')
// CA reads: packages/client-area/src/views/Services.vue:170
            ->assertJsonCount(1, 'data.0.instances')
// CA reads: packages/client-area/src/views/Services.vue:170
            ->assertJsonPath('data.0.instances.0.parent_id', null)
            ->assertJsonPath('data.0.email_server_enabled', false)
// CA reads: packages/client-area/src/views/hosting/index.vue:253
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses', []);
    }

    /**
     * The service's DNS settings are the single server's own – the A record of
     * its IPv4 and the `www` CNAME, verified by the A record – so the Domains
     * page's Add Domain instructions and the nameserver card show them (the paid
     * editions answer their plan's).
     */
    public function test_the_service_carries_the_dns_records_the_domains_page_shows(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        // CA: packages/client-area/src/views/hosting/index.vue:242 (Api.get("/services"))
        // CA reads: packages/client-area/src/components/cards/HostingNameserversCard.vue:60-110 (the Domains page's DNS records), packages/client-area/src/apis/Dns.js:303-466 (verification_methods, verification_mode)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services')
            ->assertOk()
            ->assertJsonPath('data.0.dns_settings', [
                'domain_verification' => 'none',
                'valid_cname_addresses' => [],
                'verification_methods' => ['resolve_a_record'],
                'verification_mode' => 'any',
                'display_options' => ['a_records'],
            ]);
    }

    /**
     * Community has no DNS or e-mail servers, so its service and
     * project payloads keep the flags off and the privileges without
     * `hosting.manage_dns` / `hosting.manage_email` (the controller's
     * `NoServiceDnsEmail`), and the paid DNS and e-mail routes do not exist.
     */
    public function test_community_has_no_dns_or_email_servers(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/hosting/index.vue:242 (Api.get("/services"))
        // CA reads: packages/client-area/src/components/HostingPagesSidebar.vue:127-157 (dns_server_enabled, email_server_enabled, plan_settings.dns_management_enabled, the privileges)
        $service = $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            ->assertJsonPath('data.0.dns_server_enabled', false)
            ->assertJsonPath('data.0.dns_server_internal', true)
            ->assertJsonPath('data.0.dns_server_type', null)
            ->assertJsonPath('data.0.email_server_enabled', false)
            ->assertJsonPath('data.0.email_server_internal', true)
            ->assertJsonPath('data.0.email_server_type', null)
            ->assertJsonPath('data.0.plan_settings.dns_management_enabled', false)
            ->json('data.0');
        $this->assertIsArray($service);
        $this->assertNotContains('hosting.manage_dns', $service['privileges']);
        $this->assertNotContains('hosting.manage_email', $service['privileges']);

        // CA: packages/client-area/src/apis/Instances.js:232-233 (the project payload's flags)
        // CA reads: packages/client-area/src/apis/Instances.js:232-233 (service_has_dns), :261 (plan_settings)
        $project = $this->actingAs($user)->getJson('/api/projects/'.Application::query()->firstOrFail()->id)
            ->assertOk()
            ->assertJsonPath('data.service_has_dns', false)
            ->assertJsonPath('data.service_has_email', false)
            ->assertJsonPath('data.plan_settings.dns_management_enabled', false)
            ->json('data.privileges');
        $this->assertIsArray($project);
        $this->assertNotContains('hosting.manage_dns', $project);
        $this->assertNotContains('hosting.manage_email', $project);

        foreach (['/dns/zones', '/dns/record-types', '/dns/zones/1/records', '/email/domains', '/email/domains/1/accounts', '/email/domains/1/forwarders'] as $path) {
            // CA: packages/client-area/src/views/hosting/Dns.vue:426 (the paid pages, not served in Community)
            $this->actingAs($user)->getJson('/api/services/'.VirtualService::ID.$path)->assertNotFound();
        }
    }

    /**
     * Community has no DNS servers, so the project payload keeps
     * the Cloudflare page's gate off (`service_has_dns_cloudflare`,
     * `domain_has_dns_zone`, no `wordpress.manage_cloudflare`) and the
     * nameservers empty (the controller's `NoServiceDnsEmail`), and the paid
     * Cloudflare routes do not exist.
     */
    public function test_community_has_no_cloudflare_page(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        $user = User::factory()->create();
        // CA: packages/client-area/src/views/hosting/index.vue:242 (Api.get("/services"); syncs the mirror)
        $this->actingAs($user)->getJson('/api/services')->assertOk();
        $id = Application::query()->firstOrFail()->id;

        // CA: packages/client-area/src/apis/Instances.js:20 (Api.get(`/instances/${id}`), rewritten to /projects)
        // CA reads: packages/client-area/src/components/AdvancedPagesSidebar.vue:36-41 (the gate), packages/client-area/src/views/instance/advanced/Cloudflare.vue:50 (dns_nameservers)
        $project = $this->actingAs($user)->getJson("/api/projects/{$id}")
            ->assertOk()
            ->assertJsonPath('data.service_has_dns_cloudflare', false)
            ->assertJsonPath('data.domain_has_dns_zone', false)
            ->assertJsonPath('data.domain_zone', null)
            ->assertJsonPath('data.dns_nameservers', [])
            ->assertJsonPath('data.service_nameservers', [])
            ->json('data.privileges');
        $this->assertIsArray($project);
        $this->assertNotContains('wordpress.manage_cloudflare', $project);

        foreach (['security', 'browser-check', 'development-mode'] as $setting) {
            // CA: packages/client-area/src/views/instance/advanced/Cloudflare.vue:301 (the paid page, not served in Community)
            $this->actingAs($user)->getJson("/api/projects/{$id}/wordpress/cloudflare/{$setting}")->assertNotFound();
        }
        // CA: packages/client-area/src/views/instance/advanced/Cloudflare.vue:433
        $this->actingAs($user)->postJson("/api/projects/{$id}/wordpress/cloudflare/purge-cache")->assertNotFound();
    }

    public function test_server_account_detail_keys_the_ca_reads(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll (UserResource details/config)
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', [
                'details' => ['mysql_prefix' => 'site1_', 'home_dir' => '/home/site1'],
                'config' => [
                    'home_dir' => '/home/site1',
                    'mysql_prefix' => 'site1_',
                    'ip_addresses' => ['ipv4' => [TestNetwork::public(10), 'not-an-ip'], 'ipv6' => []],
                ],
            ]),
        ]])]);

        // CA: packages/client-area/src/views/hosting/index.vue:237 (details.homedir)
        // CA reads: packages/client-area/src/views/hosting/index.vue:241 (details.mysql_db_prefix)
        // CA reads: packages/client-area/src/views/hosting/index.vue:253 (details.ip_address)
        // CA reads: src/views/hosting/Databases.vue:1066 (the SSO host; a panelalpha account sends none of its own)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services')
            ->assertOk()
            ->assertJsonPath('data.0.server_accounts.0.details.homedir', '/home/site1')
            ->assertJsonPath('data.0.server_accounts.0.details.mysql_db_prefix', 'site1_')
            ->assertJsonPath('data.0.server_accounts.0.details.ip_address', TestNetwork::public(10))
            ->assertJsonPath('data.0.server_accounts.0.details.mysql_php_my_admin_sso_host', 'site1.example.com')
            // A non-IPv4 entry in the untrusted mirror value is filtered out
            //Only the real literal reaches the CA.
            ->assertJsonCount(1, 'data.0.server_accounts.0.ipv4_addresses')
            ->assertJsonPath('data.0.server_accounts.0.ipv4_addresses.0', TestNetwork::public(10));
    }

    public function test_server_account_details_fall_back_when_config_is_empty(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:121-137 -> listAll (UserCollection of UserResource details/config)
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', [
                'details' => ['home_dir' => '/srv/site1', 'mysql_prefix' => 'd1_', 'ip_address' => TestNetwork::public2(1)],
                'config' => [],
            ]),
            $this->engineProject(11, 'site2', ['details' => [], 'config' => []]),
        ]])]);

        // Same derivation as the project payload (`ServerAccountDetails`):
        // config -> details -> default.
        // CA: packages/client-area/src/views/hosting/index.vue:242 (`Api.get("/services")`; reads `server_accounts[].details.{homedir, mysql_db_prefix, ip_address}` at :233-251)
        $response = $this->actingAs(User::factory()->create())->getJson('/api/services')->assertOk();

        /** @var list<array{username: string, details: array<string, mixed>}> $accounts */
        $accounts = $response->json('data.0.server_accounts');
        $details = [];
        foreach ($accounts as $account) {
            $details[$account['username']] = $account['details'];
        }

        $this->assertSame('/srv/site1', $details['site1']['homedir']);
        $this->assertSame('d1_', $details['site1']['mysql_db_prefix']);
        $this->assertSame(TestNetwork::public2(1), $details['site1']['ip_address']);
        $this->assertSame('/home/site2', $details['site2']['homedir']);
        $this->assertSame('', $details['site2']['mysql_db_prefix']);
        $this->assertSame('', $details['site2']['ip_address']);
    }

    public function test_service_instances_report_the_staging_parent_id(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll()
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
            $this->engineProject(11, 'staging1', ['staging_of' => 'site1', 'domain' => 'staging1.example.com']),
        ]])]);

        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        // CA reads: packages/client-area/src/views/Services.vue:168-172 (service.instances[], parent_id)
        $response = $this->actingAs($user)->getJson('/api/services');
        $response->assertOk();

        /** @var list<array{domain: string|null, parent_id: int|null}> $instances */
        $instances = $response->json('data.0.instances');
        $parents = [];
        foreach ($instances as $instance) {
            $parents[(string) ($instance['domain'] ?? '')] = $instance['parent_id'];
        }

        $live = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $staging = Application::query()->where('engine_username', 'staging1')->firstOrFail();
        $this->assertSame($live->id, $staging->staging_of_id);
        $this->assertSame($live->id, $parents['staging1.example.com'] ?? null);
        // `??` treats a null value as absent, so the live row is checked by key.
        $this->assertArrayHasKey('site1.example.com', $parents);
        $this->assertNull($parents['site1.example.com']);
    }

    public function test_instance_options_returns_an_empty_stub(): void
    {
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:643 (Api.get(`/services/${serviceId}/instance-options`))
        // CA reads: packages/client-area/src/mixins/InstanceActionsMixin.js:645 (response.data.data.user_configurable_options)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services/'.VirtualService::ID.'/instance-options')
            ->assertOk()
            ->assertJson(['data' => ['user_configurable_options' => []]]);
    }

    public function test_an_unknown_service_is_404(): void
    {
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:643 (Api.get(`/services/${serviceId}/instance-options`))
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services/999/instance-options')
            ->assertNotFound();
    }

    public function test_services_require_authentication(): void
    {
        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->getJson('/api/services')->assertUnauthorized();
    }
}
