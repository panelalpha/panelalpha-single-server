<?php

namespace Tests\Feature\Legacy\User;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/DomainControllerTest.php.
 * The old `User::first()` +
 * `$user->services()->first()` lookups become v1's one virtual service; the
 * `assertDatabaseHas('domains', …)` assertion becomes the v1 `/services/{id}/domains`
 * API read. The requests and the response assertions stay as written.
 *
 * Intended v1 difference (`POST /services/{id}/domains`):
 * the old panel answered 201 with the server-account `DomainResource`
 * `{id, domain, document_root, server_account_id, …}`
 * (packages/api/tests/Feature/User/DomainControllerTest.php:31-44,
 * `assertCreated()` + `assertJsonStructure`); v1 treats the route as the
 * onboarding domain step, which is asynchronous on the Engine (`POST projects`
 * answers 202 + task), and answers 202 + `{id, domain}`
 * (ServiceDomainPresenter). The CA reads only `id` from that answer
 * (`newDomain = response.data.data`, OnboardingModalWrapper.vue:1575, then
 * `newDomain?.id` at :1607) and an optional `domain_zone`
 * (OnboardingDomainInstantVerificationModal.vue:187,
 * `newDomain?.domain_zone?.details.configuration_records ?? []`), which
 * single-server never has; axios treats 201 and 202 alike.
 */
class DomainControllerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_create_domain(): void
    {
        // Legacy: DomainControllerTest.php:17-25 User::first() + services()->first()
        // → v1's virtual service and a factory user.
        $user = User::factory()->create();
        $this->configureEngine();

        // Legacy: DomainControllerTest.php:28 faker domainName → fixed fixture name.
        $domain = 'shop.example.com';

        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects' => Http::response([
                'data' => ['id' => 55, 'username' => 'shop'],
            ], 202),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll (the API read below)
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(55, 'shop', ['domain' => $domain]),
            ]]),
        ]);

        // Legacy: DomainControllerTest.php:27-31 request kept verbatim
        // (POST /services/{id}/domains, `{domain}`); v1 binds the service id to
        // the one virtual service.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $response = $this->actingAs($user)
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => $domain,
            ]);

        // v1 deliberately answers the onboarding domain step with 202 +
        // `{id, domain}` (ServiceDomainPresenter) instead of the old 201
        // DomainResource shape (see the class docblock).
        $response->assertStatus(202);
        $id = $response->json('data.id');
        $this->assertIsInt($id);
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1607
        $response->assertExactJson(['data' => ['id' => $id, 'domain' => $domain]]);

        // Legacy: DomainControllerTest.php:42-44 assertDatabaseHas('domains', …)
        // → the v1 `/services/{id}/domains` API read.
        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55
        // CA reads: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:59
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains')
            ->assertOk()
            ->assertJsonPath('data.0.domain', $domain);
    }

    public function test_verify_domain(): void
    {
        // Legacy: DomainControllerTest.php:49-57 User::first() + services()->first()
        // → v1's virtual service and a factory user.
        $user = User::factory()->create();

        // The check never reaches the Engine for a fresh valid name;
        // the fake keeps the test hermetic anyway.
        Http::fake();

        // Legacy: DomainControllerTest.php:59 faker domainName → fixed fixture name.
        $domain = 'verify.example.com';

        // Legacy: DomainControllerTest.php:61 request kept verbatim.
        // CA: packages/client-area/src/components/onboarding/OnboardingDomainTransferModal.vue:227
        $response = $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/verify?domain='.$domain);

        // Legacy: DomainControllerTest.php:63 assertOk() kept.
        $response->assertOk();
        // Legacy: DomainControllerTest.php:64-68 assertJsonStructure([…]) kept.
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDomainTransferModal.vue:231
        $response->assertJsonStructure([
            'verification_allowed',
            'verification_required',
            'verification_record',
        ]);
        // Single-server has no external DNS transfer, so no record is needed.
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDomainTransferModal.vue:231
        $response->assertJson(['verification_allowed' => false]);
    }

    public function test_verify_wp_cloud_domain(): void
    {
        // Legacy: DomainControllerTest.php:71-99 – WP Cloud servers do not exist
        // in the single-server build; the
        // `verification_allowed:true` branch is the WP Cloud integration.
        $this->markTestSkipped('Legacy N/A: WP Cloud servers do not exist in the single-server build');
    }

    public function test_verify_wp_cloud_domain_restricted(): void
    {
        // Legacy: DomainControllerTest.php:101-124 – the WordPress.com/WP Cloud
        // restriction rule is multi-server only.
        $this->markTestSkipped('Legacy N/A: WP Cloud servers do not exist in the single-server build');
    }
}
