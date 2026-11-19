<?php

namespace Tests\Feature\Legacy\User\ServerAccount;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/ServerAccount/DomainsTest.php.
 * The old `ServerAccount::find` +
 * `connect()->domains()->isSupportedDomainType()`, `assertDatabaseHas('domains')`,
 * `syncDomains()` and `HasHttpChallenge::httpChallenge()` internals are replaced
 * by v1's Engine fixtures and the `/domains` API read; the requests and the
 * response assertions stay as written.
 *
 * `test_create_alias` is an intended v1 difference: the Engine
 * has no alias domains (`meta.domain_types` is `[addon, sub]`), so the old 200
 * (packages/api/tests/Feature/User/ServerAccount/DomainsTest.php:150-168) is
 * the 422 on `type`, with no Engine call. If the Engine adds alias domains, the
 * test changes with the route.
 */
class DomainsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Fake the Engine's `POST` domain write and the `GET` domain list for one
     * project, so a test can assert both the v1 write and the v1 read.
     *
     * @param  list<array<string, mixed>>  $domains  the `GET /domains` rows
     */
    private function fakeDomains(array $domains): void
    {
        Http::fake(function (Request $request) use ($domains) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with($path, '/projects/site1/domains')) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> store, :46 -> list
                return $request->method() === 'GET'
                    ? Http::response(['data' => $domains])
                    // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> store
                    : Http::response(['data' => ['id' => 1]]);
            }

            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> list
            return Http::response(['data' => []]);
        });
    }

    public function test_create_addon_domain(): void
    {
        $user = User::factory()->create();
        // Legacy: packages/api/tests/Feature/User/ServerAccount/DomainsTest.php:46-53
        // (ServerAccount::find + connect()->domains()->isSupportedDomainType('addon'))
        // → v1 syncedApplication; the Engine's meta.domain_types carries the support.
        $application = $this->syncedApplication($user);

        // Legacy: DomainsTest.php:55 faker domainName → fixed v1 fixture name.
        $domain = 'shop.example.com';
        $this->fakeDomains([
            ['id' => 1, 'domain' => $domain, 'type' => 'addon', 'details' => ['document_root' => '/shop.example.com/public_html']],
        ]);

        // Legacy: DomainsTest.php:57 authAsUser → actingAs($user).
        // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
        $response = $this->actingAs($user)->postJson("/api/server-accounts/{$application->id}/domains", [
            // Legacy: DomainsTest.php:58-61 request kept verbatim.
            'domain' => $domain,
            'type' => 'addon',
        ]);

        // Legacy: DomainsTest.php:63 assertStatus(200) kept.
        $response->assertStatus(200);

        // Legacy: DomainsTest.php:64-75 assertDatabaseHas('domains') + syncDomains()->get()
        // + httpChallenge() → v1's Engine write plus the `/domains` API read.
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/projects/site1/domains')
            && $request['domain'] === $domain
            && $request['type'] === 'addon');

        $this->actingAs($user)
            // CA: packages/client-area/src/views/hosting/Domains.vue:413
            ->getJson("/api/server-accounts/{$application->id}/domains")
            // CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:64
            ->assertOk()
            ->assertJsonPath('data.0.domain', $domain)
            ->assertJsonPath('data.0.type', 'addon')
            // v1 advertises addon/sub only – no standalone alias.
            ->assertJsonPath('meta.domain_types', ['addon', 'sub']);
    }

    public function test_create_subdomain(): void
    {
        $user = User::factory()->create();
        // Legacy: DomainsTest.php:78-101 (@depends test_create_addon_domain +
        // ServerAccount::find + parentDomain read from the addon row)
        // → v1 syncedApplication; the parent is the project's main domain, so the
        // cross-test @depends is replaced by a self-contained v1 fixture.
        $application = $this->syncedApplication($user);

        // Legacy: DomainsTest.php:103 faker word → fixed v1 fixture name.
        $parent = 'site1.example.com';
        $domain = "blog.{$parent}";
        $this->fakeDomains([
            ['id' => 2, 'domain' => $domain, 'type' => 'sub', 'details' => []],
        ]);

        // Legacy: DomainsTest.php:105 authAsUser → actingAs($user).
        // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
        $response = $this->actingAs($user)->postJson("/api/server-accounts/{$application->id}/domains", [
            // Legacy: DomainsTest.php:106-110 request kept verbatim.
            'domain' => $domain,
            'parent_domain' => $parent,
            'type' => 'sub',
        ]);

        // Legacy: DomainsTest.php:112 assertStatus(200) kept.
        $response->assertStatus(200);

        // Legacy: DomainsTest.php:113-124 assertDatabaseHas('domains') + syncDomains()->get()
        // + httpChallenge() → v1's Engine write plus the `/domains` API read.
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/projects/site1/domains')
            && $request['domain'] === $domain
            && $request['parent_domain'] === $parent
            && $request['type'] === 'sub');

        $this->actingAs($user)
            // CA: packages/client-area/src/views/hosting/Domains.vue:413
            ->getJson("/api/server-accounts/{$application->id}/domains")
            // CA reads: packages/client-area/src/components/dataIterator/tables/HostingDomainsTable.vue:64
            ->assertOk()
            ->assertJsonPath('data.0.domain', $domain)
            ->assertJsonPath('data.0.type', 'sub');
    }

    public function test_create_alias(): void
    {
        $user = User::factory()->create();
        // Legacy: DomainsTest.php:135-145 ServerAccount::find + targetDomain read
        // → v1 syncedApplication; the target is the project's main domain.
        $application = $this->syncedApplication($user);

        // Legacy: DomainsTest.php:147 faker domainName → fixed v1 fixture name.
        $target = 'site1.example.com';
        $alias = 'alias.example.com';
        // The fixture's sync call; the refused request adds none.
        $sentBeforeCreate = count(Http::recorded());

        // Legacy: DomainsTest.php:149 authAsUser → actingAs($user).
        // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
        $response = $this->actingAs($user)->postJson("/api/server-accounts/{$application->id}/domains", [
            // Legacy: DomainsTest.php:150-154 request kept verbatim.
            'domain' => $alias,
            'target_domain' => $target,
            'type' => 'alias',
        ]);

        // Intended v1 difference: the Engine has no alias
        // domains, so v1 advertises addon/sub only (`meta.domain_types`,
        // ServerAccountService::domains) and DomainStoreRequest rejects every
        // other type with a 422 on `type` before any Engine call. The old panel
        // answered 200 and created the alias row
        // (packages/api/tests/Feature/User/ServerAccount/DomainsTest.php:150-168).
        $response->assertStatus(422);
        // CA reads: packages/client-area/src/mixins/DomainsActionsMixin.js:269
        $response->assertExactJson([
            'message' => 'The selected type is invalid.',
            'errors' => ['type' => ['The selected type is invalid.']],
        ]);
        $this->assertCount($sentBeforeCreate, Http::recorded());
    }
}
