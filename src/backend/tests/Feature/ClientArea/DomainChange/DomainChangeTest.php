<?php

namespace Tests\Feature\ClientArea\DomainChange;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Change-domain options/domain/subdomain and the
 * panel-side SSL probe.
 */
class DomainChangeTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // The detected-by-url probe resolves the Engine host as the fallback;
        // the fakes keep the test off DNS and sockets.
        $this->fakeHostResolver();
        $this->fakePinnedProbe();
    }

    /**
     * Fake the Engine's tunnel list on the old main domain, the read
     * `PreviewTunnelService::releasePreviews()` makes after the Engine refused
     * the rename because of a tunnel.
     *
     * @param  list<array<string, mixed>>  $tunnels
     */
    private function fakeTunnelList(array $tunnels, int $status = 200): void
    {
        $body = $status === 200 ? ['data' => $tunnels] : ['message' => 'boom'];
        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> TunnelController::index
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => Http::response($body, $status)]);
    }

    /**
     * Fake the Engine's tunnel delete, which the release makes for a preview.
     */
    private function fakeTunnelDelete(): void
    {
        // Engine: core/app/Http/Controllers/User/TunnelController.php:236 -> TunnelController::destroy
        Http::fake(['engine.example.com/api/projects/site1/domains/*/tunnels/*' => Http::response(['success' => true])]);
    }

    /**
     * The Engine's 422 while a tunnel forwards to the old main domain: the
     * `FreeMainDomain` rule reads `MainDomainRename::refusal()` and reports its
     * `code` as a problem (`Rules/FreeMainDomain.php:28-31`), and the handler
     * puts `problems[]` beside `errors` (`Exceptions/Handler.php:175-184`).
     *
     * @param  list<string>  $hostnames
     * @return array<string, mixed>
     */
    private function tunnelRefusal(array $hostnames): array
    {
        // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
        $message = 'site1.example.com has tunnels that forward to it ('.implode(', ', $hostnames).'); delete them before renaming it.';

        return [
            'message' => $message,
            'errors' => ['domain' => [$message]],
            'problems' => [['field' => 'domain', 'code' => 'domain_has_tunnels', 'message' => $message]],
        ];
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    public function test_options_returns_subdomain_bases_and_ips(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/routes/api.php:431 → SystemController::info, {data:{…}}.
        // The Engine names the address `default_ipv4` and has no nameservers.
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'sites.example.net',
            'default_ipv4' => TestNetwork::public(10),
        ]])]);

        // CA: src/components/modal/SetYourDomainModal.vue:578
        // CA reads: src/components/modal/SetYourDomainModal.vue:579-590
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/change-domain/options")
            ->assertOk()
            ->assertJsonPath('data.subdomains.0', 'sites.example.net')
            ->assertJsonPath('data.ip_address', TestNetwork::public(10))
            ->assertJsonPath('data.ipv4_addresses.0', TestNetwork::public(10))
            ->assertJsonPath('data.nameservers', []);

        // One `system/info` call per request.
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/api/system/info'), 1);
    }

    /**
     * Without a sites base domain the bases are the Engine's own direct name
     * (`cert_domain`, else the dashed address under panelalpha.direct), never
     * panelalpha.online: the Engine refuses to rename a main domain into it
     * (`domain_proxy_zone`), so offering it made every subdomain change fail
     * (live API suite, 2026-11-04, Engine without `sites_base_domain`).
     *
     * @return array<string, array{0: array<string, mixed>, 1: list<string>}>
     */
    public static function engineInfos(): array
    {
        return [
            'dashed address' => [['sites_base_domain' => null, 'cert_domain' => null, 'default_ipv4' => TestNetwork::private(25)], [str_replace('.', '-', TestNetwork::private(25)).'.panelalpha.direct']],
            'certificate domain' => [['sites_base_domain' => null, 'cert_domain' => 'engine.example.org', 'default_ipv4' => TestNetwork::private(25)], ['engine.example.org']],
            'sites base domain' => [['sites_base_domain' => 'sites.example.net', 'cert_domain' => 'engine.example.org', 'default_ipv4' => TestNetwork::private(25)], ['sites.example.net']],
            'online zone base' => [['sites_base_domain' => 'panelalpha.online', 'cert_domain' => null, 'default_ipv4' => TestNetwork::private(25)], [str_replace('.', '-', TestNetwork::private(25)).'.panelalpha.direct']],
            'nothing' => [['sites_base_domain' => null, 'cert_domain' => null, 'default_ipv4' => null], []],
        ];
    }

    /**
     * @param  array<string, mixed>  $info
     * @param  list<string>  $bases
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('engineInfos')]
    public function test_the_offered_bases_are_the_ones_the_engine_renames_onto(array $info, array $bases): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => $info])]);

        $this->actingAs($user)
// CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:578
            ->getJson("/api/projects/{$application->id}/change-domain/options")
            ->assertOk()
// CA reads: packages/client-area/src/components/modal/SetYourDomainModal.vue:582
            ->assertJsonPath('data.subdomains', $bases);

        $this->actingAs($user)
// CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:767
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", ['subdomain' => 'blog', 'domain' => 'panelalpha.online'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/components/modal/SetYourDomainModal.vue:767
            ->assertJsonValidationErrors(['domain']);
        Http::assertNotSent(fn ($r) => $r->method() === 'PUT');
    }

    public function test_change_to_domain_renames_on_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The follow-up project read below reads the Engine usage live.

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => [
            'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
        ]])]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751-752 (`response.data.data`, `dns_nameservers`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.domain)
            ->assertJsonPath('data.domain', 'shop.example.com')
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.url)
            ->assertJsonPath('data.url', 'https://shop.example.com')
            ->assertJsonPath('data.dns_nameservers', []);

        // The Engine answer is persisted: the row and a
        // follow-up GET show the new domain without waiting for a sync.
        $this->assertSame('shop.example.com', $application->fresh()->domain);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA reloads the instance)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}")
            ->assertOk()
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.domain)
            ->assertJsonPath('data.domain', 'shop.example.com')
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.url)
            ->assertJsonPath('data.url', 'https://shop.example.com');

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/projects/site1')
            && $r['domain'] === 'shop.example.com');
    }

    public function test_the_engine_rename_answer_is_persisted_when_it_differs(): void
    {
        // The Engine's synchronous answer is authoritative – a
        // normalised/different domain must be what the row and the response
        // carry, not the requested string.
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => [
            'id' => 10, 'username' => 'site1', 'domain' => 'normalised.example.com',
        ]])]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.domain)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk()
            ->assertJsonPath('data.domain', 'normalised.example.com');

        $this->assertSame('normalised.example.com', $application->fresh()->domain);
    }

    public function test_change_to_domain_runs_the_wordpress_search_replace(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
            'engine.example.com/api/projects/site1/wp/search-replace' => Http::response(['data' => [
                'search' => 'site1.example.com', 'replacement' => 'shop.example.com', 'message' => 'Success: 4 replacements.',
            ]]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751-752 (`response.data.data`, `dns_nameservers`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        // The old `ChangeDomainController::wordpressDatabaseSearchReplace`
        // searched the old domain for the new one.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/wp/search-replace')
            && ($r['search'] ?? null) === 'site1.example.com'
            && ($r['replacement'] ?? null) === 'shop.example.com'
            && ($r['args'] ?? null) === null);
    }

    public function test_change_to_domain_retries_the_search_replace_with_precise(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
            'engine.example.com/api/projects/site1/wp/search-replace' => Http::sequence()
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                ->push(['message' => 'Search-replace failed.'], 422)
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                ->push(['data' => ['search' => 'site1.example.com', 'replacement' => 'shop.example.com', 'message' => 'ok']]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/wp/search-replace') && ($r['args'] ?? null) === ['--precise']);
    }

    public function test_change_to_domain_runs_a_dry_run_after_the_second_search_replace_failure(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
            'engine.example.com/api/projects/site1/wp/search-replace' => Http::sequence()
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                ->push(['message' => 'Search-replace failed.'], 422)
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                ->push(['message' => 'Precise search-replace failed.'], 422)
                // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
                ->push(['data' => ['search' => 'site1.example.com', 'replacement' => 'shop.example.com', 'message' => 'dry run']]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // The old panel logged the dry run and swallowed the final failure, so
        // the rename still answers 200.
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/wp/search-replace') && ($r['args'] ?? null) === ['--dry-run']);
    }

    public function test_change_to_subdomain_runs_the_wordpress_search_replace(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'sites_base_domain' => 'sites.example.net',
            ]]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'blog.sites.example.net',
            ]]),
            'engine.example.com/api/projects/site1/wp/search-replace' => Http::response(['data' => [
                'search' => 'site1.example.com', 'replacement' => 'blog.sites.example.net', 'message' => 'ok',
            ]]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:767 (the CA sends `{subdomain, domain}`)
        // The old subdomain path also search-replaced the old domain (ChangeDomainController.php:323).
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", [
                'subdomain' => 'blog',
                'domain' => 'sites.example.net',
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/wp/search-replace')
            && ($r['search'] ?? null) === 'site1.example.com'
            && ($r['replacement'] ?? null) === 'blog.sites.example.net');
    }

    /**
     * The panel keeps no tunnel cache and the Engine's rename
     * replaces the main domain row, so a rename the Engine accepts needs no
     * tunnel call at all – not even the list read the release makes. Reading it
     * up front aborted renames the Engine would have accepted (a stale mirror, a
     * 5xx on the list) and deleted the previews of renames that then failed.
     */
    public function test_change_to_domain_makes_no_tunnel_call(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([['hostname' => 'preview-abcd1234.panelalpha.online', 'purpose' => 'preview']]);
        $this->fakeTunnelDelete();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751-752 (`response.data.data`, `dns_nameservers`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id);

        // The Engine accepted the rename: its answer alone decided, no tunnel
        // was read and none was deleted.
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/tunnels'));
    }

    /**
     * A failed tunnel list is not the rename's business any more: the panel asks
     * the Engine first and only looks for previews when the Engine refuses
     * because of one. A 5xx on that read used to abort a rename the Engine would
     * have accepted.
     */
    public function test_a_failing_tunnel_list_cannot_abort_the_rename(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([], 500);
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.domain)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk()
            ->assertJsonPath('data.domain', 'shop.example.com');

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/tunnels'));
    }

    /**
     * The Engine refuses to rename a main domain a tunnel forwards to
     * (`domain_has_tunnels`); a preview is the panel's own disposable tunnel, so
     * it is deleted then and the rename retried once, while any other tunnel
     * stays (live API suite, 2026-11-04).
     */
    public function test_a_tunnel_refusal_deletes_the_previews_and_retries_the_rename(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([
            ['hostname' => 'preview-abcd1234.panelalpha.online', 'purpose' => 'preview'],
            ['hostname' => 'site1-live.panelalpha.online', 'purpose' => 'tunnel'],
        ]);
        $this->fakeTunnelDelete();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::sequence()
                // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
                ->push($this->tunnelRefusal(['preview-abcd1234.panelalpha.online', 'site1-live.panelalpha.online']), 422)
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
                ->push(['data' => ['id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com']]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:751 (instance.domain)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk()
            ->assertJsonPath('data.domain', 'shop.example.com');

        $this->assertSame('shop.example.com', $application->fresh()->domain);

        $sent = [];
        Http::assertSent(function ($request) use (&$sent): bool {
            $sent[] = $request->method().' '.parse_url($request->url(), PHP_URL_PATH);

            return true;
        });
        $this->assertSame([
            'PUT /api/projects/site1',
            'GET /api/projects/site1/domains/site1.example.com/tunnels',
            'DELETE /api/projects/site1/domains/site1.example.com/tunnels/preview-abcd1234.panelalpha.online',
            'PUT /api/projects/site1',
        ], $sent, 'The rename comes first, the release runs on the refusal and the rename is retried once.');
    }

    /**
     * Only the Engine's tunnel refusal costs the project its previews: a rename
     * refused for another reason (here a domain another project already holds)
     * must leave the preview link, the preview SSOs and phpMyAdmin usable.
     */
    public function test_a_rename_refused_for_another_reason_deletes_no_preview(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([['hostname' => 'preview-abcd1234.panelalpha.online', 'purpose' => 'preview']]);
        $this->fakeTunnelDelete();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::response([
                'message' => 'shop.example.com is already on this engine.',
                'errors' => ['domain' => ['shop.example.com is already on this engine.']],
                'problems' => [['field' => 'domain', 'code' => 'domain_taken', 'message' => 'shop.example.com is already on this engine.']],
            ], 422),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:747
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain'])
            ->assertJsonPath('errors.domain.0', 'shop.example.com is already on this engine.');

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/tunnels'));
        $this->assertSame('site1.example.com', $application->fresh()->domain);
    }

    /**
     * A 404 on the tunnel list means the Engine has no such domain, so nothing
     * forwards to it: the release releases nothing and the rename is retried
     * (the mirror may be stale; the Engine's refusal still names the real
     * blocker).
     */
    public function test_a_tunnel_list_404_means_no_previews(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([], 404);
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::sequence()
                // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
                ->push($this->tunnelRefusal(['site1-live.panelalpha.online']), 422)
                // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
                ->push(['data' => ['id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com']]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1'));
        Http::assertNotSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_contains($request->url(), '/tunnels'));
    }

    /**
     * The release deletes only previews, so a tunnel of another purpose refuses
     * the retry and the Engine's own sentence – which names that tunnel – is
     * what the user sees.
     */
    public function test_a_remaining_non_preview_tunnel_is_the_refusal_the_user_sees(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeTunnelList([['hostname' => 'site1-live.panelalpha.online', 'purpose' => 'tunnel']]);
        $this->fakeTunnelDelete();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            'engine.example.com/api/projects/site1' => Http::sequence()
                // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
                ->push($this->tunnelRefusal(['site1-live.panelalpha.online']), 422)
                // Engine: core/app/Lib/Domains/MainDomainRename.php:290-293 -> tunnelRefusal
                ->push($this->tunnelRefusal(['site1-live.panelalpha.online']), 422),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:747
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'site1.example.com has tunnels that forward to it (site1-live.panelalpha.online); delete them before renaming it.');

        Http::assertNotSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_contains($request->url(), '/tunnels'));
        $renames = Http::recorded(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1'));
        $this->assertCount(2, $renames, 'The rename is retried exactly once, then the Engine refusal stands.');
        $this->assertSame('site1.example.com', $application->fresh()->domain);
    }

    public function test_change_to_domain_runs_the_wordpress_search_replace_without_a_tunnel_call(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:68 -> WpSearchReplaceController::run
        Http::fake([
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
            ]]),
            'engine.example.com/api/projects/site1/wp/search-replace' => Http::response(['data' => [
                'search' => 'site1.example.com', 'replacement' => 'shop.example.com', 'message' => 'ok',
            ]]),
        ]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        // The WordPress search-replace runs after the rename and reads no
        // tunnel (the rename goes first).
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/wp/search-replace')
            && ($r['search'] ?? null) === 'site1.example.com');
        Http::assertNotSent(fn ($r): bool => str_contains($r->url(), '/tunnels'));
    }

    public function test_the_rename_requests_the_project_domain_changed_event(): void
    {
        // DomainChangeService used to call
        // deletePreviewTunnel()/searchReplace() directly; it now fires
        // ProjectDomainChanged, which the controller provider delivers.
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => [
            'id' => 10, 'username' => 'site1', 'domain' => 'shop.example.com',
        ]])]);

        Event::fake([ProjectDomainChanged::class]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com'])
            ->assertOk();

        Event::assertDispatched(
            ProjectDomainChanged::class,
            fn (ProjectDomainChanged $event): bool => $event->application->is($application)
                && $event->oldDomain === 'site1.example.com'
                && $event->newDomain === 'shop.example.com',
        );
    }

    public function test_change_to_domain_rejects_an_invalid_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => []])]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        // CA reads: src/components/modal/SetYourDomainModal.vue:747
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'not a domain'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain']);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT');
    }

    public function test_change_to_subdomain_builds_subdomain_domain(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'sites_base_domain' => 'sites.example.net',
            ]]),
            'engine.example.com/api/projects/site1' => Http::response(['data' => [
                'id' => 10, 'username' => 'site1', 'domain' => 'shop.sites.example.net',
            ]]),
        ]);

        // The CA sends `{subdomain, domain}` (SetYourDomainModal.vue:767).
        // CA: src/components/modal/SetYourDomainModal.vue:767
        // CA reads: src/components/modal/SetYourDomainModal.vue:773 (`response.data.data` instance)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", [
                'subdomain' => 'shop',
                'domain' => 'sites.example.net',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $application->id)
            ->assertJsonPath('data.domain', 'shop.sites.example.net')
            ->assertJsonPath('data.url', 'https://shop.sites.example.net')
            ->assertJsonPath('data.dns_nameservers', []);

        $this->assertSame('shop.sites.example.net', $application->fresh()->domain);

        Http::assertSent(fn ($r) => $r->method() === 'PUT' && $r['domain'] === 'shop.sites.example.net');
    }

    public function test_the_resolve_check_accepts_the_new_domain_after_the_change(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => [
            'id' => 10, 'username' => 'site1', 'domain' => 'shop.sites.example.net',
        ]])]);

        // CA: src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.sites.example.net'])
            ->assertOk();

        // A 2xx pinned probe makes the resolve check positive; while the mirror
        // was stale it answered 422 "Domain name is not available.".
        $this->app->instance(PinnedProbe::class, new class implements PinnedProbe
        {
            public function httpsStatus(string $host, string $address): ?int
            {
                return 200;
            }
        });

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=shop.sites.example.net')
            ->assertOk()
            ->assertJson(['is_resolved' => true]);
    }

    public function test_change_to_subdomain_rejects_a_base_outside_the_allowed_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'sites.example.net',
        ]])]);

        // CA: src/components/modal/SetYourDomainModal.vue:767
        // CA reads: src/components/modal/SetYourDomainModal.vue:768
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/change-domain/subdomain", [
                'subdomain' => 'shop',
                'domain' => 'evil.example',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain']);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT');
    }

    public function test_detected_by_url_returns_null_when_the_domain_serves_no_certificate(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Nothing answered the handshake: the Engine says `unreachable` and
        // has no public certificate, which the CA reads as "no SSL".
        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['data' => $this->engineSslCheck('site1.example.com', [], [
            'status' => 'unreachable',
            'public' => ['address' => TestNetwork::public(10), 'answered' => false, 'refused' => false, 'error' => 'Connection refused', 'certificate' => null],
        ])])]);

        // CA: src/components/cards/SecurityInfoCard.vue:199
        // CA reads: src/components/cards/SecurityInfoCard.vue:200-206
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/ssl/certificate/detected-by-url")
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_detected_by_url_falls_back_to_the_installed_certificate_before_engine_2_2(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Defensive (not an Engine shape): an Engine before 2.2.0 has no ssl-check route, the framework answers 404
            'engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['message' => 'Not Found'], 404),
            // Engine: core/app/Http/Controllers/User/DomainController.php:107 -> installed-ssl-cert
            'engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert' => Http::response(['data' => $this->engineSslCertificate()]),
        ]);

        // CA: src/components/cards/SecurityInfoCard.vue:199
        // CA reads: src/components/cards/SecurityInfoCard.vue:200-206
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/ssl/certificate/detected-by-url")
            ->assertOk()
            ->assertJsonPath('data.issuer_name', "Let's Encrypt")
            ->assertJsonPath('data.status', 'trusted');
    }

    public function test_domain_change_requires_authentication(): void
    {
        // CA: src/components/modal/SetYourDomainModal.vue:578
        $this->getJson('/api/projects/1/change-domain/options')->assertUnauthorized();
    }
}
