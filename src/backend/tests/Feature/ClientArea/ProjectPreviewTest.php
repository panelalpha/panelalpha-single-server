<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The three preview routes the Client Area once called into a raw 404
 * – the project preview, the WordPress admin preview SSO and
 * the app-user preview SSO – served through the project's Engine preview tunnel
 * where the Engine can, and refused with the old-style key-0 422
 * where WordPress would canonical-redirect the tunnel host.
 *
 * Since Engine commit `f72fec570` a `preview` tunnel forwards
 * the main domain as Host (`Integrations/Tunnels/PanelAlphaConnect.php:296`)
 * and keeps it in `details.target_domain` (`:322-324`), so every project kind
 * gets the preview, and only a tunnel whose target is the current main domain
 * is reused. The WordPress admin preview SSO is the WordPress
 * user SSO with its host swapped for the tunnel's.
 *
 * Contract:
 * - CA, preview: `PreviewSiteModal.vue:132` posts `/instances/{id}/preview` (no
 *   body; rewritten to `/projects`) and reads `response.data.data.preview_site`
 *   (`:134`) – its `url` (`:110`, `:115-118`) and, on the instance, its unix
 *   `valid_until` (`:151-153`, `isPreviewSiteExpired` `:122-126`) – and emits
 *   `response.data.data` (`:135`), which the project page turns into its
 *   instance (`views/instance/index.vue:434-439`); a refusal is an alert
 *   (`:137-141`, `apis/Api.js:80` shows key-0 errors alone).
 * - CA, WordPress preview SSO: `WpAdminSsoModal.vue:301` posts
 *   `/instances/{id}/sso-preview-url {user}` and reads `data.sso_url` (`:304`).
 * - CA, app-user preview SSO: `AppSsoModal.vue:298` posts
 *   `/instances/{id}/users/{userId}/sso-preview-url {user}` and reads
 *   `data.sso_url` (`:301`).
 * - Old: `packages/api/routes/api.php:221-222` (`general.preview_instance`,
 *   `PreviewSiteController::__invoke` → `InstanceResource` with
 *   `preview_site {temp_host, valid_until, url}`,
 *   `Resources/InstanceResource.php:248-268`), `:325-326`
 *   (`wordpress.create_sso_link`, `InstanceController::ssoPreviewUrl`,
 *   `SsoUrlRequest` `user` required), `:467-468` (`general.manage_users`,
 *   `Instance/UserController::ssoPreviewUrl:285-328`, the SSO URL's host
 *   swapped for the temporary host). Activity names `instance.wordpress.preview`,
 *   `instance.create_sso_preview_url`, `instance.user.create_sso_preview_url`.
 * - Engine (`dbb8b97ef`): `GET|POST E:/domains/{d}/tunnels`
 *   (`TunnelController.php:55-66`, `:151-172`), the project's synced
 *   `bandwidth` (no live `E:/usage` since Engine 2.2.0), `POST E:/app/users/{id}/sso`
 *   (`AppUserController.php:218-245`, bare `{url}`); `feat/wordpress`:
 *   `POST E:/wp/users/{user}/sso` (`core/routes/api.php:294`,
 *   `WpUserController::createSso:358-363`, `{data:{url}}` with
 *   `url = {siteurl}/?panelalpha_sso={token}`, `WordPress/Sso.php:48-50`;
 *   a failure is the WordPress status `{message}` or a 422 on `user`,
 *   `Wp/WordPressController.php:33-39`).
 *
 * 401/404/Engine-down are in `ProjectRouteMatrixTest`, 403 per route in
 * `PrivilegeAssignmentTest`.
 */
final class ProjectPreviewTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const TUNNELS = 'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels';

    /**
     * @param  list<array<string, mixed>>  $listed
     */
    private function fakeTunnels(array $listed = []): void
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
        ]);
    }

    private function customProject(User $user): Application
    {
        // Engine: core/app/Http/Resources/UserResource.php:96-109 -> bandwidth() (Engine 2.2.0)
        $application = $this->syncedApplication($user, 'site1', ['bandwidth' => ['month' => now('UTC')->format('Y-m'), 'used_bytes' => 27106703, 'limit_bytes' => -1, 'measured_at' => now('UTC')->toIso8601String()]]);
        $application->update(['type' => Application::TYPE_CUSTOM]);

        return $application;
    }

    private function containerProject(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
    }

    public function test_a_custom_project_gets_the_engine_preview_tunnel_in_the_old_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->customProject($user);
        $this->fakeTunnels();

        // CA: packages/client-area/src/components/modal/PreviewSiteModal.vue:132
        $response = $this->actingAs($user)->postJson("/api/projects/{$application->id}/preview");

        // CA reads: packages/client-area/src/components/modal/PreviewSiteModal.vue:134,110,153 (`preview_site.url`, `.valid_until` unix seconds)
        $response->assertOk()
            ->assertJsonPath('data.preview_site.temp_host', 'preview-a1b2c3d4.panelalpha.online')
            ->assertJsonPath('data.preview_site.valid_until', 1893456900)
            ->assertJsonPath('data.preview_site.url', 'https://preview-a1b2c3d4.panelalpha.online');
        // CA reads: packages/client-area/src/views/instance/index.vue:434-439 (the answer becomes the page's instance)
        $response->assertJsonPath('data.id', $application->id)
            ->assertJsonPath('data.url', 'https://site1.example.com')
            ->assertJsonPath('data.stats.bandwidth.usage', 27106703);
        $this->assertSame(['temp_host', 'valid_until', 'url'], array_keys((array) $response->json('data.preview_site')));

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels')
            && $request->data() === ['provider' => 'panelalpha', 'purpose' => 'preview', 'ttl_minutes' => 15]);
    }

    public function test_a_custom_project_preview_reuses_the_live_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->customProject($user);
        $this->fakeTunnels([$this->engineTunnel(['hostname' => 'preview-livelive.panelalpha.online'])]);

        // CA: packages/client-area/src/components/modal/PreviewSiteModal.vue:132
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/preview")
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/PreviewSiteModal.vue:134,110
            ->assertJsonPath('data.preview_site.url', 'https://preview-livelive.panelalpha.online');

        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST');
    }

    /**
     * @return array<string, array{0: string|null}>
     */
    public static function nonCustomTypes(): array
    {
        return [
            'WordPress' => [Application::TYPE_WORDPRESS],
            // A project whose type is not detected yet: the tunnel forwards the
            // domain whatever runs behind it, so it needs no kind.
            'not detected' => [null],
        ];
    }

    /**
     * The old WordPress refusal is gone – the tunnel forwards the main
     * domain as Host, so a WordPress (or not yet detected) project gets the
     * same tunnel and `preview_site` answer as a custom one.
     */
    #[DataProvider('nonCustomTypes')]
    public function test_a_wordpress_or_undetected_project_gets_the_preview_tunnel(?string $type): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->update(['type' => $type]);
        $this->fakeTunnels();

        // CA: packages/client-area/src/components/modal/PreviewSiteModal.vue:132
        $response = $this->actingAs($user)->postJson("/api/projects/{$application->id}/preview");

        // CA reads: packages/client-area/src/components/modal/PreviewSiteModal.vue:134,110,153 (`preview_site.url`, `.valid_until` unix seconds)
        $response->assertOk()
            ->assertJsonPath('data.preview_site.temp_host', 'preview-a1b2c3d4.panelalpha.online')
            ->assertJsonPath('data.preview_site.valid_until', 1893456900)
            ->assertJsonPath('data.preview_site.url', 'https://preview-a1b2c3d4.panelalpha.online');
        // CA reads: packages/client-area/src/views/instance/index.vue:434-439 (the answer becomes the page's instance)
        $response->assertJsonPath('data.id', $application->id);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels')
            && $request->data() === ['provider' => 'panelalpha', 'purpose' => 'preview', 'ttl_minutes' => 15]);
    }

    /**
     * A listed preview the panel may not reuse – it would not
     * forward the main domain as Host.
     *
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function staleTunnels(): array
    {
        return [
            // A preview created before `f72fec570` keeps forwarding its own
            // name until it expires; the Engine wrote no `target_domain`
            // (PanelAlphaConnect.php:318-321 on the earlier ref).
            'created by an older Engine' => [['purpose' => 'preview', 'expires_at' => '2030-01-01T00:15:00+00:00', 'path' => 'preview-oldoldol', 'target_ip' => TestNetwork::public(10)]],
            // Defensive (not an Engine shape): the Engine's rename replaces the
            // domain row and its tunnels cascade, so a listed target naming
            // another domain is only a guard for a main-domain change.
            'previewing another domain' => [['purpose' => 'preview', 'expires_at' => '2030-01-01T00:15:00+00:00', 'path' => 'preview-oldoldol', 'target_ip' => TestNetwork::public(10), 'target_domain' => 'old.example.com']],
        ];
    }

    /**
     * @param  array<string, mixed>  $details
     */
    #[DataProvider('staleTunnels')]
    public function test_a_stale_preview_tunnel_is_not_reused(array $details): void
    {
        $user = User::factory()->create();
        $application = $this->customProject($user);
        $this->fakeTunnels([$this->engineTunnel(['hostname' => 'preview-oldoldol.panelalpha.online', 'details' => $details])]);

        // CA: packages/client-area/src/components/modal/PreviewSiteModal.vue:132
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/preview")
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/PreviewSiteModal.vue:134,110
            ->assertJsonPath('data.preview_site.url', 'https://preview-a1b2c3d4.panelalpha.online');

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels')
            && $request->data() === ['provider' => 'panelalpha', 'purpose' => 'preview', 'ttl_minutes' => 15]);
    }

    /**
     * The Engine writes the target lower-cased
     * (`PanelAlphaConnect.php:296`) while the project's domain keeps the case
     * it was created with, so a live preview of `Site1.example.com` is reused.
     */
    public function test_a_preview_tunnel_whose_target_differs_only_in_case_is_reused(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['domain' => 'Site1.example.com']);
        $application->update(['type' => Application::TYPE_WORDPRESS]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/TunnelController.php:55-66 -> index()
            'engine.example.com/api/projects/site1/domains/Site1.example.com/tunnels' => Http::response(['data' => [
                $this->engineTunnel(['hostname' => 'preview-livelive.panelalpha.online', 'domain' => 'Site1.example.com']),
            ]]),
        ]);

        // CA: packages/client-area/src/components/modal/PreviewSiteModal.vue:132
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/preview")
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/PreviewSiteModal.vue:134,110
            ->assertJsonPath('data.preview_site.url', 'https://preview-livelive.panelalpha.online');

        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST');
    }

    /**
     * The old WordPress refusal is gone – the WordPress user SSO the
     * `/sso-url` route asks for, served on the preview tunnel's host.
     */
    public function test_the_wordpress_preview_sso_is_served_through_the_preview_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->update(['type' => Application::TYPE_WORDPRESS]);
        $this->fakeTunnels();
        Http::fake([
            // Engine: core/app/System/Project/PhpHosting/WordPress/Sso.php:48-50 -> create() via Wp/WordPressController.php:34 ({data:{url}}, the siteurl host)
            'engine.example.com/api/projects/site1/wp/users/1/sso' => Http::response(['data' => ['url' => 'https://site1.example.com/?panelalpha_sso=1893456960_'.str_repeat('a', 64)]]),
        ]);

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:301
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/sso-preview-url", ['user' => 1])
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/WpAdminSsoModal.vue:304,310 (`response.data.data.sso_url`)
            ->assertExactJson(['data' => ['sso_url' => 'https://preview-a1b2c3d4.panelalpha.online/?panelalpha_sso=1893456960_'.str_repeat('a', 64)]]);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/wp/users/1/sso'));
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels')
            && $request->data() === ['provider' => 'panelalpha', 'purpose' => 'preview', 'ttl_minutes' => 15]);
    }

    /**
     * The WordPress SSO exists only on `feat/wordpress`; where the
     * Engine cannot make it, the preview route fails exactly as `/sso-url`
     * does, with no refusal of its own.
     */
    public function test_the_wordpress_preview_sso_fails_like_the_wordpress_sso(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->update(['type' => Application::TYPE_WORDPRESS]);
        $this->fakeTunnels();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:38 -> a non-WordPress failure as a 422 on `user` (WpUserController.php:17-20)
            'engine.example.com/api/projects/site1/wp/users/1/sso' => Http::response(['message' => 'Error: This does not seem to be a WordPress installation.', 'errors' => ['user' => ['Error: This does not seem to be a WordPress installation.']]], 422),
        ]);

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:272
        $plain = $this->actingAs($user)->postJson("/api/projects/{$application->id}/sso-url", ['user' => 1]);
        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:301
        $preview = $this->actingAs($user)->postJson("/api/projects/{$application->id}/sso-preview-url", ['user' => 1]);

        $this->assertSame(422, $plain->status());
        $this->assertSame($plain->status(), $preview->status());
        $this->assertSame($plain->json(), $preview->json());
    }

    public function test_the_wordpress_preview_sso_keeps_the_old_user_rule(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:301 (no user picked)
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/sso-preview-url", [])
            // CA reads: packages/client-area/src/apis/Api.js:80 (field errors are prefixed with the field)
            ->assertStatus(422)
            ->assertJsonValidationErrors('user');
    }

    public function test_an_app_user_preview_sso_is_served_through_the_preview_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->containerProject($user);
        $this->fakeTunnels();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/AppUserController.php:236-237 -> ssoResponse() (a path on the primary domain)
            'engine.example.com/api/projects/site1/app/users/2/sso' => Http::response(['url' => 'https://site1.example.com/admin/sso?token=abc']),
        ]);

        // CA: packages/client-area/src/components/modal/AppSsoModal.vue:298
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/users/2/sso-preview-url", ['user' => '2'])
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/AppSsoModal.vue:301
            ->assertJsonPath('data.sso_url', 'https://preview-a1b2c3d4.panelalpha.online/admin/sso?token=abc');

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/app/users/2/sso'));
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains/site1.example.com/tunnels'));
    }

    /**
     * The app-user SSO URL is a path on the primary domain
     * (`AppUserController.php:236-237` at `f72fec570`) and a container's
     * routing is keyed by that domain, which the `f72fec570` preview tunnel
     * forwards as Host (`PanelAlphaConnect.php:296`): the SSO is served on the
     * domain-forwarding tunnel, not on a longer-lived preview created before
     * `f72fec570` that still forwards its own name.
     */
    public function test_an_app_user_preview_sso_is_served_on_the_domain_forwarding_tunnel(): void
    {
        $user = User::factory()->create();
        $application = $this->containerProject($user);
        $this->fakeTunnels([
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
        Http::fake([
            // Engine: core/app/Http/Controllers/User/AppUserController.php:236-237 -> ssoResponse() (a path on the primary domain)
            'engine.example.com/api/projects/site1/app/users/2/sso' => Http::response(['url' => 'https://site1.example.com/admin/sso?token=abc']),
        ]);

        // CA: packages/client-area/src/components/modal/AppSsoModal.vue:298
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/users/2/sso-preview-url", ['user' => '2'])
            ->assertOk()
            // CA reads: packages/client-area/src/components/modal/AppSsoModal.vue:301
            ->assertJsonPath('data.sso_url', 'https://preview-newnewne.panelalpha.online/admin/sso?token=abc');

        Http::assertNotSent(static fn (Request $request): bool => $request->method() === 'POST'
            && str_contains($request->url(), '/tunnels'));
    }

    public function test_an_app_user_preview_sso_on_a_classic_project_is_refused_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->configureEngine();
        Http::fake();

        // CA: packages/client-area/src/components/modal/AppSsoModal.vue:298
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/users/2/sso-preview-url", ['user' => '2'])
            ->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_the_preview_routes_record_the_old_activity_names(): void
    {
        $this->assertSame('user.instance.wordpress.preview', ActivityActionMap::for('client-area.projects.preview'));
        $this->assertSame('user.instance.create_sso_preview_url', ActivityActionMap::for('client-area.projects.sso_preview_url'));
        $this->assertSame('user.instance.user.create_sso_preview_url', ActivityActionMap::for('client-area.projects.users.sso_preview_url'));
    }
}
