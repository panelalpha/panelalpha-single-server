<?php

namespace Tests\Feature\Legacy\User\Instance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Port of packages/api/tests/Feature/User/Instance/CheckDomainsAfterChangeToSubdomainTest.php.
 * It covers the server-account domains and the change-domain/subdomain route.
 *
 * The old requests are kept; the old
 * `assertDatabaseHas('applications'|'domains')` reads become reads of the v1
 * change-domain response and of the faked Engine call. The old plan API
 * `getDomainsForSubdomains()` becomes the Engine's `GET system/info`
 * `sites_base_domain` (DomainChangeService::changeToSubdomain). The old
 * `HasHttpChallenge::httpChallenge()` (a real HTTPS probe) is replaced by the
 * contract suite's `fakePinnedProbe()` (no network).
 *
 * v1 stores the Engine's synchronous rename answer verbatim in
 * `applications.domain` and sends the Engine exactly the requested name; the
 * old panel stripped a `www.` prefix from `applications.domain` while keeping
 * it in `applications.url`. v1 gives the old answer back on the
 * presented value only: `data.domain` drops the `www.`
 * (`Application::presentedDomain()`), `data.url` keeps the host the Engine
 * serves. Round 3 (t3d-8) refuses a `www.` name in this request itself, so the
 * old `*_with_www_prefix` ports of this file are gone.
 */
class CheckDomainsAfterChangeToSubdomainTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * The plan's subdomain base; the old provider's
     * `$plan->getDomainsForSubdomains()[0]` (CheckDomainsAfterChangeToSubdomainTest.php:61).
     *
     * Intended difference: the old test used `panelalpha.online`. The
     * Engine refuses to rename a main domain into that zone
     * (`MainDomainRename`, `domain_proxy_zone`), so v1 never offers or accepts
     * it as a change-domain base; the ported checks use a sites base domain.
     */
    private const BASE_DOMAIN = 'sites.example.net';

    protected function setUp(): void
    {
        parent::setUp();
        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:14 HasHttpChallenge + :112 httpChallenge() (real HTTPS probe)
        //   → fakePinnedProbe()/fakeHostResolver() in setUp (no network; DomainChangeTest.php:40-41)
        $this->fakeHostResolver();
        $this->fakePinnedProbe();
    }

    private function application(User $user): Application
    {
        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:24 User::first() + :26-40 dataProvider (Direct Admin plan_id 1181)
        //   → a v1 synced Engine project (EngineFixtures::syncedApplication)
        return $this->syncedApplication($user);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function createDomain(User $user, Application $application, array $payload): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains store
        Http::fake([
            'engine.example.com/api/projects/site1/domains*' => Http::response(['data' => ['id' => 1]]),
        ]);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:79-83 authAsUser + POST /api/server-accounts/{id}/domains (kept)
        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", $payload)
            ->assertOk()
            // CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->assertJson(['success' => true]);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:85-91 assertDatabaseHas('domains', …)
        //   → the Engine POST the v1 route proxies (v1 keeps no local `domains` table)
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/domains')
            && ($request['domain'] ?? null) === $payload['domain']
            && ($request['type'] ?? null) === $payload['type']);
    }

    private function changeToSubdomain(User $user, Application $application, string $subdomain): TestResponse
    {
        $full = "{$subdomain}.".self::BASE_DOMAIN;

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'sites_base_domain' => self::BASE_DOMAIN,
            ]]),
            // v1 releases the panel's preview tunnels before the rename (none here).
            // Engine: core/app/Http/Controllers/User/TunnelController.php:64 -> TunnelController::index
            'engine.example.com/api/projects/site1/domains/*/tunnels' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => $full,
            ]]),
        ]);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:98 PUT /api/instances/{id}/change-domain/subdomain
        //   → PUT /api/projects/{id}/change-domain/subdomain (v1 registers no /instances alias; the CA rewrites the segment)
        $response = $this->actingAs($user)
            // CA: src/components/modal/SetYourDomainModal.vue:767
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", [
                'subdomain' => $subdomain,
                'domain' => self::BASE_DOMAIN,
            ]);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:258-300 plan->getDomainsForSubdomains() + instance->domain/url saved
        //   → the Engine rename answer the panel persists
        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1')
            && ($request['domain'] ?? null) === $full);

        return $response;
    }

    /**
     * Round 3, t3d-8: a `www.` name would become the project's main domain and
     * the Engine prefixes its own `www` alias to it (`www.www.…`); the change
     * is refused before any Engine call, as the Add Domain form refuses it.
     */
    public function test_change_to_a_subdomain_with_a_www_prefix_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $before = $application->fresh()?->domain;

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'sites_base_domain' => self::BASE_DOMAIN,
            ]]),
            'engine.example.com/api/projects/site1/domains/*/tunnels' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
            // CA: src/components/modal/SetYourDomainModal.vue:767
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", [
                'subdomain' => 'www.shop',
                'domain' => self::BASE_DOMAIN,
            ])
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:747
            ->assertJsonPath('errors.domain.0', "Domain cannot start with 'www.'");

        Http::assertNotSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1'));
        $this->assertSame($before, $application->fresh()?->domain);
    }

    public function test_can_change_to_subdomain_to_existing_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $sub = fake()->word();
        $subdomain = "{$sub}.".self::BASE_DOMAIN;

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:148-158 create addon domain (kept request)
        $this->createDomain($user, $application, ['domain' => $subdomain, 'type' => 'addon']);

        $response = $this->changeToSubdomain($user, $application, $sub);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:172-179 assertDatabaseHas('applications', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:773
        $response->assertOk()
            ->assertJsonPath('data.domain', $subdomain)
            ->assertJsonPath('data.url', "https://{$subdomain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($subdomain, $application->fresh()->domain);
    }

    public function test_can_change_to_subdomain_to_not_existing_addon_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $sub = fake()->word();
        $subdomain = "{$sub}.".self::BASE_DOMAIN;

        $response = $this->changeToSubdomain($user, $application, $sub);

        // Legacy: CheckDomainsAfterChangeToSubdomainTest.php:261-272 assertDatabaseHas('applications', …) + assertDatabaseHas('domains', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:773
        $response->assertOk()
            ->assertJsonPath('data.domain', $subdomain)
            ->assertJsonPath('data.url', "https://{$subdomain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($subdomain, $application->fresh()->domain);
    }
}
