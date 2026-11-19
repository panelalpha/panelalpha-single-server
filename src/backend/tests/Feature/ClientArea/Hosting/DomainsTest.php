<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Events\SslCertificateInstalled;
use PanelAlpha\ClientArea\Hosting\ComposedPrimaryDomainSwitch;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\EngineSyncState;
use PanelAlpha\ClientArea\Support\EngineText;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Domains, SSL, PHP version/settings and usage.
 * @see packages/client-area/src/mixins/DomainsActionsMixin.js:269, apis/Hosting.js:30 – the CA call sites
 * @see Engine core/routes/api.php:163-173 (domains, ssl certificates)
 */
class DomainsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        // The project's own public IP the pinned probes must use
        // (Engine UserResource `config.ip_addresses.ipv4`).
        return $this->syncedApplication($user, 'site1', [
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
        ]);
    }

    public function test_domains_list_flattens_details_and_reports_meta(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => [
                'document_root' => '/site1.example.com/public_html',
                'redirect_enabled' => false,
                'redirect_url' => null,
                'force_https_redirect' => true,
                'aliases' => ['www.site1.example.com'],
            ], 'created_at' => null, 'updated_at' => null],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Domains.vue:413
            ->getJson("/api/server-accounts/{$application->id}/domains")
            ->assertOk()
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:64
            ->assertJsonPath('data.0.domain', 'site1.example.com')
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:154
            ->assertJsonPath('data.0.document_root', '/site1.example.com/public_html')
// force_https_redirect: the committed Client Area does not read it from the domains list.
// aliases: the committed Client Area does not read the domain-list aliases from this response.
// CA reads: packages/client-area/src/views/hosting/Domains.vue:481
            ->assertJsonPath('meta.domain_types.0', 'addon');
    }

    public function test_domain_capabilities_follow_the_old_type_rules(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old DomainResource::getCapabilities() over the Plesk driver
        // (packages/api/app/Http/Resources/User/ServerAccount/DomainResource.php:64-81,
        // AbstractDomains.php:102-132): primary only main/addon, SSL never alias,
        // docroot/redirect all four types. CA reads them at
        // components/dataIterator/tables/HostingDomainsTable.vue:160,187,212.
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => []],
            ['id' => 3, 'domain' => 'blog.site1.example.com', 'type' => 'sub', 'details' => []],
            ['id' => 4, 'domain' => 'alias.example.com', 'type' => 'alias', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Domains.vue:413
            ->getJson("/api/server-accounts/{$application->id}/domains")
            ->assertOk()
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:160
            ->assertJsonPath('data.0.capabilities.can_set_as_primary', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:187
            ->assertJsonPath('data.0.capabilities.can_manage_ssl', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.0.capabilities.can_update_document_root', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.0.capabilities.can_redirect', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:160
            ->assertJsonPath('data.1.capabilities.can_set_as_primary', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:187
            ->assertJsonPath('data.1.capabilities.can_manage_ssl', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:160
            ->assertJsonPath('data.2.capabilities.can_set_as_primary', false)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:187
            ->assertJsonPath('data.2.capabilities.can_manage_ssl', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.2.capabilities.can_update_document_root', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.2.capabilities.can_redirect', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:160
            ->assertJsonPath('data.3.capabilities.can_set_as_primary', false)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:187
            ->assertJsonPath('data.3.capabilities.can_manage_ssl', false)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.3.capabilities.can_update_document_root', true)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:212
            ->assertJsonPath('data.3.capabilities.can_redirect', true);
    }

    public function test_create_update_delete_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains store/update/destroy
        Http::fake(['engine.example.com/api/projects/site1/domains*' => Http::response(['data' => ['id' => 1]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", ['domain' => 'shop.example.com', 'type' => 'addon'])
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->assertJson(['success' => true]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:390
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com", ['document_root' => '/shop.example.com/public_html'])
            ->assertOk();

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->deleteJson("/api/server-accounts/{$application->id}/domains/shop.example.com")
            ->assertOk();
    }

    public function test_an_enabled_redirect_needs_a_url_the_engine_would_refuse(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
        Http::fake(['engine.example.com/*' => Http::response(['data' => ['id' => 1]])]);

        foreach (['', null] as $url) {
            $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:390
                ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com", [
                    'document_root' => '/shop.example.com/public_html',
                    'redirect_enabled' => true,
                    'redirect_url' => $url,
                ])
                ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Api.js:78
                ->assertJsonPath('errors.redirect_url.0', 'Enter the URL to redirect the domain to.');
        }

        Http::assertNotSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/domains/shop.example.com'));

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:390
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com", [
                'redirect_enabled' => false,
                'redirect_url' => '',
            ])
            ->assertOk();

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:390
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com", [
                'redirect_enabled' => true,
                'redirect_url' => 'https://go.example.com',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/domains/shop.example.com')
            && $request['redirect_url'] === 'https://go.example.com');
    }

    public function test_an_addon_domain_is_created_with_its_www_alias(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains store
        Http::fake(['engine.example.com/api/projects/site1/domains*' => Http::response(['data' => ['id' => 1]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", ['domain' => 'shop.example.com', 'type' => 'addon'])
            ->assertOk();

        // The Engine adds a `www` alias to a main domain only, so the panel adds
        // this one itself (the Engine's `POST E:/domains` takes it, openapi-2.3.0).
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/domains')
            && $request['domain'] === 'shop.example.com'
            && $request['aliases'] === ['www.shop.example.com']);

        // A subdomain and a name the Engine itself normalizes get none.
        foreach ([['domain' => 'blog.site1.example.com', 'type' => 'sub'], ['domain' => 'www.pretty.example.com', 'type' => 'addon']] as $body) {
            $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
                ->postJson("/api/server-accounts/{$application->id}/domains", $body)
                ->assertOk();

            Http::assertSent(fn ($request): bool => $request->method() === 'POST'
                && str_ends_with($request->url(), '/projects/site1/domains')
                && $request['domain'] === $body['domain']
                && ! isset($request['aliases']));
        }
    }

    public function test_the_main_domain_cannot_be_deleted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): the main-domain guard answers 422
        // before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->deleteJson("/api/server-accounts/{$application->id}/domains/site1.example.com")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->assertJsonPath('errors.0.0', 'Cannot delete main domain');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/domains/site1.example.com'));
    }

    public function test_an_addon_domain_is_still_deleted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains destroy
        Http::fake(['engine.example.com/api/projects/site1/domains/shop.example.com' => Http::response(['data' => ['id' => 1]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->deleteJson("/api/server-accounts/{$application->id}/domains/shop.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE' && str_ends_with($request->url(), '/domains/shop.example.com'));
    }

    public function test_create_domain_validates_type_and_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", ['domain' => 'not a domain', 'type' => 'weird'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->assertJsonValidationErrors(['domain', 'type']);
    }

    public function test_ssl_install_and_order(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:515 -> install-ssl-cert; :524 -> request-ssl-cert
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/install-ssl-cert' => Http::response(['data' => ['domain' => 'site1.example.com']]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:403
            ->putJson("/api/server-accounts/{$application->id}/ssl/certificates/install", [
                'domain' => 'site1.example.com',
                // The CA always sends the selected provider id, `null` for a
                // custom certificate (SslEditModal.vue:398-404).
                'certificate_id' => null,
                'certificate' => 'CERT',
                'key' => 'KEY',
                'cabundle' => 'CA',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request['cert'] === 'CERT' && $request['key'] === 'KEY' && $request['ca'] === 'CA');

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", [
                'domain' => 'site1.example.com',
                // The CA sends the chosen provider (SslEditModal.vue:363-366).
                'provider_id' => 1,
            ])
            ->assertOk();

        // Engine: core/routes/api.php:172-173 (PUT install-ssl-cert, POST request-ssl-cert)
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/request-ssl-cert'));
    }

    /**
     * A certificate the Engine refuses under a shared zone reads the panel's own
     * sentence, without the Engine's `shared_zone_issuance` setting name.
     */
    public function test_a_certificate_refused_under_a_shared_zone_reads_the_panels_sentence(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:511-516 (422, message only; Lib/Ssl/SharedZones.php:96-100)
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response([
                'message' => 'Could not obtain a certificate for site1.example.com: site1.example.com is under example.com, a zone every engine in the fleet issues under and shares one 50-certificate weekly limit on. Set shared_zone_issuance to obtain one anyway, or give the project a domain you own.',
            ], 422),
        ]);

        $response = $this->actingAs($user)
        // CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", [
                'domain' => 'site1.example.com',
                'provider_id' => 1,
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/components/security/SslEditModal.vue:394 (the order call's error reaches the toast)
            ->assertJsonPath('message', EngineText::SHARED_ZONE_REFUSED);

        $this->assertStringNotContainsString('shared_zone_issuance', $response->getContent());
    }

    public function test_ssl_retry_requests_the_certificate_again(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:446 -> request-ssl-cert
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:430
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/retry", ['domain' => 'site1.example.com'])
            ->assertOk();

        // The retry re-requests the same Let's Encrypt certificate.
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/request-ssl-cert'));
    }

    public function test_the_ssl_event_names_its_broadcast_and_carries_the_project(): void
    {
        $event = new SslCertificateInstalled('user.abc123', ['id' => 5, 'domain' => 'site1.example.com']);

        $this->assertSame('App\\Events\\SslCertificateInstalled', $event->broadcastAs());
        $this->assertSame('private-user.abc123', $event->broadcastOn()->name);
        $this->assertSame(['application' => ['id' => 5, 'domain' => 'site1.example.com']], $event->broadcastWith());
    }

    public function test_installing_a_certificate_tells_the_open_pages_of_the_project(): void
    {
        Event::fake([SslCertificateInstalled::class]);
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:515 -> install-ssl-cert
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/install-ssl-cert' => Http::response(['data' => ['domain' => 'site1.example.com']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:403
            ->putJson("/api/server-accounts/{$application->id}/ssl/certificates/install", [
                'domain' => 'site1.example.com',
                'certificate_id' => null,
                'certificate' => 'CERT',
                'key' => 'KEY',
                'cabundle' => 'CA',
            ])
            ->assertOk();

        Event::assertDispatched(SslCertificateInstalled::class, fn (SslCertificateInstalled $e): bool => $e->application['id'] === $application->id
            && $e->application['domain'] === 'site1.example.com'
            && $e->channel === $user->receivesBroadcastNotificationsOn());
    }

    public function test_an_order_the_engine_issued_at_once_tells_the_open_pages_of_the_project(): void
    {
        Event::fake([SslCertificateInstalled::class]);
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert, which issues the certificate in the call
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:107 -> installedSslCert
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'common_name' => 'site1.example.com',
                'issuer_name' => 'R11',
                'self_signed' => false,
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:363
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", [
                'domain' => 'site1.example.com',
                'provider_id' => 1,
            ])
            ->assertOk();

        Event::assertDispatched(SslCertificateInstalled::class, fn (SslCertificateInstalled $e): bool => $e->application['id'] === $application->id);
    }

    public function test_an_order_that_has_not_installed_a_certificate_yet_is_not_broadcast(): void
    {
        Event::fake([SslCertificateInstalled::class]);
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: request-ssl-cert queues the issuance; there is no certificate on the domain yet
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:524 -> request-ssl-cert
            'engine.example.com/api/projects/site1/domains/site1.example.com/request-ssl-cert' => Http::response(['data' => ['status' => 'requested']]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:107 -> installedSslCert (404 when the domain has none)
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['message' => 'No certificate.'], 404),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:379
            ->postJson("/api/server-accounts/{$application->id}/ssl/certificates/order", [
                'domain' => 'site1.example.com',
                'provider_id' => 1,
            ])
            ->assertOk();

        Event::assertNotDispatched(SslCertificateInstalled::class);
    }

    public function test_set_ssl_settings_updates_the_https_redirect(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list; :107 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            // First GET domains checks membership, the second returns the
            // setting the write just changed (the controller re-reads).
            'engine.example.com/api/projects/site1/domains' => Http::sequence()
                ->push(['data' => [
                    ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => ['force_https_redirect' => false]],
                ]])
                ->push(['data' => [
                    ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => ['force_https_redirect' => true]],
                ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'R11',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => false,
                'covers_domain' => true,
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com' => Http::response(['data' => ['domain' => 'site1.example.com']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:342
            ->putJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com", ['force_https_redirect' => true])
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:348
            ->assertJsonPath('data.force_https_redirect', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:348
            ->assertJsonPath('data.certificate_installed', true);

        // Engine: core/app/Http/Requests/DomainUpdateRequest.php:29 -> force_https_redirect boolean
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/site1.example.com')
            && $request['force_https_redirect'] === true);
    }

    public function test_php_version_get_set_and_available_versions(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // PHP version/directives are Engine routes keyed by domain name, not
        // project-scoped (Engine: core/routes/api.php:412-415); the panel first
        // confirms the domain belongs to the project.
        // Engine: core/app/Http/Controllers/DomainController.php:48 -> php-version; :106 -> php-directives; core/app/Http/Controllers/PhpController.php:22 -> available-versions
        Http::fake([
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
            ]]),
            'engine.example.com/api/domains/site1.example.com/php-version' => Http::response(['data' => '8.2']),
            'engine.example.com/api/php/available-versions' => Http::response(['data' => ['8.1', '8.2', '8.3']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:442
            ->getJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-version")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:444
            ->assertJson(['data' => '8.2']);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:460
            ->getJson("/api/server-accounts/{$application->id}/php-versions")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings.vue:461
            ->assertJsonPath('data.2', '8.3');

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpVersionModal.vue:114
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-version", ['php_version' => '8.3'])
            ->assertOk();
    }

    public function test_php_version_rejects_a_domain_of_another_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list

        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpVersionModal.vue:114
            ->putJson("/api/server-accounts/{$application->id}/domains/foreign.example.com/php-version", ['php_version' => '8.3'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpVersionModal.vue:114
            ->assertJsonValidationErrors('domain');

        // The global, non-project-scoped Engine route was never called.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/api/domains/'));
    }

    public function test_php_settings_map_to_the_ca_directive_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/DomainController.php:98 -> php-directives
        Http::fake([
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
            ]]),
            'engine.example.com/api/domains/site1.example.com/php-directives' => Http::response(['data' => ['memory_limit' => '256M']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:89
            ->getJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:87
            ->assertJsonPath('suggested_directives.0', ['directive' => 'memory_limit', 'type' => 'text'])
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:90
            ->assertJsonPath('directives.1', ['directive' => 'upload_max_filesize', 'value' => ''])
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:92
            ->assertJsonPath('modifiable_directives_list', true)
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:90
            ->assertJsonPath('directives.0', ['directive' => 'memory_limit', 'value' => '256M'])
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:94
            ->assertJsonPath('custom_directives', true)
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:90
            ->assertJsonPath('configurable', true);

        // The CA posts its whole `phpSettings` list of rows
        // (PhpSettingsModal.vue:319-320).
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'memory_limit', 'value' => '512M', 'type' => 'text', 'options' => [], 'editing' => false],
            ])
            ->assertOk();

        // Engine: core/app/Http/Controllers/DomainController.php:128 -> setPhpDirectives,
        // core/app/Http/Requests/DomainReplacePhpDirectivesRequest.php -> {settings: map}
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/site1.example.com/php-directives')
            && $request['settings'] === ['memory_limit' => '512M']);
    }

    public function test_php_settings_list_the_guide_settings_and_skip_the_ones_left_empty(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/DomainController.php:98 -> php-directives,
        // a domain that sets nothing answers {}.
        Http::fake([
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
            ]]),
            'engine.example.com/api/domains/site1.example.com/php-directives' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:89
            ->getJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:87
            ->assertJsonPath('suggested_directives.0', ['directive' => 'memory_limit', 'type' => 'text'])
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:90
            ->assertJsonPath('directives', [
                ['directive' => 'memory_limit', 'value' => ''],
                ['directive' => 'upload_max_filesize', 'value' => ''],
                ['directive' => 'post_max_size', 'value' => ''],
                ['directive' => 'max_execution_time', 'value' => ''],
            ]);

        // The dialog posts its whole table; a row the user left empty is a
        // suggestion, not a directive to write.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'memory_limit', 'value' => '', 'type' => 'text', 'options' => [], 'editing' => false],
                ['directive' => 'upload_max_filesize', 'value' => '', 'type' => 'text', 'options' => [], 'editing' => false],
                ['directive' => 'post_max_size', 'value' => '', 'type' => 'text', 'options' => [], 'editing' => false],
                ['directive' => 'max_execution_time', 'value' => '300', 'type' => 'text', 'options' => [], 'editing' => true],
            ])
            ->assertOk();

        // Engine: core/app/Http/Controllers/DomainController.php:128 -> setPhpDirectives
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/site1.example.com/php-directives')
            && $request['settings'] === ['max_execution_time' => '300']);
    }

    public function test_php_settings_clearing_a_value_removes_the_directive_from_the_replaced_map(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/DomainController.php:98 -> php-directives,
        // a domain that sets two directives.
        Http::fake([
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
            ]]),
            'engine.example.com/api/domains/site1.example.com/php-directives' => Http::response(['data' => [
                'post_max_size' => '64M',
                'max_execution_time' => '120',
            ]]),
        ]);

        // Clearing a value leaves the directive out of the map. The Engine replaces
        // the whole set (`Php::replaceDomainDirectives`), so the project stops
        // setting it and the server's PHP configuration applies again.
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'post_max_size', 'value' => '', 'type' => 'text', 'options' => [], 'editing' => true],
                ['directive' => 'max_execution_time', 'value' => '300', 'type' => 'text', 'options' => [], 'editing' => true],
            ])
            ->assertOk();

        // Engine: core/app/Http/Controllers/DomainController.php:128 -> setPhpDirectives
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/site1.example.com/php-directives')
            && $request['settings'] === ['max_execution_time' => '300']);
    }

    public function test_php_settings_reject_a_directive_outside_the_panel_whitelist(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'not_a_php_directive', 'value' => '1'],
            ])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
            ->assertJsonPath('errors.0.0', 'Invalid PHP directive: not_a_php_directive.');

        // The Engine never sees a directive the panel does not know
        // (old `array_keys(ini_get_all(null, false))`).
        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/php-directives'));
    }

    public function test_php_settings_reject_a_value_with_a_line_break_in_the_panel_words(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        // The guide quotes the message the panel answers for a value with a line break (cron-and-php.md,
        // Troubleshooting): the CA shows the first message of the `errors` bag, so the rule carries the words.
        // The key is the row of the posted list (`0.value`), which dot-notation cannot address unescaped.
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
        $response = $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'memory_limit', 'value' => "1\n2"],
            ])
            ->assertStatus(422);

        $this->assertSame(['Invalid directive value.'], $response->json('errors')['0.value'] ?? null);

        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/php-directives'));
    }

    /**
     * A container (dind) project runs PHP from its own image, so
     * the Engine refuses the domain PHP version/directives with 422
     * (`DomainPhpVersion::ensurePhpHosting`, `Php::requirePhpHosting`). v1 answers
     * the same 422 before any Engine call; the read used to show settings.
     */
    private function container(Application $application): Application
    {
        $application->update(['engine_payload' => array_merge($application->engine_payload ?? [], [
            'details' => ['template' => 'dind'],
        ])]);

        return $application->fresh();
    }

    public function test_php_version_change_is_refused_on_a_container_project_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->container($this->application($user));

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpVersionModal.vue:114
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-version", ['php_version' => '8.3'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Api.js:80 (the modal shows the error)
            ->assertJsonPath('errors.version.0', 'The PHP version applies only to PHP hosting projects. A dind project runs PHP from its own image; set it there.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/php-version'));
    }

    public function test_php_settings_read_is_refused_on_a_container_project_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->container($this->application($user));

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:89
            ->getJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings")
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsCard.vue:103 (the card alerts and disables Manage)
            ->assertJsonPath('errors.project.0', 'Custom PHP INI settings apply only to PHP hosting projects. A dind project runs PHP from its own image; set php.ini there.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/php-directives'));
    }

    public function test_php_settings_write_is_refused_on_a_container_project_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->container($this->application($user));

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
            ->putJson("/api/server-accounts/{$application->id}/domains/site1.example.com/php-settings", [
                ['directive' => 'memory_limit', 'value' => '512M'],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Api.js:80 (the modal shows the error)
            ->assertJsonPath('errors.project.0', 'Custom PHP INI settings apply only to PHP hosting projects. A dind project runs PHP from its own image; set php.ini there.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/php-directives'));
    }

    public function test_installed_ssl_certificate_is_presented_in_the_old_six_key_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA reads `self_signed`, `name_match` (apis/Hosting.js:25-39,
        // views/hosting/Domains.vue:507); the old getInstalledCertificate
        // returned exactly six keys (ServerAccount/SslController.php:60-83).
        // The domain must be one of the project's (old `findDomain`).
        // Engine: core/routes/api.php:166 -> DomainController::installedSslCert -> SslCertificateResource
        // (core/app/System/Project/Domain.php:285-305: certificate, common_name, issuer_name,
        // domains, covers_domain, self_signed).
        // Engine: core/app/Http/Controllers/User/DomainController.php:106 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'cabundle' => 'CA',
                'common_name' => 'site1.example.com',
                'issuer_name' => "Let's Encrypt",
                'issuer_common_name' => 'R11',
                'not_before' => 1700000000,
                'not_after' => 1800000000,
                'domains' => ['site1.example.com', 'www.site1.example.com'],
                'self_signed' => false,
                'covers_domain' => true,
            ]]),
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
        ]);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1.example.com")
            ->assertOk();

        // The old six keys first, then the Engine's validity verdict.
        $this->assertSame(
            ['id', 'issuer_name', 'not_before', 'not_after', 'self_signed', 'name_match', 'status', 'valid', 'chain_trusted', 'expires_at', 'days_remaining'],
            array_keys($response->json('data')),
        );
// CA: packages/client-area/src/views/hosting/Domains.vue:510
        $this->assertSame('', $response->json('data.id'));
// CA: packages/client-area/src/views/hosting/Domains.vue:181
        $this->assertSame("Let's Encrypt", $response->json('data.issuer_name'));
// CA: packages/client-area/src/views/hosting/Domains.vue:510
        $this->assertSame(1700000000, $response->json('data.not_before'));
// CA: packages/client-area/src/views/hosting/Domains.vue:510
        $this->assertSame(1800000000, $response->json('data.not_after'));
// CA: packages/client-area/src/views/hosting/Domains.vue:179
        $this->assertFalse($response->json('data.self_signed'));
// CA: packages/client-area/src/views/hosting/Domains.vue:188
        $this->assertTrue($response->json('data.name_match'));
    }

    public function test_installed_ssl_certificate_keeps_the_raw_issuer_for_a_self_signed_cert(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The installed route never applied the old 'Self Signed' label
        // (ServerAccount/SslController.php:60-83); the raw issuer is kept.
        // Engine: core/app/Http/Controllers/User/DomainController.php:106 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'site1.example.com',
                'issuer_common_name' => 'site1.example.com',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => true,
                'covers_domain' => true,
            ]]),
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Domains.vue:179
            ->assertJsonPath('data.self_signed', true)
// CA reads: packages/client-area/src/views/hosting/Domains.vue:181
            ->assertJsonPath('data.issuer_name', 'site1.example.com');
    }

    public function test_installed_ssl_certificate_rejects_a_foreign_domain_with_the_old_422(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old `getInstalledCertificate` threw the verbatim 'Invalid domain' on
        // key 0 (ServerAccount/SslController.php:58-62,
        // resources/lang/en/api/custom_validation.php:15).
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=foreign.example.com")
            ->assertStatus(422)
// CA reads: packages/client-area/src/components/security/SslEditModal.vue:338
            ->assertJsonPath('errors.0.0', 'Invalid domain');
    }

    public function test_ssl_settings_labels_a_self_signed_certificate(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old showDomainSettings overwrote the issuer with the translated
        // 'Self Signed' when the certificate was self-signed
        // (ServerAccount/SslController.php:339-341,
        // resources/lang/en/api/general.php:12).
        // Engine: core/app/Http/Controllers/User/DomainController.php:106 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'site1.example.com',
                'issuer_common_name' => 'site1.example.com',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => true,
                'covers_domain' => true,
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.certificate.self_signed', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.certificate.issuer_name', 'Self Signed');
    }

    public function test_ssl_settings_answers_404_for_a_foreign_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old `whereHas('domains')->findOrFail` answered 404
        // (ServerAccount/SslController.php:314-320).
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/foreign.example.com")
            ->assertNotFound();
    }

    public function test_set_ssl_settings_answers_404_for_a_foreign_domain_before_any_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Mutating SSL routes check membership before any Engine write (old
        // `whereHas()->findOrFail`, ServerAccount/SslController.php:314-320).
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:342
            ->putJson("/api/server-accounts/{$application->id}/ssl/settings/foreign.example.com", ['force_https_redirect' => true])
            ->assertStatus(404);

        Http::assertNotSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/domains/'));
    }

    public function test_ssl_settings_presents_the_certificate_and_the_shared_instances(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old showDomainSettings returned the same certificate object plus
        // the applications on the account sharing the domain
        // (ServerAccount/SslController.php:318-342); CA reads
        // `sslInfo.domain_shared_instances` at views/instance/advanced/Security.vue:371.
        $other = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'site1-copy',
            'domain' => 'site1.example.com',
            'name' => 'Shared site',
            'status' => 'active',
        ]);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list; :107 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => ['force_https_redirect' => true]],
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'R11',
                'issuer_common_name' => 'R11',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => false,
                'covers_domain' => true,
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.certificate_installed', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.can_https_redirect', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.force_https_redirect', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.certificate.name_match', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.certificate.certificate_text', 'CERT-TEXT')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.0.id', $application->id)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.1.id', $other->id)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.1.name', 'Shared site')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.1.url', 'https://site1.example.com');
    }

    public function test_ssl_settings_shared_instances_exclude_projects_on_another_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old showDomainSettings listed the account's applications on the
        // same domain only (ServerAccount/SslController.php:318-327): a
        // same-user project on another domain must not leak into
        // `domain_shared_instances`.
        Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'site2',
            'domain' => 'site2.example.com',
            'name' => 'Other site',
            'status' => 'active',
        ]);

        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            // Engine: core/app/Http/Resources/DomainResource.php:13-33 -> {id, domain, type, details}
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/System/Project/Domain.php:313-332 -> certificate, common_name, issuer_name, domains, covers_domain, self_signed
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'R11',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => false,
                'covers_domain' => true,
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonCount(1, 'data.domain_shared_instances')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.0.id', $application->id);
    }

    public function test_ssl_settings_excludes_shared_instances_from_another_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A same-domain project on another Engine is a different hosting
        // account and must not leak into this account's list (old filtered by
        // server_account_id, ServerAccount/SslController.php:318-327).
        Application::query()->create([
            'engine_id' => 2,
            'engine_username' => 'other-engine',
            'domain' => 'site1.example.com',
            'name' => 'Other engine',
            'status' => 'active',
        ]);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list; :107 -> installed-ssl-cert
        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/*/domains/*/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => [
                'certificate' => 'CERT-TEXT',
                'common_name' => 'site1.example.com',
                'issuer_name' => 'R11',
                'not_before' => 1,
                'not_after' => 2,
                'domains' => ['site1.example.com'],
                'self_signed' => false,
                'covers_domain' => true,
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonCount(1, 'data.domain_shared_instances')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:316
            ->assertJsonPath('data.domain_shared_instances.0.id', $application->id);
    }

    public function test_ssl_settings_reads_the_mirror_without_syncing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Security page polls this route; visibility is the mirror read
        // `forUser($user, refresh: false)` – never an inline sync, or every
        // poll would block on GET /projects/all.
        Cache::flush();
        $this->rememberNoSelfProject();
        EngineSyncState::query()->delete();

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list; :120 -> SSL certificate not found
        Http::fake([
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['message' => 'SSL certificate not found'], 404),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/projects/all'));
    }

    public function test_usage_maps_the_engine_summary_to_the_ca_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Bare JSON from the Engine (core/routes/api.php:157) in the shape
        // Lib/Usage/ProjectUsage::summary() returns: `storage.usage.maximum`
        // are **MB** (ProjectUsage.php:44-46 -> FileManager::diskUsage()
        // `du -sm`; User::getDiskSpaceLimit() MB, -1 = unlimited). The CA reads
        // `disk_usage` in **bytes** with null for unlimited
        // (Summary.vue:157; old PanelAlpha/Account.php:385-391).
        // Engine: core/app/Http/Controllers/User/UsageController.php:33 -> getUsage
        Http::fake(['engine.example.com/api/projects/site1/usage' => Http::response([
            'storage' => ['usage' => 123, 'maximum' => 10240],
            'logs' => ['usage' => 0, 'maximum' => null],
            'bandwidth' => ['usage' => 123, 'maximum' => null],
            'addon_domains' => ['usage' => 1, 'maximum' => null],
            'subdomains' => ['usage' => 2, 'maximum' => null],
            'ftp_accounts' => ['usage' => 3, 'maximum' => null],
            'sftp_accounts' => ['usage' => 0, 'maximum' => null],
            'mysql_databases' => ['usage' => 1, 'maximum' => 5],
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Summary.vue:320
            ->getJson("/api/server-accounts/{$application->id}/usage")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.disk_usage.usage', 123 * 1024 * 1024)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.disk_usage.maximum', 10240 * 1024 * 1024)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.bandwidth.usage', 123)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.ftp_accounts.usage', 3)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.mysql_databases.maximum', 5)
            // Metrics the Engine has none of are placeholders, not missing keys.
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.aliases.usage', 0)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.aliases.maximum', null)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.email_accounts.usage', 0)
// instances: the committed Client Area does not read usage.instances from the usage summary.
            // Engine-only keys are dropped.
            ->assertJsonMissingPath('data.storage')
            ->assertJsonMissingPath('data.logs')
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.bandwidth', true)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.ftp_accounts', true)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.mysql_databases', true)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.aliases', false)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.email_accounts', false)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('supported_metrics.email_storage', false);
    }

    public function test_unlimited_storage_is_null_in_bytes(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine `-1` = unlimited (User::getRealFtpAccountQuota()); the CA reads
        // null (old PanelAlpha/Account.php:389-391).
        // Engine: core/app/Http/Controllers/User/UsageController.php:33 -> getUsage
        Http::fake(['engine.example.com/api/projects/site1/usage' => Http::response([
            'storage' => ['usage' => 5, 'maximum' => -1],
            'bandwidth' => ['usage' => 0, 'maximum' => null],
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Summary.vue:320
            ->getJson("/api/server-accounts/{$application->id}/usage")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.disk_usage.usage', 5 * 1024 * 1024)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.disk_usage.maximum', null)
// CA reads: packages/client-area/src/views/hosting/Summary.vue:321
            ->assertJsonPath('data.bandwidth.maximum', null);
    }

    /**
     * Engine 2.2.0 answers every unlimited `maximum` as -1 (bandwidth was
     * -1048576 before it); null means the limit was never set. The CA shows `∞`
     * only for a null maximum (Summary.vue:321 → `usage.*.maximum`).
     *
     * @return array<string, array{mixed, int|null, int|null}>
     */
    public static function engineLimits(): array
    {
        return [
            'unlimited (-1, Engine 2.2.0)' => [-1, null, null],
            'unlimited bandwidth before 2.2.0' => [-1048576, null, null],
            'never set (null)' => [null, null, null],
            'a real limit' => [7, 7 * 1024 * 1024, 7],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('engineLimits')]
    public function test_every_negative_engine_maximum_is_unlimited(mixed $engine, ?int $diskBytes, ?int $other): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Lib/Usage/ProjectUsage.php:44 -> summary (every maximum -1 when unlimited on 2.2.0)
        Http::fake(['engine.example.com/api/projects/site1/usage' => Http::response([
            'storage' => ['usage' => 5, 'maximum' => $engine],
            'logs' => ['usage' => 0, 'maximum' => null],
            'bandwidth' => ['usage' => 0, 'maximum' => $engine],
            'addon_domains' => ['usage' => 1, 'maximum' => $engine],
            'subdomains' => ['usage' => 2, 'maximum' => $engine],
            'ftp_accounts' => ['usage' => 3, 'maximum' => $engine],
            'sftp_accounts' => ['usage' => 0, 'maximum' => $engine],
            'mysql_databases' => ['usage' => 1, 'maximum' => $engine],
        ])]);

        $data = $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Summary.vue:320
            ->getJson("/api/server-accounts/{$application->id}/usage")
            ->assertOk()
            ->json('data');

        // CA reads: packages/client-area/src/views/hosting/Summary.vue:321 (usage.*.maximum)
        $this->assertSame($diskBytes, $data['disk_usage']['maximum']);
        foreach (['bandwidth', 'addon_domains', 'subdomains', 'ftp_accounts', 'sftp_accounts', 'mysql_databases'] as $metric) {
            $this->assertSame($other, $data[$metric]['maximum'], $metric);
        }
    }

    public function test_set_as_primary_composes_the_old_flow(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => [
                        'document_root' => '/main.example.com/public_html',
                        'redirect_enabled' => false,
                        'force_https_redirect' => false,
                    ]],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => [
                        'document_root' => '/shop.example.com/public_html',
                        'redirect_enabled' => true,
                        'redirect_url' => 'https://go.example.com',
                        'force_https_redirect' => true,
                    ]],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_contains($path, '/projects/site1/domains/') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
            return Http::response(['message' => 'unexpected'], 500);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        // The old panel saved the new main domain on the account
        // (ServerAccount/DomainController::setAsPrimaryDomain:385-386); the
        // mirror row is what /home and the domain lists read.
        $this->assertSame('shop.example.com', $application->refresh()->domain);

        // delete the addon, rename the main, re-add the old main, then the
        // document roots and the captured settings.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/shop.example.com'));
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1')
            && $r['domain'] === 'shop.example.com');
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/domains')
            && $r['domain'] === 'main.example.com'
            && $r['type'] === 'addon'
            // Re-added as an addon, so it gets the addon's `www` alias.
            && $r['aliases'] === ['www.main.example.com']);
        // The site lives in the main domain's document root, so the promoted
        // domain serves that root (the rename already carries it) instead of the
        // empty root its addon had, and the old main returns as an addon on the
        // root it had, which holds the site's files.
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/shop.example.com')
            && $r['document_root'] === '/main.example.com/public_html');
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/main.example.com')
            && $r['document_root'] === '/main.example.com/public_html');

        // The Engine accepted the rename, so the panel neither read nor deleted a
        // tunnel: the release runs only on the Engine's own tunnel refusal.
        Http::assertNotSent(fn ($r): bool => str_contains($r->url(), '/tunnels'));
    }

    /** Each domain is written once on a switch. */
    public function test_set_as_primary_writes_each_domain_once(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        /** @var list<array{domain: string, root: mixed, redirect: mixed, https: mixed}> $writes */
        $writes = [];
        Http::fake(function ($request) use (&$writes) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => [
                        'document_root' => '/main.example.com/public_html',
                        'redirect_enabled' => false,
                        'force_https_redirect' => true,
                    ]],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => [
                        'document_root' => '/shop.example.com/public_html',
                        'redirect_enabled' => true,
                        'redirect_url' => 'https://go.example.com',
                        'force_https_redirect' => false,
                    ]],
                ]]);
            }
            if (str_contains($path, '/projects/site1/domains/') && $method === 'PUT') {
                $writes[] = [
                    'domain' => basename($path),
                    'root' => $request['document_root'] ?? null,
                    'redirect' => $request['redirect_enabled'] ?? null,
                    'https' => $request['force_https_redirect'] ?? null,
                ];

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk();

        $this->assertSame([
            ['domain' => 'shop.example.com', 'root' => '/main.example.com/public_html', 'redirect' => true, 'https' => false],
            ['domain' => 'main.example.com', 'root' => '/main.example.com/public_html', 'redirect' => false, 'https' => true],
        ], $writes, 'One PUT per domain, carrying its document root and its settings.');
    }

    /** A refused settings PUT is followed by a root-only PUT. */
    public function test_set_as_primary_sets_the_root_alone_when_a_setting_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        /** @var list<array{domain: string, settings: bool}> $writes */
        $writes = [];
        Http::fake(function ($request) use (&$writes) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => [
                        'document_root' => '/main.example.com/public_html',
                        'redirect_enabled' => false,
                        'force_https_redirect' => true,
                    ]],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => [
                        'document_root' => '/shop.example.com/public_html',
                        'redirect_enabled' => true,
                        'redirect_url' => 'https://go.example.com',
                        'force_https_redirect' => false,
                    ]],
                ]]);
            }
            if (str_contains($path, '/projects/site1/domains/') && $method === 'PUT') {
                $withSettings = array_key_exists('redirect_enabled', $request->data());
                $writes[] = ['domain' => basename($path), 'settings' => $withSettings];

                if ($withSettings) {
                    // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> redirect_url refused
                    return Http::response(['errors' => ['redirect_url' => ['The redirect url field format is invalid.']]], 422);
                }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        $this->assertSame([
            ['domain' => 'shop.example.com', 'settings' => true],
            ['domain' => 'shop.example.com', 'settings' => false],
            ['domain' => 'main.example.com', 'settings' => true],
            ['domain' => 'main.example.com', 'settings' => false],
        ], $writes, 'The root-only PUT follows the refused settings PUT of the same domain.');
    }

    /** The switch fires `ProjectDomainChanged`, so a WordPress site's URLs follow the new main domain. */
    public function test_set_as_primary_runs_the_wordpress_search_replace(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/wp/search-replace') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                return Http::response(['data' => [
                    'search' => 'main.example.com', 'replacement' => 'shop.example.com', 'message' => 'Success: 4 replacements.',
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        Http::assertSent(fn ($r): bool => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/wp/search-replace')
            && ($r['search'] ?? null) === 'main.example.com'
            && ($r['replacement'] ?? null) === 'shop.example.com');
    }

    /**
     * The Engine refuses the rename while a tunnel forwards to the old main
     * domain (`domain_has_tunnels`): the panel's own preview is deleted then and
     * the rename retried once, inside the rename step, so the switch's existing
     * rollback stays correct (nothing is released before the first write).
     */
    public function test_set_as_primary_releases_the_previews_on_a_tunnel_refusal(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $renames = 0;
        Http::fake(function ($request) use (&$renames) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/main.example.com/tunnels') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> TunnelController::index
                return Http::response(['data' => [
                    ['hostname' => 'preview-abcd1234.panelalpha.online', 'purpose' => 'preview', 'details' => ['target_domain' => 'main.example.com']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/main.example.com/tunnels/preview-abcd1234.panelalpha.online') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/TunnelController.php:236 -> TunnelController::destroy
                return Http::response(['success' => true]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                $renames++;

                if ($renames === 1) {
                    $message = 'main.example.com has tunnels that forward to it (preview-abcd1234.panelalpha.online); delete them before renaming it.';

                    // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
                    return Http::response([
                        'message' => $message,
                        'errors' => ['domain' => [$message]],
                        'problems' => [['field' => 'domain', 'code' => 'domain_has_tunnels', 'message' => $message]],
                    ], 422);
                }

                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        $this->assertSame('shop.example.com', $application->refresh()->domain);
        $this->assertSame(2, $renames, 'The rename is retried exactly once.');

        // The preview goes, the rename that refused is retried: no rollback
        // re-add, the rename went through.
        Http::assertSent(fn ($r): bool => $r->method() === 'DELETE'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/main.example.com/tunnels/preview-abcd1234.panelalpha.online'));
        Http::assertNotSent(fn ($r): bool => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/domains')
            && ($r['domain'] ?? null) === 'shop.example.com');
    }

    /**
     * A PanelAlpha Online name is served by the proxy through a tunnel, and the
     * Engine refuses to rename a main domain onto one (`domain_proxy_zone`), so
     * the switch refuses before it deletes the addon: deleting first would leave
     * the name's tunnel behind for a rename that cannot happen.
     */
    public function test_set_as_primary_refuses_a_panelalpha_online_target(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => [
                'document_root' => '/main.example.com/public_html',
            ]],
            ['id' => 2, 'domain' => 'site.panelalpha.online', 'type' => 'addon', 'details' => [
                'document_root' => '/site.panelalpha.online/public_html',
            ]],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/site.panelalpha.online/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.domain.0', ComposedPrimaryDomainSwitch::ONLINE_TARGET_REFUSAL);

        // Nothing was written: the addon is still there and the main domain did
        // not move.
        Http::assertNotSent(fn ($r): bool => in_array($r->method(), ['DELETE', 'POST', 'PUT'], true));
        $this->assertSame('site1.example.com', $application->refresh()->domain);
    }

    /**
     * The rename releases the old main domain's PanelAlpha Online tunnel (the
     * Engine deletes the proxy site with the old name), and the Engine never
     * makes such a name a main domain again (`domain_proxy_zone`). The switch
     * re-attaches that tunnel to the addon standing in its place, so the
     * project keeps the address it was created with.
     */
    public function test_set_as_primary_keeps_a_panelalpha_online_address_served_as_a_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'site.panelalpha.online', 'type' => 'main', 'details' => [
                        'document_root' => '/site.panelalpha.online/public_html',
                        'redirect_enabled' => false,
                        'force_https_redirect' => false,
                    ]],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => [
                        'document_root' => '/shop.example.com/public_html',
                        'redirect_enabled' => false,
                        'force_https_redirect' => false,
                    ]],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }
            if (str_ends_with($path, '/projects/site1/domains/site.panelalpha.online/tunnels') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/TunnelController.php:167 -> TunnelManager::createTunnel
                return Http::response(['data' => [
                    'hostname' => 'site.panelalpha.online',
                    'provider' => 'panelalpha',
                    'purpose' => 'default',
                    'valid_until' => null,
                    'details' => ['path' => 'site'],
                ]], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        $this->assertSame('shop.example.com', $application->refresh()->domain);

        // The name the project was created with is served again: its tunnel is
        // attached to the addon the switch re-added, under the name itself (the
        // shape the allocator registers for a project on such a name).
        Http::assertSent(fn ($r): bool => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/domains/site.panelalpha.online/tunnels')
            && $r['hostname'] === 'site.panelalpha.online'
            && $r['provider'] === 'panelalpha'
            && $r['purpose'] === 'default');
    }

    /**
     * Only the Engine's tunnel refusal releases previews: a rename refused for
     * another reason (here a domain already on the engine) keeps the project's
     * preview link, and the switch's rollback puts the addon back.
     */
    public function test_set_as_primary_deletes_no_preview_when_the_rename_is_refused_for_another_reason(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $tunnelsRead = false;
        $readded = false;
        Http::fake(function ($request) use (&$tunnelsRead, &$readded) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_contains($path, '/tunnels')) {
                $tunnelsRead = true;

                // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> TunnelController::index
                return Http::response(['data' => [
                    ['hostname' => 'preview-abcd1234.panelalpha.online', 'purpose' => 'preview', 'details' => ['target_domain' => 'main.example.com']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Lib/Domains/MainDomainRename.php:268 -> refusal (domain_taken)
                return Http::response([
                    'message' => 'shop.example.com is already on this engine.',
                    'errors' => ['domain' => ['shop.example.com is already on this engine.']],
                    'problems' => [['field' => 'domain', 'code' => 'domain_taken', 'message' => 'shop.example.com is already on this engine.']],
                ], 422);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                $readded = true;

                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.domain.0', 'shop.example.com is already on this engine.');

        $this->assertFalse($tunnelsRead, 'A rename refused for another reason reads no tunnel.');
        $this->assertTrue($readded, 'The rollback puts the target addon back.');
        $this->assertSame('site1.example.com', $application->refresh()->domain);
    }

    public function test_set_as_primary_rejects_a_non_addon_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => []],
            ['id' => 2, 'domain' => 'sub.example.com', 'type' => 'sub', 'details' => []],
        ]])]);

        // Old message `invalid_domain_type` (messages.php:134).
        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/sub.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.0.0', 'Invalid domain type.');

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
    }

    public function test_set_as_primary_answers_the_old_panel_messages(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => []],
            ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        // Unknown domain: the old controller answered `invalid_domain`
        // (ServerAccount/DomainController::setAsPrimaryDomain:379-381).
        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/unknown.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonValidationErrors(['domain'])
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.domain.0', 'Invalid domain');

        // The main domain itself: `cannot_set_primary_domain_already_primary`.
        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/main.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.0.0', 'The selected domain is already the primary domain.');

        // Neither domain carries a document root: `invalid_domain_document_root`.
        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.0.0', 'Invalid document root directory.');

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
    }

    /** After a switch both domains share the site's root, and promoting the other one back still works. */
    public function test_set_as_primary_switches_a_domain_that_shares_the_main_document_root(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/site.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/site.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        $this->assertSame('shop.example.com', $application->refresh()->domain);

        // Both domains keep serving the site's root.
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/shop.example.com')
            && $r['document_root'] === '/site.example.com/public_html');
        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/domains/main.example.com')
            && $r['document_root'] === '/site.example.com/public_html');
    }

    public function test_set_as_primary_requires_a_main_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // No main domain on the account: old `main_domain_not_found`
        // (AbstractDomains::findMainDomain).
        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('errors.0.0', 'Main Domain not found on the hosting account.');

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
    }

    public function test_set_as_primary_rolls_back_when_the_rename_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['message' => 'boom'], 500);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []]);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertStatus(502);

        // The addon was put back after the rename failed.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/domains')
            && $r['domain'] === 'shop.example.com');

        // The rename was sent before any tunnel read: the release belongs to the
        // Engine's own tunnel refusal, never to a failed rename.
        Http::assertNotSent(fn ($r): bool => str_contains($r->url(), '/tunnels'));
    }

    public function test_set_as_primary_reports_a_failed_rollback(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Both the rename and the rollback POST fail: the swallowed rollback
        // failure must be reported (old best-effort catch), so the one error
        // the service logs is the rollback's own (the test catches the
        // rethrown rename error itself).
        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['message' => 'boom'], 500);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['message' => 'rollback boom'], 500);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []], 200);
        });

        Log::spy();
        $service = $this->app->make(ServerAccountService::class);

        try {
            $service->setAsPrimaryDomain($application, 'shop.example.com');
            $this->fail('The failed rename must bubble.');
        } catch (EngineRequestException) {
            // expected
        }

        Log::shouldHaveReceived('error')->once();
    }

    public function test_set_as_primary_keeps_the_new_domain_when_the_readd_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Re-adding the old main fails: the Engine's main domain is
                // already the target, so the mirror must keep it.
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['message' => 'boom'], 500);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []], 200);
        });

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertStatus(502);

        // The rename succeeded, so the account's domain is the new main one
        // (old setAsPrimaryDomain saved right after the rename).
        $this->assertSame('shop.example.com', $application->refresh()->domain);

        // No rollback: the guard must not re-add the target once the rename
        // swapped the Engine's main domain.
        Http::assertNotSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/projects/site1/domains')
            && ($r['domain'] ?? null) === 'shop.example.com');
    }

    public function test_set_as_primary_reports_a_failed_settings_restore(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(function ($request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if (str_ends_with($path, '/projects/site1/domains') && $method === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> Engine HTTP handler
                return Http::response(['data' => [
                    ['id' => 1, 'domain' => 'main.example.com', 'type' => 'main', 'details' => ['document_root' => '/main.example.com/public_html']],
                    ['id' => 2, 'domain' => 'shop.example.com', 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
                ]]);
            }
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:375 -> Engine HTTP handler
                return Http::response(null, 204);
            }
            if (str_ends_with($path, '/projects/site1') && $method === 'PUT') {
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> Engine HTTP handler
                return Http::response(['data' => []]);
            }
            if (str_ends_with($path, '/projects/site1/domains') && $method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> Engine HTTP handler
                return Http::response(['data' => []], 201);
            }
            // The step-3 document-root PUT carries only `document_root`; the
            // settings restore also carries the captured flags. Fail only the
            // restore of the target, which is best-effort + reported.
            if (str_ends_with($path, '/projects/site1/domains/shop.example.com') && $method === 'PUT' && array_key_exists('redirect_enabled', $request->data())) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
                return Http::response(['message' => 'restore boom'], 500);
            }

                // Engine: core/app/Http/Controllers/User/DomainController.php:319 -> Engine HTTP handler
            return Http::response(['data' => []], 200);
        });

        Log::spy();

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->assertJsonPath('success', true);

        // restoreDomainSettings is best-effort: the failure is logged, the
        // flow finishes.
        Log::shouldHaveReceived('error')->once();
        $this->assertSame('shop.example.com', $application->refresh()->domain);
    }

    public function test_domains_require_authentication(): void
    {
// CA: packages/client-area/src/views/hosting/Domains.vue:413
        $this->getJson('/api/server-accounts/1/domains')->assertUnauthorized();
    }

    public function test_installed_ssl_reads_what_the_webserver_serves_and_shares_one_cached_check(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The installed file says trusted, but the webserver still serves the
        // expired certificate it loaded before (a renewal it never reloaded):
        // the server certificate is judged by the handshake, not the file.
        $served = $this->engineSslCheck('site1.example.com');
        $served['engine'] = [
            'address' => TestNetwork::private(5), 'answered' => true, 'refused' => false, 'error' => null,
            'certificate' => array_replace($served['public']['certificate'], [
                'status' => 'expired', 'expires_at' => '2026-10-01T00:00:00Z', 'days_remaining' => -15,
            ]),
            'serves_installed' => false,
        ];
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            'engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['data' => $served]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.id', '')
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.status', 'expired')
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.valid', false)
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.serves_installed', false)
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.days_remaining', -15);

        // The detected certificate of the same domain is the public side of the
        // same check: one Engine ssl-check serves both reads.
        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.status', 'trusted');

        Http::assertSentCount(3);
        $this->assertCount(1, Http::recorded(fn ($request) => str_ends_with($request->url(), '/ssl-check')));
    }

    public function test_ssl_settings_are_judged_by_the_served_certificate_and_install_forgets_the_check(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $selfSigned = $this->engineSslCheck('site1.example.com');
        $selfSigned['engine']['certificate'] = array_replace($selfSigned['engine']['certificate'], ['status' => 'self_signed', 'self_signed' => true]);
        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
        Http::fakeSequence('engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check')
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            ->push(['data' => $selfSigned])
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            ->push(['data' => $this->engineSslCheck('site1.example.com')]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:107 -> installed-ssl-cert
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => $this->engineSslCertificate()]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:544 -> install-ssl-cert
            'engine.example.com/api/projects/site1/domains/site1.example.com/install-ssl-cert' => Http::response(['data' => ['domain' => 'site1.example.com']]),
        ]);

        // The file is a trusted certificate, the webserver serves a
        // self-signed one: the settings show what is served, the PEM is the file's.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.status', 'self_signed')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.self_signed', true)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.valid', false)
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.issuer_name', trans('client-area::general.self_signed'))
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.certificate_text', 'CERT-TEXT');

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:403
            ->putJson("/api/server-accounts/{$application->id}/ssl/certificates/install", [
                'domain' => 'site1.example.com',
                'certificate_id' => null,
                'certificate' => 'CERT',
                'key' => 'KEY',
                'cabundle' => 'CA',
            ])
            ->assertOk();

        // The install forgot the cached check, so the next read asks again.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/Security.vue:314
            ->getJson("/api/server-accounts/{$application->id}/ssl/settings/site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.status', 'trusted')
// CA reads: packages/client-area/src/views/instance/advanced/Security.vue:40
            ->assertJsonPath('data.certificate.valid', true);
    }

    public function test_detected_ssl_reads_what_the_applications_domain_serves(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            'engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['data' => $this->engineSslCheck('site1.example.com', [], [
                'engine' => ['address' => TestNetwork::public(10), 'answered' => true, 'refused' => false, 'error' => null, 'certificate' => null, 'serves_installed' => false],
            ])]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:131
            ->assertJsonPath('data.issuer_name', "Let's Encrypt")
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:129
            ->assertJsonPath('data.self_signed', false)
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:138
            ->assertJsonPath('data.name_match', true)
            // The old probe's unix dates, from the Engine's ISO ones.
            ->assertJsonPath('data.not_before', 1788220800)
            ->assertJsonPath('data.not_after', 1795996800)
// CA reads: packages/client-area/src/utils/sslOrderStatus.js (isValidDetectedSslCert)
            ->assertJsonPath('data.status', 'trusted')
            ->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.points_here', true)
            ->assertJsonPath('data.serves_installed', false)
            ->assertJsonPath('data.checked_at', '2026-10-16T12:00:00Z');
    }

    /**
     * A panelalpha.online name is served to visitors by PanelAlpha's proxy with
     * a trusted certificate, while the project's own IP only has the one the
     * Engine signs itself (Engine: core/app/Lib/Domains/DomainPlan.php:19-23).
     * Pinned to the project, every such site read "Self Signed" and its padlock
     * was red although browsers showed Let's Encrypt.
     */
    public function test_a_panelalpha_online_domain_is_judged_where_visitors_reach_it(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // app-lite#1: a *.panelalpha.online name is served to visitors by
        // PanelAlpha's proxy with a trusted wildcard certificate, while the
        // project's own webserver holds the one the Engine signs itself. The
        // Engine's ssl-check dials the address DNS gives (the proxy) and matches
        // the wildcard, so the detected certificate is trusted and the server
        // certificate stays self-signed.
        $check = $this->engineSslCheck('site1-ab12.panelalpha.online', [
            'names' => ['*.panelalpha.online', 'panelalpha.online'],
            'common_name' => 'panelalpha.online',
        ], [
            'dns' => ['addresses' => [TestNetwork::public2(7)], 'expected' => [TestNetwork::public(10)], 'points_here' => false],
        ]);
        $check['public']['address'] = TestNetwork::public2(7);
        $check['engine']['certificate'] = array_replace($check['engine']['certificate'], [
            'status' => 'self_signed', 'self_signed' => true, 'issuer' => 'PanelAlpha',
        ]);
        // The DNS gives the proxy, not the project's IP, so the Engine says
        // `points_here: false`; the domain's own PanelAlpha Online tunnel shows
        // that visitors still reach this host.
        $this->fakeDomainWithTunnels('site1-ab12.panelalpha.online', $check, [
            $this->engineTunnel('site1-ab12.panelalpha.online', 'site1-ab12.panelalpha.online'),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1-ab12.panelalpha.online")
            ->assertOk()
// CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:129
            ->assertJsonPath('data.self_signed', false)
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.status', 'trusted')
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', true);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:30
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1-ab12.panelalpha.online")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.status', 'self_signed');

        // One ssl-check and one tunnels read serve both certificate reads.
        $this->assertCount(1, Http::recorded(fn ($request) => str_ends_with($request->url(), '/ssl-check')));
        $this->assertCount(1, Http::recorded(fn ($request) => str_ends_with($request->url(), '/tunnels')));
    }

    /** A domain whose DNS points to another server and has no tunnel keeps `points_here: false` ("Wrong DNS"). */
    public function test_a_domain_pointing_elsewhere_without_a_tunnel_keeps_points_here_false(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDomainWithTunnels('site1.example.com', $this->sslCheckPointingElsewhere('site1.example.com'), []);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', false);
    }

    /** A preview tunnel has its own name: it does not hide a real domain that points elsewhere. */
    public function test_a_preview_tunnel_does_not_hide_a_domain_pointing_elsewhere(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDomainWithTunnels('site1.example.com', $this->sslCheckPointingElsewhere('site1.example.com'), [
            $this->engineTunnel('preview-ab12.panelalpha.online', 'site1.example.com', 'panelalpha', 'preview'),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', false);
    }

    public function test_a_cloudflare_tunnel_of_the_domain_counts_as_pointing_here(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDomainWithTunnels('site1.example.com', $this->sslCheckPointingElsewhere('site1.example.com'), [
            $this->engineTunnel('Site1.Example.com', 'site1.example.com', 'cloudflare'),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', true);
    }

    public function test_a_failed_tunnel_read_keeps_the_engine_verdict(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDomainWithTunnels('site1.example.com', $this->sslCheckPointingElsewhere('site1.example.com'), null);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', false);
    }

    public function test_no_tunnel_read_when_the_dns_points_here(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDomainWithTunnels('site1.example.com', $this->engineSslCheck('site1.example.com'), []);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=site1.example.com")
            ->assertOk()
// CA reads: packages/client-area/src/utils/sslOrderStatus.js:42
            ->assertJsonPath('data.points_here', true);

        $this->assertCount(0, Http::recorded(fn ($request) => str_ends_with($request->url(), '/tunnels')));
    }

    /**
     * An Engine ssl-check of a domain whose DNS gives another address than the
     * project's, which presents a trusted certificate there.
     *
     * @return array<string, mixed>
     */
    private function sslCheckPointingElsewhere(string $domain): array
    {
        $check = $this->engineSslCheck($domain, [], [
            'dns' => ['addresses' => [TestNetwork::public2(7)], 'expected' => [TestNetwork::public(10)], 'points_here' => false],
        ]);
        $check['public']['address'] = TestNetwork::public2(7);

        return $check;
    }

    /**
     * A tunnel in the Engine's `TunnelResource` shape.
     *
     * @return array<string, mixed>
     */
    private function engineTunnel(string $hostname, string $domain, string $provider = 'panelalpha', string $purpose = 'default'): array
    {
        return [
            'id' => 1,
            'hostname' => $hostname,
            'provider' => $provider,
            'purpose' => $purpose,
            'domain' => $domain,
            'url' => 'https://'.$hostname.'/',
            'valid_until' => null,
            'details' => [],
        ];
    }

    /**
     * The Engine answers for one main domain: its ssl-check, its tunnels
     * (null: the tunnels read fails with 500) and the domains list.
     *
     * @param  array<string, mixed>  $check
     * @param  list<array<string, mixed>>|null  $tunnels
     */
    private function fakeDomainWithTunnels(string $domain, array $check, ?array $tunnels): void
    {
        if ($tunnels === null) {
            // Engine: core/app/Http/Controllers/User/TunnelController.php:47 -> tunnels index (Engine 5xx)
            $tunnelsResponse = Http::response(['message' => 'boom'], 500);
        } else {
            // Engine: core/app/Http/Controllers/User/TunnelController.php:47 -> tunnels index
            $tunnelsResponse = Http::response(['data' => $tunnels]);
        }

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
            "engine.example.com/api/projects/site1/domains/{$domain}/ssl-check" => Http::response(['data' => $check]),
            "engine.example.com/api/projects/site1/domains/{$domain}/tunnels" => $tunnelsResponse,
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => $domain, 'type' => 'main', 'details' => []],
            ]]),
        ]);
    }

    public function test_detected_ssl_rejects_a_domain_of_another_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'addon', 'details' => []],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:47
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=foreign.example.com")
            ->assertStatus(422)
// CA reads: packages/client-area/src/components/security/SslEditModal.vue:353
            ->assertJsonValidationErrors('domain');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'ssl-check'));
    }

    public function test_detected_by_url_reads_the_served_certificate_verdict_for_the_project_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // An expired certificate is not valid even though it is CA-signed and
        // covers the name – the Engine's verdict, not the panel's arithmetic.
        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['data' => $this->engineSslCheck('site1.example.com', [
            'issuer' => 'Test CA',
            'status' => 'expired',
            'expires_at' => '2026-10-01T00:00:00Z',
            'days_remaining' => -15,
        ])])]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/cards/SecurityInfoCard.vue:199
            ->getJson("/api/projects/{$application->id}/ssl/certificate/detected-by-url")
            ->assertOk()
// CA reads: packages/client-area/src/components/cards/SecurityInfoCard.vue:201
            ->assertJsonPath('data.issuer_name', 'Test CA')
            ->assertJsonPath('data.self_signed', false)
            ->assertJsonPath('data.name_match', true)
            ->assertJsonPath('data.status', 'expired')
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.days_remaining', -15);
    }

    /**
     * The Engine now refuses deleting the **main** domain (422
     * `domain`). v1's own guard answers first for the domain the mirror calls
     * main; when the mirror is stale and the delete reaches the Engine, the
     * Engine's field-keyed 422 surfaces unchanged.
     */
    public function test_the_engine_main_domain_refusal_surfaces_as_a_field_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:378 -> destroy (422 domain)
        Http::fake(['engine.example.com/api/projects/site1/domains/addon.example.com' => Http::response([
            'message' => 'Cannot delete the main domain: rename it with project_update instead.',
            'errors' => ['domain' => ['Cannot delete the main domain: rename it with project_update instead.']],
            'problems' => [['field' => 'domain', 'code' => 'domain', 'message' => 'Cannot delete the main domain: rename it with project_update instead.']],
        ], 422)]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->deleteJson("/api/server-accounts/{$application->id}/domains/addon.example.com")
            ->assertStatus(422)
// CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->assertJsonValidationErrors('domain');
    }

    /**
     * The Engine's 422 keys name a field (here `cert`) instead of
     * key `0`; EngineValidationException maps the field through unchanged.
     */
    public function test_an_install_ssl_cert_422_keyed_cert_surfaces(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:515 -> install-ssl-cert (422 cert)
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/install-ssl-cert' => Http::response([
            'message' => 'The certificate is not valid.',
            'errors' => ['cert' => ['The certificate is not valid.']],
            'problems' => [['field' => 'cert', 'code' => 'cert_invalid', 'message' => 'The certificate is not valid.']],
        ], 422)]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/security/SslEditModal.vue:403
            ->putJson("/api/server-accounts/{$application->id}/ssl/certificates/install", [
                'domain' => 'site1.example.com',
                'certificate_id' => null,
                'certificate' => 'CERT',
                'key' => 'KEY',
                'cabundle' => 'CA',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Api.js:80
            ->assertJsonValidationErrors('cert');
    }

    public function test_removing_a_certificate_puts_the_domain_back_on_the_server_certificate(): void
    {
        Event::fake([SslCertificateInstalled::class]);
        $user = User::factory()->create();
        $application = $this->application($user);

        $trusted = $this->engineSslCheck('site1.example.com');
        $serverCert = $this->engineSslCertificate('site1.example.com', [
            'issuer_name' => 'PanelAlpha',
            'issuer_common_name' => 'PanelAlpha',
            'self_signed' => true,
            'status' => 'self_signed',
            'chain_trusted' => false,
        ]);
        $selfSignedCheck = $this->engineSslCheck('site1.example.com', [
            'status' => 'self_signed',
            'issuer' => 'PanelAlpha',
            'self_signed' => true,
            'chain_trusted' => false,
            'signer' => ['common_name' => 'PanelAlpha', 'organization' => 'PanelAlpha', 'country' => 'US'],
        ]);

        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check, once before and once after the removal
        Http::fakeSequence('engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check')
            ->push(['data' => $trusted])
            ->push(['data' => $selfSignedCheck]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:626 -> destroyInstalledSslCert
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => $serverCert]),
        ]);

        $this->actingAs($user)
// CA: src/apis/Hosting.js:30-38 (the installed-certificate read)
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1.example.com")
            ->assertOk()
// CA reads: src/apis/Hosting.js:30-38 (`status`, `self_signed`, `issuer_name`)
            ->assertJsonPath('data.status', 'trusted');

        $this->actingAs($user)
// CA: src/components/security/SslEditModal.vue:300-336 (the dialog's actions; the v1 SPA adds Remove below them)
            ->deleteJson("/api/server-accounts/{$application->id}/ssl/certificates/installed?domain=site1.example.com")
            ->assertOk()
// CA reads: src/apis/Hosting.js:30-38 (`self_signed`, `name_match`, `issuer_name`)
            ->assertJsonPath('data.issuer_name', 'PanelAlpha')
            ->assertJsonPath('data.self_signed', true)
            ->assertJsonPath('data.status', 'self_signed')
            ->assertJsonPath('data.valid', false);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/domains/site1.example.com/installed-ssl-cert'));

        Event::assertDispatched(SslCertificateInstalled::class, fn (SslCertificateInstalled $event): bool => $event->application['id'] === $application->id
            && $event->channel === 'user.'.$user->gravatarHash());

        // The removal forgot the cached ssl-check: the next read asks again and
        // shows the certificate the domain carries now.
        $this->actingAs($user)
// CA: src/apis/Hosting.js:30-38 (the installed-certificate read)
            ->getJson("/api/server-accounts/{$application->id}/ssl/certificate/installed?domain=site1.example.com")
            ->assertOk()
// CA reads: src/apis/Hosting.js:30-38 (`self_signed`, `name_match`, `issuer_name`)
            ->assertJsonPath('data.issuer_name', 'PanelAlpha')
            ->assertJsonPath('data.self_signed', true)
            ->assertJsonPath('data.status', 'self_signed');
    }

    /**
     * @return array<string, array{int}>
     */
    public static function engineWithoutTheRemovalRoute(): array
    {
        return [
            'an Engine whose path serves only the GET (405)' => [405],
            'an Engine without the path at all (404)' => [404],
        ];
    }

    #[DataProvider('engineWithoutTheRemovalRoute')]
    public function test_an_engine_without_the_removal_route_is_refused_in_plain_words(int $status): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/Http/Controllers/User/DomainController.php:626 -> destroyInstalledSslCert
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['message' => 'Method Not Allowed'], $status),
        ]);

        $this->actingAs($user)
// CA: src/components/security/SslEditModal.vue:300-336 (the dialog's actions; the v1 SPA adds Remove below them)
            ->deleteJson("/api/server-accounts/{$application->id}/ssl/certificates/installed?domain=site1.example.com")
            ->assertStatus(422)
// CA reads: src/apis/Api.js:60-80 (`getErrorMessage` of the refusal)
            ->assertJsonPath('message', ServerAccountService::SSL_REMOVE_UNAVAILABLE)
// CA reads: src/apis/Api.js:60-80 (`getErrorMessage` of the refusal)
            ->assertJsonPath('errors.domain.0', ServerAccountService::SSL_REMOVE_UNAVAILABLE);
    }

    public function test_removing_a_certificate_of_a_domain_that_is_not_the_projects_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
        ]);

        $this->actingAs($user)
// CA: src/components/security/SslEditModal.vue:300-336 (the dialog's actions; the v1 SPA adds Remove below them)
            ->deleteJson("/api/server-accounts/{$application->id}/ssl/certificates/installed?domain=other.example.com")
            ->assertStatus(422);

        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
    }
}
