<?php

namespace Tests\Feature\ClientArea;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use PanelAlpha\ClientArea\Http\Controllers\Project\CollaborationLinkController;
use PanelAlpha\ClientArea\Projects\AtarimCollaborationLink;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Atarim collaboration link.
 *
 * CA: `CollaborationLinkMixin.js:12` calls `/instances/{id}/collaboration-link`
 * (axios rewrites `/instances` to `/projects` in single-server mode) and reads
 * `result.data.url` (`:14`). The button is gated on
 * `app.integrations.atarim_enabled` (`store/store.js:262-264`,
 * `InstanceTopBar.vue:104`).
 *
 * Old: `packages/api/routes/api.php:450`, `CollaborateController.php:29-53`,
 * `Atarim.php:62-84` (panel-built URL, no Engine call).
 *
 * The route and controller moved into client-area-legacy. The settings stay in the host's `settings`
 * table: the host binds them as the controller's `AtarimSettings`, the link
 * reads only that value, and `/home` keeps reading the host side.
 *
 * The collaboration link is a Client Area feature, so the route
 * file, the controller and `AtarimCollaborationLink` moved on from legacy into
 * client-area. Method, URI, middleware and every answer below are
 * unchanged; only the action and the route name differ.
 */
class CollaborationLinkTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function enableAtarim(): void
    {
        Setting::set('atarim-enabled', '1');
        Setting::set('atarim-link', 'https://app.atarim.io/signup?ref=ref123');
    }

    public function test_collaboration_link_is_built_from_the_panel_settings(): void
    {
        $this->enableAtarim();
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
        ]);
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link");

        $response->assertOk();

        // CA reads: packages/client-area/src/mixins/CollaborationLinkMixin.js:14
        $url = $response->json('url');
        $this->assertIsString($url);

        $parts = parse_url($url);
        $this->assertSame('https', $parts['scheme'] ?? null);
        $this->assertSame('app.atarim.io', $parts['host'] ?? null);
        $this->assertSame('/fetching', $parts['path'] ?? null);

        parse_str((string) ($parts['query'] ?? ''), $query);
        $this->assertSame('ref123', $query['_from'] ?? null);
        $this->assertSame('user@example.com', $query['email'] ?? null);
        $this->assertSame('https://site1.example.com', $query['url'] ?? null);
        $this->assertSame('one-click', $query['type'] ?? null);
        $this->assertStringContainsString('/api/logo.png', $query['logo'] ?? '');
        $this->assertSame('Ada', $query['first_name'] ?? null);
        $this->assertSame('Lovelace', $query['last_name'] ?? null);
    }

    public function test_collaboration_link_logo_uses_the_stored_panel_url(): void
    {
        $this->enableAtarim();
        Setting::set('userapp.url', 'https://new.example.com');
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link");

        $response->assertOk();

        // CA reads: packages/client-area/src/mixins/CollaborationLinkMixin.js:14
        $url = $response->json('url');
        $this->assertIsString($url);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertSame('https://new.example.com/api/logo.png', $query['logo'] ?? null);
    }

    public function test_collaboration_link_encodes_plus_and_ampersand_in_the_email(): void
    {
        // The old panel built the query with `http_build_query`
        // (packages/api/app/Lib/Integrations/Atarim.php:83), so a `+` in the
        // email must reach Atarim percent-encoded (`%2B`) and a `&` as `%26`,
        // not as a space or as a second query parameter.
        $this->enableAtarim();
        $user = User::factory()->create([
            'email' => 'ada+tag&co@example.com',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
        ]);
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link");

        $response->assertOk();

        // CA reads: packages/client-area/src/mixins/CollaborationLinkMixin.js:14
        $url = $response->json('url');
        $this->assertIsString($url);
        $this->assertStringContainsString('email=ada%2Btag%26co%40example.com', $url);

        $parts = parse_url($url);
        parse_str((string) ($parts['query'] ?? ''), $query);
        $this->assertSame('ada+tag&co@example.com', $query['email'] ?? null);
    }

    public function test_collaboration_link_is_422_when_the_integration_is_disabled(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link");

        // CA reads: packages/client-area/src/apis/Api.js:77 (numeric error keys show the message alone)
        $response->assertStatus(422)
            ->assertJsonPath('errors.0.0', 'Integration is disabled');
    }

    public function test_collaboration_link_requires_the_collaboration_privilege(): void
    {
        $this->enableAtarim();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->denyPrivilege('general.collaboration');

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link")
            ->assertForbidden();
    }

    public function test_collaboration_link_requires_authentication(): void
    {
        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $this->getJson('/api/projects/1/collaboration-link')->assertUnauthorized();
    }

    public function test_unknown_application_is_404(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:136 -> listAll()
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/999/collaboration-link')
            ->assertNotFound();
    }

    public function test_the_route_is_a_controller_route_with_the_host_middleware(): void
    {
        $route = Route::getRoutes()->getByName('client-area.projects.collaboration_link');

        $this->assertNotNull($route);
        $this->assertSame(['GET', 'HEAD'], $route->methods());
        $this->assertSame('api/projects/{application}/collaboration-link', $route->uri());
        $this->assertSame(CollaborationLinkController::class, $route->getActionName());
        // The host's stack: `api`, `auth` and the old privilege, no `activity`.
        $this->assertSame(['api', 'auth', 'privilege:general.collaboration'], $route->gatherMiddleware());
        $this->assertSame(['application' => '[0-9]+'], $route->wheres);

        $this->assertNull(Route::getRoutes()->getByName('client-area-legacy.projects.collaboration_link'));
        $this->assertFalse(class_exists('App\\Http\\Controllers\\CollaborationLinkController'));
    }

    /**
     * @return array<string, array{class-string}>
     */
    public static function movedClasses(): array
    {
        return [
            'CollaborationLinkController' => [CollaborationLinkController::class],
            'AtarimCollaborationLink' => [AtarimCollaborationLink::class],
        ];
    }

    /**
     * The moved classes are controller code without a backlog
     * marker. Neither can sit in a queued payload, a cache or a session (a
     * route action and a static URL builder), so their client-area-legacy
     * names get no alias.
     *
     * @param  class-string  $class
     */
    #[DataProvider('movedClasses')]
    public function test_the_moved_class_is_controller_code_without_a_legacy_name(string $class): void
    {
        $suffix = substr($class, strlen('PanelAlpha\\ClientArea\\'));
        $reflection = new \ReflectionClass($class);

        $this->assertStringNotContainsString('@legacy', (string) $reflection->getDocComment());
        $this->assertStringContainsString('/packages/client-area/src/', str_replace('\\', '/', (string) $reflection->getFileName()));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\'.$suffix), 'PanelAlpha\\ClientAreaLegacy\\'.$suffix.' must not resolve.');
    }

    public function test_the_host_binds_the_atarim_settings_from_its_settings_table(): void
    {
        $unset = app(AtarimSettings::class);
        $this->assertFalse($unset->enabled);
        $this->assertSame('', $unset->referralLink);

        $this->enableAtarim();

        // Bound per resolution, so a changed setting is read at once.
        $set = app(AtarimSettings::class);
        $this->assertTrue($set->enabled);
        $this->assertSame('https://app.atarim.io/signup?ref=ref123', $set->referralLink);
    }

    public function test_the_link_reads_the_settings_only_through_the_contract(): void
    {
        // The settings table stays empty (the integration is off there); the
        // bound value alone enables it and supplies the referral link.
        $this->app->bind(AtarimSettings::class, fn (): AtarimSettings => new AtarimSettings(
            enabled: true,
            referralLink: 'https://app.atarim.io/signup?campaign=x&ref=bound42',
        ));
        $user = User::factory()->create(['email' => 'user@example.com']);
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/mixins/CollaborationLinkMixin.js:12
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/collaboration-link");

        // CA reads: packages/client-area/src/mixins/CollaborationLinkMixin.js:14
        $response->assertOk();
        parse_str((string) parse_url((string) $response->json('url'), PHP_URL_QUERY), $query);
        $this->assertSame('bound42', $query['_from'] ?? null);
    }

    public function test_home_exposes_atarim_enabled(): void
    {
        $this->enableAtarim();

        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->actingAs(User::factory()->create())->getJson('/api/home');

        // CA reads: packages/client-area/src/store/store.js:264
        $response->assertOk()->assertJsonPath('app.integrations.atarim_enabled', true);
    }
}
