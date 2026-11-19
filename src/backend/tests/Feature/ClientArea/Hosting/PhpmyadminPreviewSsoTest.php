<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\PreviewSsoController;
use PanelAlpha\ClientArea\Http\Requests\Hosting\PhpmyadminPreviewSsoRequest;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * phpMyAdmin preview SSO, served from the Engine's preview tunnels (it moved
 * out of client-area-legacy, and the panel's `preview_tunnels` cache is retired).
 *
 * Contract:
 * - CA: `PhpMyAdminSsoModal.vue:148-152` picks the preview endpoint when the
 *   phpMyAdmin host does not resolve (`PHPMyAdminMixin.js:152-159`), posts
 *   `{database_id?}` (`:160-164`) and reads `response.data.data.url` (`:165`);
 *   a refusal is an alert through `apis/Api.js:80` (key 0 shows the message).
 * - Old: `packages/api/routes/api.php:571-572` (`hosting.phpmyadmin_sso`),
 *   `ServerAccount/MysqlController.php:90-143`, `Models/Domain.php:1377-1458`
 *   (15 min temporary domain, cached while `valid_until` is in the future).
 * - Engine (`dbb8b97ef`): `GET E:/domains/{d}/tunnels` →
 *   `TunnelController::index` (`TunnelController.php:55-66`, expired tunnels
 *   omitted, `{data:[TunnelResource]}`); `POST …/tunnels {provider, purpose,
 *   ttl_minutes}` → `TunnelController::store` (`:151-172`, no `hostname` →
 *   allocated `preview-<8>` label, 201 `{data:TunnelResource}`, 409
 *   `tunnel_hostname_unavailable` after five taken labels,
 *   `Exceptions/Handler.php:91-94`); `POST E:/mysql/phpmyadmin-sso-token` →
 *   `MysqlController::createPhpmyadminSsoToken` (`{data:{url}}`).
 * - Engine `f72fec570`: a `preview` tunnel forwards
 *   `Host: <main domain>` (`Integrations/Tunnels/PanelAlphaConnect.php:296`,
 *   target in `details.target_domain`, `:322-324`) and is no longer one of the
 *   domain's vhost names (`Models/Domain.php:315`). The token URL is
 *   `https://<main domain>/phpmyadmin/signon.php?pmassotoken=…`
 *   (`MysqlController.php:72`) and every domain's vhost serves `/phpmyadmin`
 *   (`:131`), so the request the tunnel forwards reaches the main domain's
 *   vhost with the Host the token URL named: phpMyAdmin needs no self-named
 *   tunnel.
 */
final class PhpmyadminPreviewSsoTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const TUNNELS = 'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels';

    private const TOKEN = 'engine.example.com/api/projects/site1/mysql/phpmyadmin-sso-token';

    /**
     * @param  list<array<string, mixed>>  $listed
     */
    private function fakePreviewEngine(array $listed = []): void
    {
        $created = $this->engineTunnel();

        Http::fake([
            self::TUNNELS => function (Request $request) use ($listed, $created) {
                if ($request->method() === 'GET') {
                    // Engine: core/app/Http/Controllers/User/TunnelController.php:55-66 -> index()
                    return Http::response(['data' => $listed]);
                }

                // Engine: core/app/Http/Controllers/User/TunnelController.php:151-172 -> store()
                return Http::response(['data' => $created], 201);
            },
            // Engine: core/app/Http/Controllers/User/MysqlController.php:65-86 -> createPhpmyadminSsoToken()
            self::TOKEN => Http::response([
                'data' => ['url' => 'https://site1.example.com/phpmyadmin/signon.php?pmassotoken=xyz'],
            ]),
        ]);
    }

    public function test_preview_sso_creates_an_engine_preview_tunnel_and_swaps_the_host(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->fakePreviewEngine();

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $response = $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url");

        // CA reads: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:165
        $response->assertOk()->assertJsonPath(
            'data.url',
            'https://preview-a1b2c3d4.panelalpha.online/phpmyadmin/signon.php?pmassotoken=xyz',
        );

        // The Engine allocates the label: no `hostname` is sent, and the tunnel
        // is a `preview` one with the old 15 minute lifetime.
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels')
            && $request->data() === ['provider' => 'panelalpha', 'purpose' => 'preview', 'ttl_minutes' => 15]);
        Http::assertSent(static fn (Request $request): bool => str_ends_with($request->url(), '/projects/site1/mysql/phpmyadmin-sso-token'));

        // The panel keeps no tunnel cache any more.
        $this->assertFalse(Schema::hasTable('preview_tunnels'));
    }

    public function test_preview_sso_reuses_the_live_preview_tunnel_the_engine_lists(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->fakePreviewEngine([
            $this->engineTunnel(['hostname' => 'preview-zzzzzzzz.panelalpha.online', 'valid_until' => now()->addMinutes(3)->toIso8601String()]),
            $this->engineTunnel(['hostname' => 'preview-yyyyyyyy.panelalpha.online', 'valid_until' => now()->addMinutes(12)->toIso8601String()]),
        ]);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url")
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:165
            ->assertJsonPath('data.url', 'https://preview-yyyyyyyy.panelalpha.online/phpmyadmin/signon.php?pmassotoken=xyz');

        // The list answered: no second tunnel is created – the list and the
        // token are the only calls; the longest-lived tunnel is served.
        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST' && str_contains($request->url(), '/tunnels'));
        Http::assertSentCount(2);
    }

    /**
     * PhpMyAdmin is served on the domain-forwarding preview
     * tunnel (the `f72fec570` shape), not on a longer-lived preview created
     * before `f72fec570` that still forwards its own name: the host swapped out of
     * the token URL is the one the served tunnel forwards.
     */
    public function test_preview_sso_is_served_on_the_domain_forwarding_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->fakePreviewEngine([
            $this->engineTunnel([
                'hostname' => 'preview-oldoldol.panelalpha.online',
                'valid_until' => now()->addMinutes(14)->toIso8601String(),
                'details' => ['purpose' => 'preview', 'expires_at' => now()->addMinutes(14)->toIso8601String(), 'path' => 'preview-oldoldol', 'target_ip' => TestNetwork::public(10)],
            ]),
            $this->engineTunnel([
                'hostname' => 'preview-newnewne.panelalpha.online',
                'valid_until' => now()->addMinutes(10)->toIso8601String(),
            ]),
        ]);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $response = $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url");

        // CA reads: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:165
        $response->assertOk()->assertJsonPath(
            'data.url',
            'https://preview-newnewne.panelalpha.online/phpmyadmin/signon.php?pmassotoken=xyz',
        );
        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST' && str_contains($request->url(), '/tunnels'));
    }

    /**
     * A `default` tunnel never expires and is never served as the
     * temporary preview; a preview tunnel past its `valid_until` is not live.
     *
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function notLiveTunnels(): array
    {
        return [
            // A `default` tunnel given a `ttl_minutes` has a lifetime too
            // (TunnelController.php:179-186); it is still not a preview.
            'default purpose' => [['purpose' => 'default', 'valid_until' => '2030-01-01T00:15:00+00:00']],
            'expired preview' => [['valid_until' => '2020-01-01T00:00:00+00:00']],
            'preview without a lifetime' => [['valid_until' => null]],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('notLiveTunnels')]
    public function test_preview_sso_creates_a_tunnel_when_the_listed_one_is_not_a_live_preview(array $overrides): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        // Defensive (not an Engine shape): the Engine omits an expired tunnel from its list; the others are real.
        $this->fakePreviewEngine([$this->engineTunnel(['hostname' => 'preview-00000000.panelalpha.online'] + $overrides)]);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url")
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:165
            ->assertJsonPath('data.url', 'https://preview-a1b2c3d4.panelalpha.online/phpmyadmin/signon.php?pmassotoken=xyz');

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/tunnels'));
    }

    public function test_preview_sso_answers_the_old_refusal_when_the_engine_finds_no_free_label(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        Http::fake([
            self::TUNNELS => function (Request $request) {
                if ($request->method() === 'GET') {
                    // Engine: core/app/Http/Controllers/User/TunnelController.php:55-66 -> index()
                    return Http::response(['data' => []]);
                }

                // Engine: core/app/Exceptions/Handler.php:91-94 -> TunnelHostnameUnavailableException as 409 {message, code}
                return Http::response([
                    'message' => 'Could not allocate a free preview hostname under *.panelalpha.online after 5 attempts.',
                    'code' => 'tunnel_hostname_unavailable',
                ], 409);
            },
        ]);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $response = $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url");

        // CA reads: packages/client-area/src/apis/Api.js:80 (key-0 errors show the bare message)
        $response->assertStatus(422)->assertJsonPath('errors.0.0', 'Could not create temporary site URL');
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/phpmyadmin-sso-token'));
    }

    /**
     * A failed list call is never "no tunnel": it bubbles before any create,
     * so an Engine hiccup cannot leave a second tunnel behind.
     *
     * @return array<string, array{0: \Closure(): mixed, 1: int}>
     */
    public static function listHiccups(): array
    {
        return [
            'connection error' => [static fn () => throw new ConnectionException('down'), 503],
            // Engine: core/app/Http/Controllers/User/TunnelController.php:55 -> index() failing with a 500
            'engine 5xx' => [static fn () => Http::response(['message' => 'Server Error'], 500), 502],
        ];
    }

    /**
     * @param  \Closure(): mixed  $answer
     */
    #[DataProvider('listHiccups')]
    public function test_a_failed_tunnel_list_bubbles_without_a_create(\Closure $answer, int $status): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        // Engine: core/app/Http/Controllers/User/TunnelController.php:55 -> index() unreachable or failing (listHiccups)
        Http::fake([self::TUNNELS => $answer]);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url")
            ->assertStatus($status);

        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST');
    }

    public function test_preview_sso_refuses_a_concurrent_create(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->configureEngine();
        Http::fake();

        $lock = Cache::lock(PreviewTunnelService::lockKey($application->id), PreviewTunnelService::lockSeconds());
        $this->assertTrue($lock->get());

        try {
            // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
            $response = $this->actingAs($user)
                ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url");

            // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
            $response->assertStatus(422)
                ->assertJsonPath('errors.0.0', 'A preview tunnel is already being created for this project. Try again in a moment.');

            // The held lock was the only reason: no Engine tunnel call was made.
            Http::assertNothingSent();
        } finally {
            $lock->release();
        }
    }

    public function test_the_lock_outlasts_the_tunnel_list_and_the_create(): void
    {
        // Two Engine calls (the list and the create) with `engine_timeout`
        // each, plus the margin; the Engine retries a taken label itself, so
        // the panel's five create attempts are gone. Pinned as literals.
        config(['client-area.engine_timeout' => 30]);

        $this->assertSame(15, PreviewTunnelService::TTL_MINUTES);
        $this->assertSame(30, PreviewTunnelService::LOCK_MARGIN_SECONDS);
        $this->assertSame(90, PreviewTunnelService::lockSeconds());
    }

    public function test_a_project_without_a_main_domain_gets_the_old_refusal(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->forceFill(['domain' => ''])->save();
        Http::fake();

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url")
            // CA reads: packages/client-area/src/apis/Api.js:80 (key-0 errors show the bare message)
            ->assertStatus(422)->assertJsonPath('errors.0.0', 'Could not create temporary site URL');

        Http::assertNothingSent();
    }

    public function test_preview_sso_requires_the_phpmyadmin_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->denyPrivilege('hosting.phpmyadmin_sso');

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-preview-sso-url")
            ->assertForbidden();
    }

    public function test_preview_sso_requires_authentication(): void
    {
        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->postJson('/api/server-accounts/1/mysql/phpmyadmin-preview-sso-url')->assertUnauthorized();
    }

    public function test_preview_sso_is_404_for_an_unknown_project(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user);

        // CA: packages/client-area/src/components/modal/PhpMyAdminSsoModal.vue:164
        $this->actingAs($user)->postJson('/api/server-accounts/999/mysql/phpmyadmin-preview-sso-url')->assertNotFound();
    }

    /**
     * The route, the controller, the request and the service are
     * controller code (no `@legacy` marker), and the route keeps its stack.
     */
    public function test_the_preview_sso_is_controller_code_with_the_same_route_stack(): void
    {
        $route = $this->app['router']->getRoutes()->getByName('client-area.hosting.mysql.phpmyadmin_preview_sso');

        $this->assertNotNull($route);
        $this->assertSame(PreviewSsoController::class.'@phpmyadminPreviewSso', $route->getActionName());
        $this->assertSame(['api', 'auth', 'activity', 'privilege:hosting.phpmyadmin_sso'], $route->gatherMiddleware());
        $this->assertSame('api/server-accounts/{application}/mysql/phpmyadmin-preview-sso-url', $route->uri());

        foreach ([PreviewTunnelService::class, PreviewSsoController::class, PhpmyadminPreviewSsoRequest::class] as $class) {
            $file = (string) (new \ReflectionClass($class))->getFileName();
            $this->assertStringContainsString('/packages/client-area/src/', $file);
            $this->assertStringNotContainsString('@legacy', (string) file_get_contents($file));
        }
    }
}
