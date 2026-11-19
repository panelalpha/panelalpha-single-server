<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Hub\Go\GoToken;
use PanelAlpha\Hub\HubPairing;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * PanelAlpha Go's catalog for the onboarding's "Deploy with Go!"
 * (`/api/community/go`): the Hub token stays on the server, is
 * kept until five minutes before it ends, and a token Go refuses is asked for
 * again once.
 */
class GoCatalogTest extends TestCase
{
    use RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const GO = 'https://go.test';

    private const SECRET = 'the-server-secret';

    private const CREDENTIAL = self::HUB.'/api/panel/v1/credential';

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB, 'hub.go_url' => self::GO]);
        Cache::flush();
    }

    private function signedIn(): static
    {
        return $this->actingAs(User::factory()->create());
    }

    private function pair(): void
    {
        app(HubPairing::class)->store('srv_1', self::SECRET, self::HUB, 'Acme', 'http://'.TestNetwork::LOOPBACK.':9080');
    }

    /**
     * A PanelAlpha Hub credential answer (hub-connect-contract §10).
     *
     * @return array{token: string, expires_at: string}
     */
    private function credential(string $token, int $seconds = 3600): array
    {
        return ['token' => $token, 'expires_at' => now()->addSeconds($seconds)->toIso8601String()];
    }

    /**
     * One app of Go's `/apps` (panelalpha-go docs/operating-go/catalog-api.md).
     *
     * @return array<string, mixed>
     */
    private function goApp(string $slug): array
    {
        return [
            'slug' => $slug,
            'name' => ucfirst($slug),
            'tagline' => 'A note-taking app',
            'categories' => ['Notes'],
            'repository' => 'https://github.com/usememos/'.$slug,
            'page_url' => self::GO.'/repo/github.com/usememos/'.$slug,
            'icon_url' => 'https://avatars.githubusercontent.com/u/1',
            'cover_url' => null,
            'verified' => '2026-11-10',
            'tried_30_days' => 12,
            'ready_image' => false,
            'stars' => 41250,
            'stars_updated_at' => '2026-11-17T09:30:00Z',
            'replaces' => ['Google Keep', 'Notion'],
            'internal_note' => 'not for the browser',
        ];
    }

    public function test_an_unpaired_panel_is_not_connected_and_calls_nobody(): void
    {
        Http::fake();

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go')
            ->assertOk()
            ->assertExactJson(['connected' => false, 'available' => false]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps')
            ->assertStatus(409)
            ->assertJsonPath('reason', 'hub_not_connected');

        Http::assertNothingSent();
    }

    public function test_the_catalog_needs_a_signed_in_user(): void
    {
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps')->assertUnauthorized();
    }

    public function test_apps_are_read_with_a_signed_hub_token_that_never_reaches_the_browser(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::response($this->credential('jwt-1')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/apps*' => Http::response([
                'data' => [$this->goApp('memos')],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 24, 'total' => 1],
            ]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $response = $this->signedIn()->getJson('/api/community/go/apps?q=notes&category=Notes&page=1')
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'memos')
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.stars', 41250)
            ->assertJsonPath('data.0.stars_updated_at', '2026-11-17T09:30:00Z')
            ->assertJsonPath('data.0.replaces', ['Google Keep', 'Notion'])
            ->assertJsonMissingPath('data.0.internal_note');
        $this->assertStringNotContainsString('jwt-1', (string) $response->getContent());

        Http::assertSent(function (Request $r): bool {
            if ($r->url() !== self::CREDENTIAL) {
                return false;
            }
            $canonical = implode("\n", ['POST', 'api/panel/v1/credential', $r->header('X-Timestamp')[0], hash('sha256', $r->body())]);

            return $r['purpose'] === 'go'
                && $r->header('X-Server-Id') === ['srv_1']
                && $r->header('X-Signature') === [hash_hmac('sha256', $canonical, self::SECRET)];
        });
        Http::assertSent(fn (Request $r): bool => str_starts_with($r->url(), self::GO.'/api/catalog/v1/apps?')
            && $r->header('Authorization') === ['Bearer jwt-1']
            && $r['q'] === 'notes'
            && $r['category'] === 'Notes');
    }

    public function test_the_token_is_kept_until_five_minutes_before_it_ends(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::sequence()
                // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
                ->push($this->credential('jwt-1'))
                // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
                ->push($this->credential('jwt-2')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/apps/*' => Http::response(['data' => $this->goApp('memos')]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/apps/memos')->assertOk();
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps/memos')->assertOk();
        Http::assertSentCount(3);

        // 54 minutes later the token has less than five minutes left: the Hub is asked again.
        $this->travel(56)->minutes();
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps/memos')->assertOk();

        Http::assertSentCount(5);
        $this->assertSame(
            ['Bearer jwt-1', 'Bearer jwt-1', 'Bearer jwt-2'],
            Http::recorded(fn (Request $r): bool => str_starts_with($r->url(), self::GO))
                ->map(fn (array $pair): string => $pair[0]->header('Authorization')[0])
                ->values()
                ->all(),
        );
    }

    public function test_a_token_go_refuses_is_asked_for_again_once(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::sequence()
                // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
                ->push($this->credential('jwt-old'))
                // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
                ->push($this->credential('jwt-new')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/apps/*' => Http::sequence()
                // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
                ->push(['message' => 'Unauthenticated. The token has expired.'], 401)
                // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
                ->push(['data' => $this->goApp('memos') + [
                    'description' => 'Memos is a note-taking app.',
                    'install' => ['source' => 'git', 'git_repo' => 'https://github.com/usememos/memos', 'git_branch' => null,
                        'template' => 'dind', 'memory_mb' => 2048, 'disk_mb' => 20480],
                    'release' => null,
                ]]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/apps/memos')
            ->assertOk()
            ->assertJsonPath('data.install.git_repo', 'https://github.com/usememos/memos')
            ->assertJsonPath('data.install.template', 'dind')
            ->assertJsonPath('data.description', 'Memos is a note-taking app.');

        Http::assertSent(fn (Request $r): bool => $r->url() === self::GO.'/api/catalog/v1/apps/memos'
            && $r->header('Authorization') === ['Bearer jwt-new']);
    }

    public function test_a_hub_that_forgot_the_pairing_disconnects_the_panel(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
        Http::fake([self::CREDENTIAL => Http::response(['message' => 'Unknown server.'], 401)]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/categories')
            ->assertStatus(409)
            ->assertJsonPath('reason', 'hub_not_connected');

        $this->assertFalse(app(HubPairing::class)->isPaired());
    }

    public function test_a_go_outage_is_catalog_unavailable_and_never_a_server_error(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::response($this->credential('jwt-1')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/me' => Http::response(['message' => 'Off.'], 503),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/categories' => Http::response(['message' => 'Off.'], 503),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/apps/*' => Http::response(['message' => 'Not found.'], 404),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go')
            ->assertOk()
            ->assertExactJson(['connected' => true, 'available' => false]);
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/categories')
            ->assertStatus(503)
            ->assertJsonPath('reason', 'go_unavailable');
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps/nothing-here')
            ->assertNotFound()
            ->assertJsonPath('reason', 'go_unavailable');
    }

    public function test_the_hub_being_down_is_catalog_unavailable(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
        Http::fake([self::CREDENTIAL => Http::response('Bad gateway', 502)]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/categories')
            ->assertStatus(503)
            ->assertJsonPath('reason', 'go_unavailable');
        $this->assertTrue(app(HubPairing::class)->isPaired());
    }

    public function test_the_status_names_the_plan_and_its_entitlements(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::response($this->credential('jwt-1')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/me' => Http::response(['data' => [
                'account' => 'acc_42', 'connection' => 'srv_1', 'plan' => 'free', 'token_expires_at' => now()->addHour()->toIso8601String(),
                'entitlements' => ['catalog' => true, 'ready_images' => false],
            ]]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go')
            ->assertOk()
            ->assertExactJson([
                'connected' => true,
                'available' => true,
                'plan' => 'free',
                'entitlements' => ['catalog' => true, 'ready_images' => false],
            ]);
    }

    public function test_the_apps_come_in_the_order_go_knows_and_no_other(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::response($this->credential('jwt-1')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/apps*' => Http::response([
                'data' => [$this->goApp('memos')],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 24, 'total' => 1],
            ]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/apps?sort=popular')->assertUnprocessable()->assertJsonValidationErrors('sort');
        Http::assertNothingSent();

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps?sort=verified&category=Notes')->assertOk()->assertJsonPath('data.0.slug', 'memos');
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/apps?sort=tried&category=Notes')->assertOk();

        // Each order is its own list: two calls to Go, not one kept for both.
        Http::assertSent(fn (Request $r): bool => str_starts_with($r->url(), self::GO.'/api/catalog/v1/apps?')
            && $r['sort'] === 'verified' && $r['category'] === 'Notes');
        Http::assertSent(fn (Request $r): bool => str_starts_with($r->url(), self::GO.'/api/catalog/v1/apps?') && $r['sort'] === 'tried');
    }

    public function test_search_needs_two_characters_and_is_kept_for_a_few_minutes(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            self::CREDENTIAL => Http::response($this->credential('jwt-1')),
            // Defensive (not an Engine shape): a PanelAlpha Go catalog reply, see panelalpha-go docs/operating-go/catalog-api.md
            self::GO.'/api/catalog/v1/search*' => Http::response([
                'data' => [$this->goApp('memos')],
                'meta' => ['query' => 'memo', 'total' => 1, 'limit' => 8],
            ]),
        ]);

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/search?q=m')->assertUnprocessable();

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/search?q=memo&limit=8')->assertOk()->assertJsonPath('data.0.slug', 'memos');
        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->getJson('/api/community/go/search?q=memo&limit=8')->assertOk();

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $r): bool => str_starts_with($r->url(), self::GO.'/api/catalog/v1/search?')
            && $r['q'] === 'memo' && (int) $r['limit'] === 8);
    }

    public function test_a_slug_that_is_no_slug_never_reaches_go(): void
    {
        $this->pair();
        Http::fake();

        // CA: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        // CA reads: src/components/onboarding/OnboardingChooseInstallationTypeModal.vue:95 (the PanelAlpha Go source; its catalog is new, called by the new CA's views/onboarding/go/go-catalog.api.ts)
        $this->signedIn()->getJson('/api/community/go/apps/'.rawurlencode('../me'))->assertNotFound();

        Http::assertNothingSent();
    }

    public function test_forgetting_the_token_asks_the_hub_again(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
        Http::fake([self::CREDENTIAL => Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            ->push($this->credential('jwt-1'))
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md §10
            ->push($this->credential('jwt-2'))]);

        $token = app(GoToken::class);
        $this->assertSame('jwt-1', $token->get());
        $this->assertSame('jwt-1', $token->get());
        $token->forget();
        $this->assertSame('jwt-2', $token->get());
    }
}
