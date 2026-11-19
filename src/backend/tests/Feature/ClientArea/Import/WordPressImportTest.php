<?php

namespace Tests\Feature\ClientArea\Import;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Jobs\WordPress\StartWordPressImportJob;
use PanelAlpha\ClientArea\Jobs\WordPress\WatchWordPressImportJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Projects\ImportPluginTokens;
use PanelAlpha\ClientArea\Projects\WordPressImportService;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * WordPress import (since Engine 2.2.0, the old methods except FTP).
 *
 * Contract:
 * - CA (`components/onboarding/OnboardingModalWrapper.vue:1680-1830` and its
 *   modals; axios rewrites `/instances` to `/projects`):
 *   1. `GET /instances/import/test-wordpress-url?url=&ip_address=`
 *      (`OnboardingImportUrlModal.vue:232-237`), reads `wordpress_detected`
 *      and `error_message` (:239-249);
 *   2. `POST /instances/import/test-wordpress-connection {type: 'plugin',
 *      service_id, url, login_url, username, password,
 *      using_admin_login_credentials, ip_address?}`
 *      (`OnboardingImportSimpleMethodModal.vue:333-342`), reads `success`,
 *      `error_type` (`error` | `connection_error` | `warning`), `message` and
 *      `import_details` (:288-314); the manual method links to
 *      `GET /instances/import/download-plugin` by hand (:241);
 *   3. `POST /instances/import/domain {service_id, url, delegated_user_email,
 *      user_configurable_options}` (`OnboardingModalWrapper.vue:1757-1762`),
 *      reads `data.id` (:1764);
 *   4. `POST /instances/import/import {...import_details, service_id,
 *      domain_id, type, shared_access}` (:1779-1785), reads `data` and
 *      `meta.nameservers` (:1741-1742);
 *   5. `PUT /instances/{id}/import/quick-retry` (:1821), reads `data` (:1823);
 *   progress: `import_details` and `async_status.installation` on the project
 *   (`InstanceAvatar.vue:226-237`, `ImportInstanceDetailsModal.vue:195-218`,
 *   `apis/Instances.js:241-263`), the `ImportStatusChanged` broadcast
 *   (`apis/Auth.js:469-474`) and `user.instance.installation_finished|failed`.
 * - Old: `User\Instance\ImportController` (privileges: none for the tests and
 *   the download, `service.create_instance` for domain, import and quick-retry;
 *   `packages/api/routes/api.php:208-216`).
 * - Engine (develop-2-2-0 @ 19ae8a136, bare JSON):
 *   `POST wordpress/migrations/test` (`WordpressMigrationController::test` :194,
 *   `SourceProbe::run` :46 → `{ok, url, login_url, rest_mode, wordpress_version,
 *   domain}` or `{ok:false, error_type, message}`), `POST
 *   wordpress/migrations/plugin-package` (:219 → `{token, download_url,
 *   expires_at}`), the signed download (:238, zip), `POST wordpress/migrations`
 *   (:125, 202), `GET wordpress/migrations/{id}` (:319), `POST …/{id}/resume`
 *   (:366), `POST …/{id}/cancel` (:407), `DELETE …/{id}` (:435); every status is
 *   `WordpressMigration::toStatusArray` (Models/WordpressMigration.php:665).
 */
final class WordPressImportTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SITE = 'https://www.blog.example.org';

    private const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    private const OTHER_TOKEN = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    /**
     * A migration status as `WordpressMigration::toStatusArray` builds it.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function migration(array $overrides = []): array
    {
        return array_replace([
            'id' => 7,
            'source_url' => self::SITE,
            'username' => 'admin',
            'method' => 'wp_admin',
            'login_url' => self::SITE.'/wp-login.php',
            'rest_mode' => 'wp_json',
            'source_ip' => null,
            'notices' => [],
            'target_label' => 'blog.example.org',
            'status' => 'running',
            'stale' => false,
            'steps' => [
                ['name' => 'resolve_source', 'status' => 'completed'],
                ['name' => 'create_project', 'status' => 'completed'],
                ['name' => 'install_wordpress', 'status' => 'completed'],
                ['name' => 'install_destination_plugin', 'status' => 'completed'],
                ['name' => 'install_source_plugin', 'status' => 'completed'],
                ['name' => 'remote_sync', 'status' => 'completed'],
                ['name' => 'migrate_database', 'status' => 'completed'],
                ['name' => 'migrate_files', 'status' => 'pending'],
                ['name' => 'finalize', 'status' => 'pending'],
                ['name' => 'remove_plugins', 'status' => 'pending'],
                ['name' => 'clear_secrets', 'status' => 'pending'],
            ],
            'step_log' => [],
            'progress' => [
                'step' => 'migrate_files', 'step_index' => 8, 'step_count' => 11, 'percent' => 62.5,
                'phase_percent' => 41.8, 'item' => 'wp-content/uploads/2024/05/hero.jpg', 'message' => 'Copying the files',
                'updated_at' => '2026-10-15T20:00:00+00:00',
            ],
            'target_project' => 'blogexampl',
            'target_domain' => 'blog.example.org',
            'created_project' => false,
            'preview_url' => null,
            'dns' => ['type' => 'A', 'value' => TestNetwork::public(10)],
        ], $overrides);
    }

    /**
     * A classic project with an import record, as the start job leaves it.
     *
     * @param  array<string, mixed>  $import
     */
    private function importedApplication(User $user, array $import = []): Application
    {
        $application = $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);
        WordPressImport::query()->create($import + [
            'application_id' => $application->id,
            'engine_migration_id' => 7,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'source_url' => self::SITE,
            'status' => 'running',
            'engine_status' => $this->migration(),
        ]);

        return $application;
    }

    // ── 1. test-wordpress-url ───────────────────────────────────────────

    /**
     * @return array<string, array{array<string, mixed>, bool, ?string}>
     */
    public static function urlProbeAnswers(): array
    {
        return [
            'WordPress, no plugin' => [['ok' => false, 'error_type' => 'plugin_not_found', 'message' => 'The wordpress-migrator plugin is not active on the source.'], true, null],
            'WordPress, another plugin token' => [['ok' => false, 'error_type' => 'unauthorized', 'message' => 'The plugin refused the token.'], true, null],
            'not WordPress' => [['ok' => false, 'error_type' => 'not_wordpress', 'message' => 'No WordPress REST API at https://www.blog.example.org'], false, null],
            'unreachable' => [['ok' => false, 'error_type' => 'unreachable', 'message' => 'Could not connect to www.blog.example.org.'], false, 'Could not connect to www.blog.example.org.'],
            'certificate' => [['ok' => false, 'error_type' => 'tls', 'message' => 'The source certificate is not valid.'], false, 'The source certificate is not valid.'],
        ];
    }

    /**
     * @param  array<string, mixed>  $answer
     */
    #[DataProvider('urlProbeAnswers')]
    public function test_the_url_test_asks_the_engine_without_logging_in(array $answer, bool $detected, ?string $error): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:68 -> run (a failed source is a 200 `{ok:false, error_type, message}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response($answer)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:237
            ->getJson('/api/projects/import/test-wordpress-url?'.http_build_query(['url' => self::SITE, 'ip_address' => TestNetwork::public2(7)]))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:239-249
            ->assertExactJson(['wordpress_detected' => $detected, 'error_message' => $error]);

        // The manual-plugin mode with a token no plugin holds: the Engine
        // reads the REST index and never tries a login.
        Http::assertSent(fn (Request $r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/api/wordpress/migrations/test')
            && $r['url'] === self::SITE
            && $r['method'] === 'manual_plugin'
            && $r['source_token'] === WordPressImportService::PROBE_TOKEN
            && $r['source_ip'] === TestNetwork::public2(7)
            && ! isset($r['username'], $r['password']));
    }

    public function test_the_url_test_turns_an_engine_refusal_into_its_error(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Requests/WordpressMigrationStoreRequest.php:63 -> rulesFor (`source_ip` refused before any fetch)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response([
            'message' => 'The source_ip must be a public address.',
            'errors' => ['source_ip' => ['The source_ip must be a public address.']],
        ], 422)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:237
            ->getJson('/api/projects/import/test-wordpress-url?'.http_build_query(['url' => self::SITE, 'ip_address' => TestNetwork::private(5)]))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:244-246
            ->assertJsonPath('wordpress_detected', false)
            ->assertJsonPath('error_message', 'The source_ip must be a public address.');
    }

    public function test_the_url_test_validates_the_query_like_the_old_route(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:237
            ->getJson('/api/projects/import/test-wordpress-url?url=not-a-url')
            ->assertStatus(422)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:251-253
            ->assertJsonValidationErrors('url');
        Http::assertNothingSent();
    }

    public function test_the_import_routes_need_a_login(): void
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingImportUrlModal.vue:237
        $this->getJson('/api/projects/import/test-wordpress-url?url='.urlencode(self::SITE))->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
        $this->postJson('/api/projects/import/test-wordpress-connection', [])->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
        $this->postJson('/api/projects/import/domain', [])->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779
        $this->postJson('/api/projects/import/import', [])->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
        $this->putJson('/api/projects/1/import/quick-retry')->assertUnauthorized();
    }

    // ── 2. test-wordpress-connection ────────────────────────────────────

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function connectionBody(array $overrides = []): array
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:333-340
        return $overrides + [
            'type' => 'plugin',
            'service_id' => VirtualService::ID,
            'url' => self::SITE,
            'login_url' => self::SITE.'/wp-login.php',
            'username' => 'admin',
            'password' => 'Secret-pass-1',
            'using_admin_login_credentials' => true,
        ];
    }

    public function test_the_admin_login_test_answers_the_sites_own_address(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:53 -> run (`ok`, the site's home and login page, ImportDomainCheck.php:28 `domain`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response([
            'ok' => true,
            'url' => 'https://www.blog.example.org',
            'login_url' => 'https://www.blog.example.org/wp-login.php',
            'rest_mode' => 'wp_json',
            'wordpress_version' => '6.8.1',
            'domain' => 'blog.example.org',
        ])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody(['login_url' => 'https://']))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:302-314
            ->assertJsonPath('success', true)
            ->assertJsonPath('error_type', null)
            ->assertJsonPath('import_details.url', 'https://www.blog.example.org')
            ->assertJsonPath('import_details.login_url', 'https://www.blog.example.org/wp-login.php')
            ->assertJsonPath('import_details.username', 'admin');

        // The CA pre-fills a bare `https://` login URL; only a real URL is sent.
        Http::assertSent(fn (Request $r) => $r['method'] === 'wp_admin'
            && $r['username'] === 'admin'
            && $r['password'] === 'Secret-pass-1'
            && ! isset($r['login_url']));
    }

    public function test_the_connection_test_never_echoes_the_password(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:53 -> run (`ok`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response([
            'ok' => true,
            'url' => self::SITE,
            'login_url' => self::SITE.'/wp-login.php',
            'rest_mode' => 'wp_json',
            'wordpress_version' => '6.8.1',
            'domain' => 'blog.example.org',
        ])]);

        // The CA hands `import_details` on to `import/import`; a password it
        // typed itself must not travel back through the answer.
        $response = $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody())
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:310 (`import_details`)
            ->assertJsonPath('success', true)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:310 (`import_details`)
            ->assertJsonPath('import_details.username', 'admin');

        $this->assertIsArray($response->json('import_details'));
        $this->assertArrayNotHasKey('password', $response->json('import_details'));
        $this->assertStringNotContainsString('Secret-pass-1', $response->getContent());
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function adminLoginFailures(): array
    {
        return [
            // A wrong login stays an error the user can correct.
            'wrong password' => ['login_failed', 'error', WordPressImportService::CANNOT_CONNECT],
            // The CA switches to the manual plugin on `connection_error`.
            'Cloudflare challenge' => ['cloudflare', 'connection_error', WordPressImportService::ADMIN_LOGIN_BLOCKED],
            'not WordPress' => ['not_wordpress', 'error', 'No WordPress login page found for https://www.blog.example.org'],
        ];
    }

    #[DataProvider('adminLoginFailures')]
    public function test_an_admin_login_failure_maps_to_the_old_error_types(string $engineType, string $caType, string $message): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:68 -> run (`{ok:false, error_type, message}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response([
            'ok' => false,
            'error_type' => $engineType,
            'message' => 'No WordPress login page found for https://www.blog.example.org',
        ])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody())
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:288-301
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_type', $caType)
            ->assertJsonPath('message', $message);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function targetRefusals(): array
    {
        return [
            // The live run on test-host.example.com (2026-10-15): a site
            // whose domain is already a project on this Engine.
            'domain on this server' => ['domain_taken', WordPressImportService::DOMAIN_TAKEN],
            'IP source without Connect' => ['domain_required', WordPressImportService::NO_DOMAIN_FOR_IP],
        ];
    }

    #[DataProvider('targetRefusals')]
    public function test_a_target_refusal_is_told_in_the_panels_words(string $engineType, string $message): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:68 -> run (ImportDomainCheck's refusal as `{ok:false, error_type, message}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response([
            'ok' => false,
            'error_type' => $engineType,
            'message' => "The domain 'e7src.198-51-100-45.sslip.io' already belongs to a project on this engine. Send another `domain`.",
        ])]);

        $this->actingAs($user)->withSession([ImportPluginTokens::KEY => [self::TOKEN]])
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody(['using_admin_login_credentials' => false]))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:288-291
            ->assertJsonPath('error_type', 'error')
            ->assertJsonPath('message', $message);
    }

    public function test_the_manual_test_tries_the_downloaded_tokens_newest_first(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake(function (Request $request) {
            // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:53 -> run (the plugin accepts only the token baked into its zip)
            if ($request['source_token'] === self::TOKEN) {
                return Http::response(['ok' => true, 'url' => self::SITE, 'login_url' => null, 'rest_mode' => 'wp_json', 'wordpress_version' => null, 'domain' => 'blog.example.org']);
            }

            // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:68 -> run (`unauthorized`: the plugin refused another download's token)
            return Http::response(['ok' => false, 'error_type' => 'unauthorized', 'message' => 'The plugin refused the token.']);
        });

        $this->actingAs($user)->withSession([ImportPluginTokens::KEY => [self::OTHER_TOKEN, self::TOKEN]])
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody([
                'using_admin_login_credentials' => false,
                'username' => '',
                'password' => '',
            ]))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:308-314
            ->assertJsonPath('success', true);

        $sent = Http::recorded()->map(static fn (array $pair): mixed => $pair[0]['source_token'])->all();
        $this->assertSame([self::OTHER_TOKEN, self::TOKEN], $sent);
        $this->assertSame(['url' => strtolower(self::SITE), 'token' => self::TOKEN], session(ImportPluginTokens::VERIFIED_KEY));
    }

    public function test_the_manual_test_without_a_download_says_the_plugin_is_missing(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody(['using_admin_login_credentials' => false]))
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:288-291
            ->assertJsonPath('error_type', 'error')
            ->assertJsonPath('message', WordPressImportService::PLUGIN_NOT_FOUND);
        Http::assertNothingSent();
    }

    public function test_the_ftp_method_is_refused_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportAdvancedMethodModal.vue:558
            ->postJson('/api/projects/import/test-wordpress-connection', ['type' => 'ftp', 'service_id' => VirtualService::ID, 'url' => self::SITE, 'protocol' => 'ftp'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', WordPressImportService::FTP_NOT_AVAILABLE);
        Http::assertNothingSent();
    }

    public function test_the_admin_login_needs_its_credentials(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:342
            ->postJson('/api/projects/import/test-wordpress-connection', $this->connectionBody(['username' => '', 'password' => '']))
            ->assertStatus(422)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:346-347
            ->assertJsonValidationErrors(['username', 'password']);
        Http::assertNothingSent();
    }

    // ── download-plugin ─────────────────────────────────────────────────

    #[DataProvider('pluginDownloadPaths')]
    public function test_the_plugin_download_streams_a_new_engine_package(string $path): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:219 -> pluginPackage (signed link on the address the panel called)
            'engine.example.com/api/wordpress/migrations/plugin-package' => Http::response([
                'token' => self::TOKEN,
                'download_url' => self::ENGINE.'/wordpress/migrations/plugin-package/download?expires=1760600000&package=eyJpdiI6&signature=abc123',
                'expires_at' => '2026-10-16T20:00:00+00:00',
            ]),
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:238 -> downloadPluginPackage (the zip)
            'engine.example.com/api/wordpress/migrations/plugin-package/download*' => Http::response('PK-zip-bytes', 200, ['Content-Type' => 'application/zip']),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:241
        $response = $this->actingAs($user)->get($path);

        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        $this->assertSame('PK-zip-bytes', $response->streamedContent());
        $this->assertStringContainsString('wordpress-migrator.zip', (string) $response->headers->get('Content-Disposition'));
        $this->assertSame([self::TOKEN], session(ImportPluginTokens::KEY));
        Http::assertSent(fn (Request $r) => $r->method() === 'GET'
            && $r->url() === self::ENGINE.'/wordpress/migrations/plugin-package/download?expires=1760600000&package=eyJpdiI6&signature=abc123');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function pluginDownloadPaths(): array
    {
        return [
            'the CA link' => ['/api/instances/import/download-plugin'],
            'the projects spelling' => ['/api/projects/import/download-plugin'],
        ];
    }

    public function test_a_plugin_link_on_another_address_is_not_followed(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake([
            // Defensive (not an Engine shape): a package link off the Engine's own origin must never be fetched
            'engine.example.com/api/wordpress/migrations/plugin-package' => Http::response([
                'token' => self::TOKEN,
                'download_url' => 'https://evil.example.net/api/wordpress/migrations/plugin-package/download?signature=x',
            ]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingImportSimpleMethodModal.vue:241
        $this->actingAs($user)->get('/api/instances/import/download-plugin')->assertStatus(502);

        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'evil.example.net'));
    }

    // ── 3. domain ───────────────────────────────────────────────────────

    public function test_the_domain_step_creates_a_classic_project_on_the_sites_domain(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'blogexampl', 'details' => ['username' => 'blogexampl', 'domain' => 'blog.example.org']]], 202),
        ]);

        $id = $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
            ->postJson('/api/projects/import/domain', ['service_id' => VirtualService::ID, 'url' => self::SITE, 'delegated_user_email' => null, 'user_configurable_options' => []])
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1764
            ->assertJsonPath('data.domain', 'blog.example.org')
            ->json('data.id');

        // The site keeps its own domain (the URL's host without `www.`) on a
        // classic project – no container template.
        Http::assertSent(fn (Request $r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/api/projects')
            && $r['domain'] === 'blog.example.org'
            && ($r['template'] ?? null) === null);
        $this->assertSame('blog.example.org', Application::query()->findOrFail($id)->domain);
    }

    public function test_the_domain_step_refuses_an_ip_source(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
            ->postJson('/api/projects/import/domain', ['service_id' => VirtualService::ID, 'url' => 'http://'.TestNetwork::public2(7).'/blog'])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', WordPressImportService::NO_DOMAIN_FOR_IP);
        Http::assertNotSent(fn (Request $r) => $r->method() === 'POST');
    }

    public function test_the_domain_step_refuses_a_domain_in_use(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
            ->postJson('/api/projects/import/domain', ['service_id' => VirtualService::ID, 'url' => self::SITE])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1771
            ->assertJsonValidationErrors('domain');
        Http::assertNotSent(fn (Request $r) => $r->method() === 'POST');
    }

    public function test_the_domain_step_needs_the_users_service(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
            ->postJson('/api/projects/import/domain', ['service_id' => 999, 'url' => self::SITE])
            ->assertNotFound();
    }

    // ── 4. import ───────────────────────────────────────────────────────

    public function test_the_import_records_the_start_and_queues_it(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779-1785
            ->postJson('/api/projects/import/import', $this->connectionBody([
                'url' => self::SITE,
                'login_url' => self::SITE.'/wp-login.php',
                'method' => 'plugin',
                'domain_id' => $application->id,
                'shared_access' => [],
                'ip_address' => TestNetwork::public2(7),
            ]))
            ->assertCreated()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1741-1742
            ->assertJsonPath('data.id', $application->id)
            ->assertJsonPath('data.async_status.installation', 'in_progress')
            ->assertJsonPath('data.import_details.status', 'in-progress')
            ->assertJsonPath('meta.nameservers', []);

        $import = WordPressImport::query()->where('application_id', $application->id)->firstOrFail();
        $this->assertSame(WordPressImport::STARTING, $import->status);
        $this->assertSame([
            'url' => self::SITE,
            'source_ip' => TestNetwork::public2(7),
            'method' => 'wp_admin',
            'login_url' => self::SITE.'/wp-login.php',
            'username' => 'admin',
            'password' => 'Secret-pass-1',
        ], $import->source);
        Queue::assertPushed(StartWordPressImportJob::class, fn (StartWordPressImportJob $job) => $job->applicationId === $application->id);
    }

    public function test_the_manual_import_uses_the_token_the_test_verified(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);

        $this->actingAs($user)->withSession([
            ImportPluginTokens::KEY => [self::OTHER_TOKEN, self::TOKEN],
            ImportPluginTokens::VERIFIED_KEY => ['url' => strtolower(self::SITE), 'token' => self::TOKEN],
        ])
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779-1785
            ->postJson('/api/projects/import/import', $this->connectionBody([
                'using_admin_login_credentials' => false,
                'username' => '',
                'password' => '',
                'domain_id' => $application->id,
            ]))
            ->assertCreated();

        $source = WordPressImport::query()->where('application_id', $application->id)->firstOrFail()->source;
        $this->assertSame('manual_plugin', $source['method'] ?? null);
        $this->assertSame(self::TOKEN, $source['source_token'] ?? null);
        $this->assertArrayNotHasKey('password', (array) $source);
    }

    public function test_a_project_takes_one_import(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->importedApplication($user);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779-1785
            ->postJson('/api/projects/import/import', $this->connectionBody(['domain_id' => $application->id]))
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', WordPressImportService::ALREADY_IMPORTING);
        Queue::assertNotPushed(StartWordPressImportJob::class);
    }

    public function test_a_container_project_takes_no_import(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'app1', ['details' => ['template' => 'dind']]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779-1785
            ->postJson('/api/projects/import/import', $this->connectionBody(['domain_id' => $application->id]))
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', WordPressImportService::NOT_CLASSIC);
    }

    public function test_the_domain_step_and_the_import_check_the_user_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);
        $this->denyPrivilege('service.create_instance');
        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757
        $this->actingAs($user)->postJson('/api/projects/import/domain', ['service_id' => VirtualService::ID, 'url' => self::SITE])->assertForbidden();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1779
        $this->actingAs($user)->postJson('/api/projects/import/import', $this->connectionBody(['domain_id' => $application->id]))->assertForbidden();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
        $this->actingAs($user)->putJson("/api/projects/{$application->id}/import/quick-retry")->assertForbidden();
    }

    // ── StartWordPressImportJob ─────────────────────────────────────────

    public function test_the_start_job_waits_for_the_project_then_starts_the_engine_import(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user, [
            'engine_migration_id' => null,
            'status' => WordPressImport::STARTING,
            'engine_status' => null,
            'source' => ['url' => self::SITE, 'method' => 'wp_admin', 'username' => 'admin', 'password' => 'Secret-pass-1'],
        ]);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (no queued or running task of the project)
            'engine.example.com/api/tasks*' => Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]),
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:125 -> store (202, Models/WordpressMigration.php:665 toStatusArray)
            'engine.example.com/api/wordpress/migrations' => Http::response($this->migration(['status' => 'pending']), 202),
        ]);

        (new StartWordPressImportJob($application->id))->handle();

        Http::assertSent(fn (Request $r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/api/wordpress/migrations')
            && $r['project'] === 'blogexampl'
            && $r['method'] === 'wp_admin'
            && $r['password'] === 'Secret-pass-1'
            && ! isset($r['domain']));
        $import = WordPressImport::query()->where('application_id', $application->id)->firstOrFail();
        $this->assertSame(7, $import->engine_migration_id);
        $this->assertSame('pending', $import->status);
        $this->assertNull($import->source);
        Event::assertDispatched(ImportStatusChanged::class);
        Queue::assertPushed(WatchWordPressImportJob::class, fn (WatchWordPressImportJob $job) => $job->applicationId === $application->id);
    }

    public function test_a_refused_start_fails_the_import_and_keeps_the_source_for_a_retry(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user, [
            'engine_migration_id' => null,
            'status' => WordPressImport::STARTING,
            'engine_status' => null,
            'source' => ['url' => self::SITE, 'method' => 'wp_admin', 'username' => 'admin', 'password' => 'Secret-pass-1'],
        ]);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (no queued or running task of the project)
            'engine.example.com/api/tasks*' => Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]),
            // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/MigrationTargetResolver.php:150 -> assertEligible (422 problems)
            'engine.example.com/api/wordpress/migrations' => Http::response([
                'message' => "Project 'blogexampl' already holds a site. A WordPress import needs a docroot with nothing but the placeholder index.html.",
                'errors' => ['project' => ["Project 'blogexampl' already holds a site. A WordPress import needs a docroot with nothing but the placeholder index.html."]],
                'problems' => [['field' => 'project', 'code' => 'project_not_empty']],
            ], 422),
        ]);

        (new StartWordPressImportJob($application->id))->handle();

        $import = WordPressImport::query()->where('application_id', $application->id)->firstOrFail();
        $this->assertSame(WordPressImport::FAILED, $import->status);
        $this->assertStringContainsString('already holds a site', (string) $import->error);
        $this->assertNotNull($import->source);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $e) => $e->type === InstallWordPressJob::FAILED_TYPE
            && str_contains((string) $e->message, 'already holds a site'));
        Queue::assertNotPushed(WatchWordPressImportJob::class);
    }

    // ── WatchWordPressImportJob ─────────────────────────────────────────

    private function watch(Application $application): void
    {
        (new WatchWordPressImportJob($application->id, now()->getTimestamp()))->handle(app(ApplicationSynchronizer::class));
    }

    public function test_the_watcher_broadcasts_progress_and_polls_again(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user, ['engine_status' => $this->migration(['progress' => ['step' => 'migrate_database', 'phase_percent' => 90.0]])]);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (Models/WordpressMigration.php:665 toStatusArray)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response($this->migration())]);

        $this->watch($application);

        Event::assertDispatched(ImportStatusChanged::class, fn (ImportStatusChanged $e) => $e->application['id'] === $application->id
            && $e->application['import_details']['current_step']['name'] === 'migrateFilesUsingPlugin');
        Event::assertNotDispatched(ClientAreaNotificationRequested::class);
        Queue::assertPushed(WatchWordPressImportJob::class, fn (WatchWordPressImportJob $job) => $job->applicationId === $application->id && $job->hiccupAttempt === 0);
    }

    public function test_an_unchanged_import_is_not_broadcast_again(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (Models/WordpressMigration.php:665 toStatusArray)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response($this->migration())]);

        $this->watch($application);

        Event::assertNotDispatched(ImportStatusChanged::class);
        Queue::assertPushed(WatchWordPressImportJob::class);
    }

    public function test_a_completed_import_refreshes_the_project_and_notifies_with_the_notices(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user, ['method' => WordPressImport::METHOD_MANUAL_PLUGIN]);
        $notice = 'Remove the wordpress-migrator plugin from the source site when the migration has finished: it was installed by hand, and the Engine has no wp-admin access to remove it.';
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (Models/WordpressMigration.php:665 toStatusArray, `notices` of a manual import)
            'engine.example.com/api/wordpress/migrations/7' => Http::response($this->migration(['status' => 'completed', 'method' => 'manual_plugin', 'notices' => [$notice]])),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll (the mirror refresh)
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'blogexampl', ['domain' => 'blog.example.org'])]]),
        ]);

        $this->watch($application);

        $this->assertSame(WordPressImport::COMPLETED, $application->wordpressImport()->firstOrFail()->status);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $e) => $e->type === InstallWordPressJob::FINISHED_TYPE
            && $e->message === $notice);
        Queue::assertNotPushed(WatchWordPressImportJob::class);
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function endedImports(): array
    {
        return [
            'failed step' => [['status' => 'failed', 'step_log' => [
                ['step' => 'migrate_files', 'status' => 'failed', 'message' => 'The source plugin stopped answering.'],
            ]], 'The source plugin stopped answering.'],
            'failed step with a PHP error' => [['status' => 'failed', 'step_log' => [
                ['step' => 'migrate_database', 'status' => 'failed', 'message' => 'Call to undefined method WP_Migration::run()'],
            ]], EngineText::INTERNAL_ERROR_DETAIL],
            'cancelled' => [['status' => 'cancelled'], WatchWordPressImportJob::CANCELLED],
            'dead worker' => [['status' => 'running', 'stale' => true], WatchWordPressImportJob::STALE],
        ];
    }

    /**
     * @param  array<string, mixed>  $engine
     */
    #[DataProvider('endedImports')]
    public function test_an_import_that_cannot_finish_is_reported_as_failed(array $engine, string $message): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (Models/WordpressMigration.php:665 toStatusArray)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response($this->migration($engine))]);

        $this->watch($application);

        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $e) => $e->type === InstallWordPressJob::FAILED_TYPE
            && $e->message === $message && $e->isError);
        Queue::assertNotPushed(WatchWordPressImportJob::class);

        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
        // CA reads: packages/client-area/src/apis/Instances.js:241-243
            ->assertJsonPath('data.async_status.installation', 'failed')
            ->assertJsonPath('data.import_details.status', 'cancelled' === ($engine['status'] ?? '') ? 'stopped' : 'failed');
    }

    public function test_a_php_error_in_a_failed_import_step_is_not_shown_on_the_project(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show (Models/WordpressMigration.php:665 toStatusArray)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response($this->migration([
            'status' => 'failed',
            'step_log' => [['step' => 'migrate_database', 'status' => 'failed', 'message' => 'Call to undefined method WP_Migration::run()']],
        ]))]);

        $this->watch($application);

        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
        // CA reads: packages/client-area/src/apis/Instances.js:241-263
            ->assertJsonPath('data.import_details.message', EngineText::INTERNAL_ERROR_DETAIL)
            ->assertDontSee('Call to undefined method');
    }

    public function test_a_gone_import_record_ends_the_watch(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class, ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:443 -> findOr404 (`{message: Not found}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => Http::response(['message' => 'Not found'], 404)]);

        $this->watch($application);

        $this->assertSame(WordPressImport::FAILED, $application->wordpressImport()->firstOrFail()->status);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $e) => $e->message === WatchWordPressImportJob::GONE);
    }

    /**
     * @return array<string, array{\Closure(): mixed}>
     */
    public static function engineHiccups(): array
    {
        return [
            // Defensive (not an Engine shape): the Engine is down
            'connection error' => [static fn () => throw new \Illuminate\Http\Client\ConnectionException('Connection refused')],
            // Defensive (not an Engine shape): an Engine 5xx
            'Engine 5xx' => [static fn () => Http::response(['message' => 'Server Error'], 500)],
        ];
    }

    #[DataProvider('engineHiccups')]
    public function test_an_engine_hiccup_polls_again_with_backoff(\Closure $answer): void
    {
        Queue::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        // Defensive (not an Engine shape): the provider's connection error or Engine 5xx
        Http::fake(['engine.example.com/api/wordpress/migrations/7' => $answer]);

        $this->watch($application);

        Event::assertNotDispatched(ClientAreaNotificationRequested::class);
        Queue::assertPushed(WatchWordPressImportJob::class, fn (WatchWordPressImportJob $job) => $job->hiccupAttempt === 1);
    }

    // ── progress on the project ─────────────────────────────────────────

    public function test_the_project_shows_the_import_steps_and_progress(): void
    {
        $user = User::factory()->create();
        $application = $this->importedApplication($user);

        // CA: packages/client-area/src/apis/Instances.js:76
        $details = $this->actingAs($user)->getJson("/api/projects/{$application->id}")
            ->assertOk()
        // CA reads: packages/client-area/src/apis/Instances.js:241-263
            ->assertJsonPath('data.async_status.installation', 'in_progress')
            ->json('data.import_details');

        // CA reads: packages/client-area/src/components/modal/ImportInstanceDetailsModal.vue:195-218
        $this->assertSame('in-progress', $details['status']);
        $this->assertSame('Copying the files', $details['message']);
        $this->assertSame([
            'name' => 'migrateFilesUsingPlugin',
            'status' => 'in-progress',
            'percent' => 42,
            'current_item' => 'wp-content/uploads/2024/05/hero.jpg',
            'current_step_number' => 8,
            'steps_count' => 11,
        ], $details['current_step']);
        // Newest first, as the old resource listed them; every key is a step
        // the CA translates.
        $this->assertSame('not-started', $details['steps']['cleanUp']);
        $this->assertSame('in-progress', $details['steps']['migrateFilesUsingPlugin']);
        $this->assertSame('completed', $details['steps']['prepareMigrationUsingPlugin']);
        $this->assertSame('cleanUp', array_key_first($details['steps']));
    }

    public function test_a_project_that_is_not_an_import_has_no_import_details(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:76
            ->getJson("/api/projects/{$application->id}")
            ->assertOk()
        // CA reads: packages/client-area/src/components/InstanceAvatar.vue:226-228
            ->assertJsonPath('data.import_details', null);
    }

    // ── 5. quick-retry ──────────────────────────────────────────────────

    public function test_quick_retry_resumes_a_failed_import(): void
    {
        Queue::fake();
        Event::fake([ImportStatusChanged::class]);
        $user = User::factory()->create();
        $application = $this->importedApplication($user, ['status' => 'failed', 'engine_status' => $this->migration(['status' => 'failed'])]);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:366 -> resume (202, Models/WordpressMigration.php:665 toStatusArray)
        Http::fake(['engine.example.com/api/wordpress/migrations/7/resume' => Http::response($this->migration(['status' => 'pending']), 202)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
            ->putJson("/api/projects/{$application->id}/import/quick-retry")
            ->assertOk()
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1823
            ->assertJsonPath('data.id', $application->id)
            ->assertJsonPath('data.async_status.installation', 'in_progress');

        Http::assertSent(fn (Request $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/wordpress/migrations/7/resume'));
        Queue::assertPushed(WatchWordPressImportJob::class);
    }

    public function test_quick_retry_restarts_an_import_the_engine_refused(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->importedApplication($user, [
            'engine_migration_id' => null,
            'status' => WordPressImport::FAILED,
            'engine_status' => null,
            'error' => 'The project is still being created. Retry the import in a few minutes.',
            'source' => ['url' => self::SITE, 'method' => 'wp_admin', 'username' => 'admin', 'password' => 'Secret-pass-1'],
        ]);
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
            ->putJson("/api/projects/{$application->id}/import/quick-retry")
            ->assertOk();

        $this->assertSame(WordPressImport::STARTING, $application->wordpressImport()->firstOrFail()->status);
        Queue::assertPushed(StartWordPressImportJob::class);
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/wordpress/migrations'));
    }

    public function test_quick_retry_of_a_running_import_answers_the_old_refusal(): void
    {
        $user = User::factory()->create();
        $application = $this->importedApplication($user);
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
            ->putJson("/api/projects/{$application->id}/import/quick-retry")
            ->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', WordPressImportService::CANNOT_RETRY);
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/resume'));
    }

    public function test_quick_retry_of_another_users_project_is_not_found(): void
    {
        $owner = User::factory()->create();
        $application = $this->importedApplication($owner, ['status' => 'failed']);
        Http::fake();

        $this->actingAs(User::factory()->create())
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1821
            ->putJson('/api/projects/'.($application->id + 100).'/import/quick-retry')
            ->assertNotFound();
    }

    // ── project delete ──────────────────────────────────────────────────

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function importsAtDelete(): array
    {
        return [
            'still running: cancel it' => ['running', 'POST', '/wordpress/migrations/7/cancel'],
            'ended: drop its record' => ['completed', 'DELETE', '/wordpress/migrations/7'],
        ];
    }

    #[DataProvider('importsAtDelete')]
    public function test_deleting_the_project_cancels_or_drops_its_import(string $status, string $method, string $path): void
    {
        $user = User::factory()->create();
        $application = $this->importedApplication($user, ['status' => $status]);
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:407 -> cancel (202 toStatusArray)
            'engine.example.com/api/wordpress/migrations/7/cancel' => Http::response($this->migration(['status' => 'cancelling']), 202),
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:435 -> destroy (204)
            'engine.example.com/api/wordpress/migrations/7' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/blogexampl' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        Http::assertSent(fn (Request $r) => $r->method() === $method && str_ends_with($r->url(), $path));
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && str_ends_with($r->url(), '/projects/blogexampl'));
        $this->assertDatabaseMissing('wordpress_imports', ['application_id' => $application->id]);
    }
}
