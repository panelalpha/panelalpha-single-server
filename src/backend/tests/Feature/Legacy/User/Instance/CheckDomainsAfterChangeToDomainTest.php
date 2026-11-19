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
 * Port of packages/api/tests/Feature/User/Instance/CheckDomainsAfterChangeToDomainTest.php.
 * It covers the server-account domains and the change-domain/domain route.
 *
 * The old requests are kept; the old
 * `assertDatabaseHas('applications'|'domains')` reads become reads of the v1
 * change-domain response and of the faked Engine call. The old
 * `HasHttpChallenge::httpChallenge()` (a real HTTPS probe) is replaced by the
 * contract suite's `fakePinnedProbe()` (no network).
 *
 * v1 stores the Engine's synchronous rename answer verbatim in
 * `applications.domain` and sends the Engine exactly the requested name; the
 * old panel stripped a `www.` prefix from `applications.domain` while keeping
 * it in `applications.url` (Helper::removeWwwPrefix). v1 gives the
 * old answer back on the presented value only: `data.domain` drops the `www.`
 * (`Application::presentedDomain()`), `data.url` keeps the host the Engine
 * serves. Round 3 (t3d-8) refuses a `www.` name in this request itself, so the
 * old `*_with_www_prefix` ports of this file are gone.
 */
class CheckDomainsAfterChangeToDomainTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Legacy: CheckDomainsAfterChangeToDomainTest.php:14 HasHttpChallenge + :105 httpChallenge() (real HTTPS probe)
        //   → fakePinnedProbe()/fakeHostResolver() in setUp (no network; DomainChangeTest.php:40-41)
        $this->fakeHostResolver();
        $this->fakePinnedProbe();
    }

    private function application(User $user): Application
    {
        // Legacy: CheckDomainsAfterChangeToDomainTest.php:24 User::first() + :26-38 dataProvider (WP Cloud application_id 1231)
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

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:74-79 authAsUser + POST /api/server-accounts/{id}/domains (kept)
        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", $payload)
            ->assertOk()
            // CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->assertJson(['success' => true]);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:81-87 assertDatabaseHas('domains', …)
        //   → the Engine POST the v1 route proxies (v1 keeps no local `domains` table)
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/domains')
            && ($request['domain'] ?? null) === $payload['domain']
            && ($request['type'] ?? null) === $payload['type']);
    }

    private function changeToDomain(User $user, Application $application, string $engineDomain): TestResponse
    {
        Http::fake([
            // v1 releases the panel's preview tunnels before the rename (none here).
            // Engine: core/app/Http/Controllers/User/TunnelController.php:64 -> TunnelController::index
            'engine.example.com/api/projects/site1/domains/*/tunnels' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => $engineDomain,
            ]]),
        ]);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:92 PUT /api/instances/{id}/change-domain/domain
        //   → PUT /api/projects/{id}/change-domain/domain (v1 registers no /instances alias; the CA rewrites the segment)
        $response = $this->actingAs($user)
            // CA: src/components/modal/SetYourDomainModal.vue:746
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => $engineDomain]);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:139-176 $instance->domain/$newUrl saved
        //   → the Engine rename answer the panel persists
        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1')
            && ($request['domain'] ?? null) === $engineDomain);

        return $response;
    }

    /**
     * Round 3, t3d-8: the Engine renames to the name as given and prefixes its
     * own `www` alias to it, so `www.example.com` became the main domain with
     * the alias `www.www.example.com` while the panel showed `example.com` –
     * the project page then offered no Change Domain button to undo it. A
     * `www.` name is refused before the Engine call, as the Add Domain form
     * refuses it; the legacy port's `*_with_www_prefix` change is dropped.
     */
    public function test_change_to_a_domain_with_a_www_prefix_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $before = $application->fresh()?->domain;

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/projects/site1/domains/*/tunnels' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => []]),
        ]);

        $this->actingAs($user)
            // CA: src/components/modal/SetYourDomainModal.vue:746
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'www.shop.example.com'])
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:747
            ->assertJsonPath('errors.domain.0', "Domain cannot start with 'www.'");

        Http::assertNotSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1'));
        $this->assertSame($before, $application->fresh()?->domain);
    }

    public function test_can_change_to_domain_to_existing_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $domain = fake()->domainName;

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:136-142 create addon domain (kept request)
        $this->createDomain($user, $application, ['domain' => $domain, 'type' => 'addon']);

        $response = $this->changeToDomain($user, $application, $domain);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:156-164 assertDatabaseHas('applications', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:751
        $response->assertOk()
            ->assertJsonPath('data.domain', $domain)
            ->assertJsonPath('data.url', "https://{$domain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($domain, $application->fresh()->domain);
    }

    public function test_can_change_to_domain_to_existing_subdomain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $subdomain = fake()->word().'.'.$application->domain;

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:260-267 create sub domain (kept request)
        $this->createDomain($user, $application, [
            'domain' => $subdomain,
            'type' => 'sub',
            'parent_domain' => $application->domain,
        ]);

        $response = $this->changeToDomain($user, $application, $subdomain);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:281-289 assertDatabaseHas('applications', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:751
        $response->assertOk()
            ->assertJsonPath('data.domain', $subdomain)
            ->assertJsonPath('data.url', "https://{$subdomain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($subdomain, $application->fresh()->domain);
    }

    public function test_can_change_to_domain_to_own_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $domain = $application->domain;

        $response = $this->changeToDomain($user, $application, $domain);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:345-353 assertDatabaseHas('applications', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:751
        $response->assertOk()
            ->assertJsonPath('data.domain', $domain)
            ->assertJsonPath('data.url', "https://{$domain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($domain, $application->fresh()->domain);
    }

    public function test_can_change_to_domain_to_not_existing_addon_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $domain = fake()->domainName;

        $response = $this->changeToDomain($user, $application, $domain);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:414-427 assertDatabaseHas('applications', …) + assertDatabaseHas('domains', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:751
        $response->assertOk()
            ->assertJsonPath('data.domain', $domain)
            ->assertJsonPath('data.url', "https://{$domain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($domain, $application->fresh()->domain);
    }

    public function test_can_change_to_domain_to_not_existing_subdomain_without_www_prefix(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $subdomain = fake()->word().'.'.$application->domain;

        $response = $this->changeToDomain($user, $application, $subdomain);

        // Legacy: CheckDomainsAfterChangeToDomainTest.php:488-501 assertDatabaseHas('applications', …) + assertDatabaseHas('domains', …)
        //   → the v1 change-domain response / v1 table
        // CA reads: src/components/modal/SetYourDomainModal.vue:751
        $response->assertOk()
            ->assertJsonPath('data.domain', $subdomain)
            ->assertJsonPath('data.url', "https://{$subdomain}")
            ->assertJsonPath('data.status', 'active');

        $this->assertSame($subdomain, $application->fresh()->domain);
    }
}
