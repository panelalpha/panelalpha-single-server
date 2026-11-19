<?php

namespace Tests\Feature\ClientArea\DomainChange;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * A project whose Engine domain starts with `www.` is shown the
 * way the old panel stored it – `domain` without the prefix (old
 * `Helper::removeWwwPrefix`, packages/api/app/Lib/Helper.php:630-637, applied by
 * `ChangeDomainController.php:132` / `InstanceController.php:597`) and `url`
 * with the host the Engine serves – in every payload that shows the project
 * domain. The mirrored `applications.domain` and everything sent to the Engine
 * keep the Engine's name: a domain the CA sends back as it was shown is mapped
 * to the Engine's name before the Engine call.
 *
 * Contract:
 * - CA reads the project `domain`/`url`: packages/client-area/src/apis/Instances.js:112-113
 *   (`instanceResource`, list `:76`, show `:17`, notifications through Echo);
 *   `/home` `hosting_accounts[0].domain`: src/mixins/InstanceActionsMixin.js:601;
 *   `/services` `domain`: src/views/hosting/index.vue:280, `instances[0].domain`:
 *   src/components/dataIterator/tables/ServicesTable.vue:60, `server_accounts[].domain`:
 *   src/components/ActiveServerAccountSelector.vue:23 (compared with each other
 *   at src/components/cards/HostingNameserversCard.vue:74); the onboarding
 *   domain list: src/mixins/Onboarding/ServiceDomainsMixin.js:59.
 * - CA sends `instance.domain` back: PHP settings
 *   src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:89, SSL
 *   settings src/views/instance/advanced/Security.vue:342, installed and
 *   detected certificate src/apis/Hosting.js:30/:47, order/install from the
 *   instance src/mixins/EditSslMixin.js:24 → src/components/security/SslEditModal.vue:379/:403.
 * - Engine: the domain routes take the Engine's name (core/app/Http/Controllers/User/DomainController.php:46 list).
 */
class PresentedDomainTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const ENGINE_DOMAIN = 'www.site1.example.com';

    private const PRESENTED = 'site1.example.com';

    private function application(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', [
            'domain' => self::ENGINE_DOMAIN,
            'domain_names' => [self::ENGINE_DOMAIN],
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
        ]);
    }

    /**
     * The project's Engine domain list.
     *
     * @param  list<string>  $names
     * @return array<string, mixed>
     */
    private function domainList(array $names): array
    {
        $rows = [];
        foreach ($names as $i => $name) {
            $rows[] = ['id' => $i + 1, 'domain' => $name, 'type' => $i === 0 ? 'main' : 'addon', 'details' => ['force_https_redirect' => false]];
        }

        return ['data' => $rows];
    }

    public function test_the_project_list_and_detail_show_the_domain_without_www(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The mirror keeps the Engine's name.
        $this->assertSame(self::ENGINE_DOMAIN, $application->domain);

        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:113
            ->assertJsonPath('data.0.domain', self::PRESENTED)
            ->assertJsonPath('data.0.url', 'https://'.self::ENGINE_DOMAIN);

        // CA: packages/client-area/src/apis/Instances.js:17
        $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:112
            ->assertJsonPath('data.domain', self::PRESENTED)
            ->assertJsonPath('data.url', 'https://'.self::ENGINE_DOMAIN);

        $this->assertSame(self::ENGINE_DOMAIN, $application->fresh()?->domain);
    }

    public function test_a_notification_carries_the_domain_without_www(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The socket payload (presentSlim) and the stored copy (present) feed
        // the CA's `instanceResource` (Instances.js:112-113).
        $presenter = app(ProjectPresenter::class);
        $slim = $presenter->presentSlim($application, $user);
        $full = $presenter->present($application, $user);

        $this->assertSame(self::PRESENTED, $slim['domain']);
        $this->assertSame('https://'.self::ENGINE_DOMAIN, $slim['url']);
        $this->assertSame(self::PRESENTED, $full['domain']);
        $this->assertSame('https://'.self::ENGINE_DOMAIN, $full['url']);
    }

    public function test_home_and_services_show_the_domain_without_www(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.get('/home')`)
        $this->actingAs($user)->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/mixins/InstanceActionsMixin.js:601
            ->assertJsonPath('user.services.0.hosting_accounts.0.domain', self::PRESENTED);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/index.vue:280
            ->assertJsonPath('data.0.domain', self::PRESENTED)
            // CA reads: packages/client-area/src/components/dataIterator/tables/ServicesTable.vue:60
            ->assertJsonPath('data.0.instances.0.domain', self::PRESENTED)
            // CA reads: packages/client-area/src/components/ActiveServerAccountSelector.vue:23
            ->assertJsonPath('data.0.server_accounts.0.domain', self::PRESENTED);

        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55
        $this->actingAs($user)->getJson('/api/services/'.VirtualService::ID.'/domains?search_term=site1')
            ->assertOk()
            // CA reads: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:59
            ->assertExactJson(['data' => [['id' => $application->id, 'domain' => self::PRESENTED]]]);
    }

    public function test_the_onboarding_domain_step_answers_the_domain_without_www(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $response = $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'www.shop.example.com'])
            ->assertStatus(202);
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575
        $response->assertJsonPath('data.domain', 'shop.example.com');

        // The Engine creates the project with the requested name; the mirror keeps it.
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['domain'] === 'www.shop.example.com');
        $this->assertSame('www.shop.example.com', Application::query()->where('engine_username', 'shop')->value('domain'));
    }

    /**
     * An activity payload carries the presented (prefix-free) domain of the
     * project it names. Change Domain refuses a `www.` name since round 3
     * (t3d-8), so the value that differs from the Engine's is covered on the
     * delete action of a project the Engine holds with `www.`.
     */
    public function test_the_activity_payloads_carry_the_domain_without_www(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $id = $application->id;
        $this->fakeHostResolver();
        $this->fakePinnedProbe();

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(null, 204),
        ]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->deleteJson("/api/projects/{$id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])->assertOk();

        $log = ActivityLog::query()->latest('id')->firstOrFail();
        $this->assertSame('user.instance.delete', $log->action);
        $this->assertSame(self::PRESENTED, $log->payload['App\\Models\\Application:'.$id]['domain'] ?? null);
    }

    public function test_php_settings_sent_with_the_presented_domain_reach_the_engine_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response($this->domainList([self::ENGINE_DOMAIN])),
            // Engine: core/app/Http/Controllers/DomainController.php:98 -> php-directives
            'engine.example.com/api/domains/'.self::ENGINE_DOMAIN.'/php-directives' => Http::response(['data' => ['memory_limit' => '256M']]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:89
            ->getJson("/api/server-accounts/{$application->id}/domains/".self::PRESENTED.'/php-settings')
            ->assertOk()
            // CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:90
            ->assertJsonPath('directives.0', ['directive' => 'memory_limit', 'value' => '256M']);

        $this->actingAs($user)
            // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
            ->putJson("/api/server-accounts/{$application->id}/domains/".self::PRESENTED.'/php-settings', [
                ['directive' => 'memory_limit', 'value' => '512M', 'type' => 'text', 'options' => [], 'editing' => false],
            ])
            ->assertOk();

        // Engine: core/app/Http/Controllers/DomainController.php:128 -> setPhpDirectives
        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/'.self::ENGINE_DOMAIN.'/php-directives')
            && $request['settings'] === ['memory_limit' => '512M']);
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/domains/'.self::PRESENTED));
    }

    public function test_ssl_routes_sent_with_the_presented_domain_reach_the_engine_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $certificate = [
            'certificate' => 'CERT-TEXT',
            'common_name' => self::ENGINE_DOMAIN,
            'issuer_name' => 'R11',
            'not_before' => 1,
            'not_after' => 2,
            'domains' => [self::ENGINE_DOMAIN],
            'self_signed' => false,
            'covers_domain' => true,
        ];

        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response($this->domainList([self::ENGINE_DOMAIN])),
            // Engine: core/app/Http/Controllers/User/DomainController.php:107 -> installed-ssl-cert
            'engine.example.com/api/projects/site1/domains/'.self::ENGINE_DOMAIN.'/installed-ssl-cert' => Http::response(['data' => $certificate]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:515 -> install-ssl-cert
            'engine.example.com/api/projects/site1/domains/'.self::ENGINE_DOMAIN.'/install-ssl-cert' => Http::response(['data' => ['domain' => self::ENGINE_DOMAIN]]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert
            'engine.example.com/api/projects/site1/domains/'.self::ENGINE_DOMAIN.'/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains update
            'engine.example.com/api/projects/site1/domains/'.self::ENGINE_DOMAIN => Http::response(['data' => ['domain' => self::ENGINE_DOMAIN]]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=".self::PRESENTED)
            ->assertOk()
            // CA reads: packages/client-area/src/views/hosting/Domains.vue:181
            ->assertJsonPath('data.issuer_name', 'R11');

        $this->actingAs($user)
            // CA: packages/client-area/src/views/instance/advanced/Security.vue:342
            ->putJson("/api/server-accounts/{$application->id}/ssl/settings/".self::PRESENTED, ['force_https_redirect' => true])
            ->assertOk()
            // CA reads: packages/client-area/src/views/instance/advanced/Security.vue:348
            ->assertJsonPath('data.certificate_installed', true);

        $this->actingAs($user)
            // CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", ['domain' => self::PRESENTED, 'provider_id' => 1])
            ->assertOk();

        $this->actingAs($user)
            // CA: packages/client-area/src/components/security/SslEditModal.vue:403
            ->putJson("/api/server-accounts/{$application->id}/ssl/certificates/install", [
                'domain' => self::PRESENTED,
                'certificate_id' => null,
                'certificate' => 'CERT',
                'key' => 'KEY',
                'cabundle' => 'CA',
            ])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/'.self::ENGINE_DOMAIN)
            && $request['force_https_redirect'] === true);
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/'.self::ENGINE_DOMAIN.'/request-ssl-cert'));
        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/'.self::ENGINE_DOMAIN.'/install-ssl-cert'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/domains/'.self::PRESENTED));
    }

    public function test_an_engine_domain_of_exactly_the_sent_name_wins(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The project also has an addon of exactly the presented name, so the
        // CA's domain list row for that addon keeps its own name.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response($this->domainList([self::ENGINE_DOMAIN, self::PRESENTED])),
            // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert
            'engine.example.com/api/projects/site1/domains/'.self::PRESENTED.'/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", ['domain' => self::PRESENTED, 'provider_id' => 1])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/'.self::PRESENTED.'/request-ssl-cert'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/domains/'.self::ENGINE_DOMAIN.'/'));
    }

    public function test_a_domain_without_www_keeps_its_name_and_costs_no_domain_read(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", ['domain' => 'site1.example.com', 'provider_id' => 1])
            ->assertOk();

        // No extra `GET domains` for a project whose domain has no `www.`.
        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/projects/site1/domains'));
    }

    public function test_the_detected_certificate_reads_the_engine_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            'engine.example.com/api/projects/site1/domains/'.self::ENGINE_DOMAIN.'/ssl-check' => Http::response(['data' => $this->engineSslCheck(self::ENGINE_DOMAIN)]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response($this->domainList([self::ENGINE_DOMAIN])),
        ]);

        $this->actingAs($user)
            // CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=".self::PRESENTED)
            ->assertOk()
            // CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:131
            ->assertJsonPath('data.issuer_name', "Let's Encrypt")
            ->assertJsonPath('data.status', 'trusted');
    }
}
