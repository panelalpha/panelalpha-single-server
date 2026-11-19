<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Hub\HubPairing;
use PanelAlpha\Community\Http\Requests\SettingsUrlRequest;
use PanelAlpha\Community\Settings\PanelAddressMove;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The owner's basic settings (`/api/community/settings`).
 */
class SettingsTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const FORMATS = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];

    private function signedIn(): static
    {
        $this->configureEngine();

        return $this->actingAs(User::factory()->create());
    }

    /**
     * @return array<string, string>
     */
    private function body(array $override = []): array
    {
        return array_merge([
            'name' => 'Office box',
            'default_language' => 'en',
            'default_date_format' => 'DD.MM.YYYY',
        ], $override);
    }

    private function appUrl(): string
    {
        return rtrim(config()->string('app.url'), '/');
    }

    /**
     * @return array<string, mixed>
     */
    private function homeApp(): array
    {
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        return $this->getJson('/api/home')->assertOk()->json('app');
    }

    public function test_get_on_an_empty_table_agrees_with_home(): void
    {
        $client = $this->signedIn();
        $app = $this->homeApp();

        // CA: packages/client-area/src/apis/FreePanel.js:5
        $client->getJson('/api/community/settings')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (`apply`: name, default_language, default_date_format, languages, date_formats)
            ->assertExactJson([
                'name' => $app['name'],
                'default_language' => $app['default_language'],
                'default_date_format' => $app['default_date_format'],
                'languages' => ['en'],
                'date_formats' => self::FORMATS,
                'url' => $this->appUrl(),
            ])
            // CA reads: packages/client-area/src/views/free/Settings.vue:418 (`apply` reads `data.name`)
            ->assertJsonPath('name', 'My Server')
            ->assertJsonPath('default_language', 'en')
            ->assertJsonPath('default_date_format', 'YYYY-MM-DD');
    }

    public function test_stored_empty_strings_fall_back_like_home(): void
    {
        $client = $this->signedIn();
        $settings = app(PanelSettings::class);
        $settings->set('userapp.name', '');
        $settings->set('userapp.default-language', '');
        $app = $this->homeApp();

        // CA: packages/client-area/src/apis/FreePanel.js:5
        $client->getJson('/api/community/settings')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:418 (`apply` reads `data.name`)
            ->assertJsonPath('name', 'My Server')
            ->assertJsonPath('name', $app['name'])
            // CA reads: packages/client-area/src/views/free/Settings.vue:419 (`apply` reads `data.default_language`)
            ->assertJsonPath('default_language', 'en')
            ->assertJsonPath('default_language', $app['default_language']);
    }

    public function test_put_stores_the_values_and_home_serves_them(): void
    {
        $client = $this->signedIn();

        // CA: packages/client-area/src/apis/FreePanel.js:8
        $client->putJson('/api/community/settings', $this->body())
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (`apply`, the same payload as GET)
            ->assertExactJson([
                'name' => 'Office box',
                'default_language' => 'en',
                'default_date_format' => 'DD.MM.YYYY',
                'languages' => ['en'],
                'date_formats' => self::FORMATS,
                'url' => $this->appUrl(),
            ]);

        $settings = app(PanelSettings::class);
        $this->assertSame('Office box', $settings->get('userapp.name'));
        $this->assertSame('en', $settings->get('userapp.default-language'));
        $this->assertSame('DD.MM.YYYY', $settings->get('userapp.default-date-format'));

        $app = $this->homeApp();
        // CA reads: packages/client-area/src/apis/Auth.js:51 (`store.commit('setHome', response.data)`)
        $this->assertSame('Office box', $app['name']);
        $this->assertSame('DD.MM.YYYY', $app['default_date_format']);
        $this->assertSame('en', $app['default_language']);
    }

    /**
     * @return array<string, array{array<string, string>, string}>
     */
    public static function invalidBodies(): array
    {
        return [
            'unknown language' => [['default_language' => 'xx'], 'default_language'],
            'unknown format' => [['default_date_format' => 'Y-m-d'], 'default_date_format'],
            'empty name' => [['name' => ''], 'name'],
            'over-long name' => [['name' => str_repeat('a', 256)], 'name'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidBodies')]
    public function test_put_rejects_an_invalid_body(array $override, string $field): void
    {
        // CA: packages/client-area/src/apis/FreePanel.js:8
        $this->signedIn()->putJson('/api/community/settings', $this->body($override))
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/Settings.vue:451 (`fail` maps the 422 `errors` to the fields by request key)
            ->assertJsonValidationErrors($field);

        $this->assertNull(app(PanelSettings::class)->get('userapp.name'));
    }

    public function test_a_guest_gets_401(): void
    {
        // CA: packages/client-area/src/apis/FreePanel.js:5
        $this->getJson('/api/community/settings')->assertUnauthorized();
        // CA: packages/client-area/src/apis/FreePanel.js:8
        $this->putJson('/api/community/settings', $this->body())->assertUnauthorized();
    }

    public function test_both_routes_are_a_404_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);
        $client = $this->signedIn();

        // CA: packages/client-area/src/apis/FreePanel.js:5
        $client->getJson('/api/community/settings')->assertNotFound();
        // CA: packages/client-area/src/apis/FreePanel.js:8
        $client->putJson('/api/community/settings', $this->body())->assertNotFound();
        // The gate answers before validation: an invalid body is still a 404.
        $client->putJson('/api/community/settings', [])->assertNotFound();
    }

    public function test_the_settings_routes_are_throttled(): void
    {
        $client = $this->signedIn();
        for ($i = 0; $i < 30; $i++) {
            // CA: packages/client-area/src/apis/FreePanel.js:5
            $client->getJson('/api/community/settings')->assertOk();
        }

        // CA: packages/client-area/src/apis/FreePanel.js:5
        $client->getJson('/api/community/settings')->assertStatus(429);
    }

    // ----- Application URL (`PUT /api/community/settings/url`) -----------------------------------------------------
    //
    // On a current Engine the save moves the panel: the old
    // panel only added the host as an alias; `moved` is read by client-area-next alone.

    private const SELF = 'panelv1';

    private const MAIN = 'panelv1.example.com';

    private const SERVER_NAME = 'server.example.net';

    private function selfProject(): void
    {
        config(['client-area.self_project' => self::SELF]);
    }

    /**
     * The Engine answers for the panel's own project. `$ssl`, `$create`, `$update` and `$delete` are the HTTP
     * statuses of the certificate request, the domain creation, the domain update and the domain deletion;
     * `$list` is the HTTP status of the domain list; `$problem` is the code of a refused update. The list is the
     * Engine's own state: a created domain joins it and a deleted one leaves it.
     *
     * @param  list<array<string, mixed>>  $domains
     */
    private function fakeEngine(array $domains, int $ssl = 200, int $create = 200, int $list = 200, int $update = 200, int $delete = 200, string $problem = 'https_port_taken'): void
    {
        $base = '/api/projects/'.self::SELF.'/domains';

        Http::fake(function (Request $request) use ($base, &$domains, $ssl, $create, $list, $update, $delete, $problem) {
            $path = parse_url($request->url(), PHP_URL_PATH);

            if ($path === '/api/system/info') {
                // Engine: core/app/Http/Controllers/SystemController.php:59 -> info, `cert_domain` is the server's own name
                return Http::response(['data' => ['cert_domain' => self::SERVER_NAME]], 200);
            }
            if ($path === $base && $request->method() === 'GET') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index, {data:[DomainResource]}
                return Http::response(['data' => $domains], $list);
            }
            if ($path === $base && $request->method() === 'POST') {
                $row = $create === 200 ? $this->domainRow((string) $request['domain'], 'addon') : null;
                if ($row !== null) {
                    $domains[] = $row;
                }

                // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> store, DomainResource (unwrapped)
                return Http::response($row ?? ['message' => 'Addon domains limit of 1 reached.', 'error_type' => 'addon_domains_limit_reached'], $create);
            }
            if (is_string($path) && str_ends_with($path, '/request-ssl-cert')) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:505 -> certificateRefused, {message} with 422
                return Http::response($ssl === 200 ? ['data' => ['status' => 'requested']] : ['message' => 'Could not obtain a certificate for x: DNS problem'], $ssl);
            }
            if ($request->method() === 'PUT' && $update === 409) {
                // Engine: core/app/Exceptions/DeployBusyException.php:10 -> 409 while a deploy or a backup runs
                return Http::response(['message' => 'A deploy is already running for this project.', 'code' => 'deploy_busy'], 409);
            }
            if ($request->method() === 'PUT' && $update === 422) {
                // Engine: core/app/Exceptions/ProblemException.php:60 -> one(field, code, message), {message, errors, problems}
                return Http::response([
                    'message' => 'The port is refused.',
                    'errors' => ['https_ports' => ['The port is refused.']],
                    'problems' => [['field' => 'https_ports', 'code' => $problem, 'message' => 'The port is refused.', 'hints' => []]],
                ], 422);
            }
            if ($request->method() === 'PUT') {
                if ($update === 200) {
                    foreach ($domains as $at => $row) {
                        $domains[$at]['type'] = strtolower((string) ($row['domain'] ?? '')) === basename((string) $path) ? 'main' : 'addon';
                    }
                }

                // Engine: core/app/Http/Controllers/User/DomainController.php:401 -> update, DomainResource + reload_pending, redeploy_task
                return Http::response(['data' => ['id' => 9, 'domain' => basename((string) $path), 'type' => 'main'], 'reload_pending' => false, 'redeploy_task' => ['id' => 77]], $update);
            }
            if ($request->method() === 'DELETE' && $delete === 422) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:432 -> destroy, a domain with subdomains is refused
                return Http::response(['message' => 'Cannot delete domain with existing subdomains', 'errors' => ['domain' => ['Cannot delete domain with existing subdomains']]], 422);
            }

            $domains = array_values(array_filter($domains, static fn (array $row): bool => basename((string) $path) !== ($row['domain'] ?? null)));

            // Engine: core/app/Http/Controllers/User/DomainController.php:457 -> destroy, DomainResource + files_kept
            return Http::response(['data' => [], 'files_kept' => []], $delete);
        });
    }

    /**
     * A domain as a current Engine lists it: its HTTPS ports, 443 unless `$ports` says otherwise.
     *
     * @param  list<int>  $ports
     * @return array<string, mixed>
     */
    private function domainRow(string $domain, string $type, array $ports = [443], ?int $main = null): array
    {
        // Engine: core/app/Http/Resources/DomainResource.php:32 -> toArray (id, domain, type, details with https_ports, https_port)
        return ['id' => 1, 'domain' => $domain, 'type' => $type, 'details' => ['aliases' => [], 'https_ports' => $ports, 'https_port' => $main ?? $ports[0]]];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function ownDomains(): array
    {
        return [$this->domainRow(self::MAIN, 'main')];
    }

    /**
     * The panel's Engine calls after the domain list, in order: `METHOD /domains[/<name>[/<action>]]` and the body.
     *
     * @return list<array{string, array<string, mixed>}>
     */
    private function domainCalls(): array
    {
        $calls = [];
        foreach (Http::recorded() as [$request]) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $at = strpos($path, '/domains');
            if ($at === false || ($request->method() === 'GET' && str_ends_with($path, '/domains'))) {
                continue;
            }
            $calls[] = [$request->method().' '.substr($path, $at), $request->data()];
        }

        return $calls;
    }

    public function test_put_url_normalises_to_an_origin_and_get_serves_it(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains());
        $client = $this->signedIn();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://X.example.com/'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://x.example.com', 'moved' => true]);

        $this->assertSame('https://x.example.com', app(PanelSettings::class)->get('userapp.url'));

        // CA: packages/client-area/src/apis/FreePanel.js:5
        $client->getJson('/api/community/settings')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:414 (`apply` reads `data.url`)
            ->assertJsonPath('url', 'https://x.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://panel.example.com:8443'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertJsonPath('url', 'https://panel.example.com:8443');

        // An explicit :443 is the default port, as the Engine's PA_PUBLIC_URL leaves it out.
        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://panel.example.com:443'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertJsonPath('url', 'https://panel.example.com');
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function invalidUrls(): array
    {
        return [
            'ftp scheme' => ['ftp://x.example.com'],
            'a path' => ['https://x.example.com/path'],
            'a query' => ['https://x.example.com?q=1'],
            'an empty query' => ['https://x.example.com/?'],
            'a fragment' => ['https://x.example.com/#top'],
            'credentials' => ['https://user:pass@x.example.com'],
            'no scheme' => ['x.example.com'],
            'empty' => [''],
            'missing' => [null],
            'over-long' => ['https://'.str_repeat('a', 250).'.com'],
            'http' => ['http://x.example.com'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidUrls')]
    public function test_put_url_rejects_an_invalid_url_before_any_engine_call(mixed $url): void
    {
        $this->selfProject();
        Http::fake();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => $url])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (Api.getErrorMessages on `errors`)
            ->assertJsonValidationErrors('url');

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        Http::assertNothingSent();
    }

    public function test_an_http_url_is_refused_as_the_engine_serves_https_only(): void
    {
        $this->selfProject();
        Http::fake();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'http://panel.example.com:8080'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
            ->assertJsonPath('errors.url.0', SettingsUrlRequest::NOT_HTTPS);
    }

    public function test_a_url_that_is_more_than_an_origin_is_refused_with_the_client_areas_sentence(): void
    {
        $this->selfProject();
        Http::fake();

        foreach (['https://x.example.com/path', 'https://x.example.com?q=1', 'https://x.example.com/?', 'https://x.example.com/#top', 'https://user:pass@x.example.com'] as $url) {
            // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
            $this->signedIn()->putJson('/api/community/settings/url', ['url' => $url])
                ->assertStatus(422)
                // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
                ->assertJsonPath('errors.url.0', SettingsUrlRequest::NOT_AN_ORIGIN);
        }

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        Http::assertNothingSent();
    }

    public function test_a_port_a_server_cannot_listen_on_is_named_as_the_port(): void
    {
        $this->selfProject();
        Http::fake();

        foreach (['https://panel.example.com:99999', 'https://panel.example.com:0', 'http://panel.example.com:65536'] as $url) {
            // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
            $this->signedIn()->putJson('/api/community/settings/url', ['url' => $url])
                ->assertStatus(422)
                // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
                ->assertJsonPath('errors.url.0', SettingsUrlRequest::BAD_PORT);
        }

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        Http::assertNothingSent();
    }

    public function test_put_url_gates(): void
    {
        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->putJson('/api/community/settings/url', ['url' => 'https://x.example.com'])->assertUnauthorized();

        $this->bindMultiUserEdition([]);
        $client = $this->signedIn();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://x.example.com'])->assertNotFound();
        // The gate answers before validation: an invalid body is still a 404.
        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', [])->assertNotFound();
    }

    public function test_put_url_is_throttled_with_the_settings_routes(): void
    {
        $client = $this->signedIn();
        for ($i = 0; $i < 30; $i++) {
            // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
            $client->putJson('/api/community/settings/url', [])->assertStatus(422);
        }

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', [])->assertStatus(429);
    }

    public function test_a_new_host_becomes_the_main_domain_and_the_address_the_panel_leaves_is_deleted(): void
    {
        $this->selfProject();
        $this->fakeEngine([
            ...$this->ownDomains(),
            $this->domainRow('hand.example.com', 'addon'),
            $this->domainRow('old.example.com', 'addon'),
        ]);
        app(PanelSettings::class)->set('userapp.url', 'https://old.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://new.example.com', 'moved' => true]);

        // The Engine's order: add, certificate, make it the main domain (a redeploy), delete the old main. The addon
        // an older panel added for its URL goes too; the domain added by hand stays.
        $this->assertSame([
            ['POST /domains', ['domain' => 'new.example.com', 'type' => 'addon']],
            ['POST /domains/new.example.com/request-ssl-cert', []],
            ['PUT /domains/new.example.com', ['main' => true]],
            ['DELETE /domains/'.self::MAIN, []],
            ['DELETE /domains/old.example.com', []],
        ], $this->domainCalls());
        $this->assertSame('https://new.example.com', app(PanelSettings::class)->get('userapp.url'));
    }

    public function test_a_new_host_on_another_port_answers_https_there_only(): void
    {
        $this->selfProject();
        $this->fakeEngine([...$this->ownDomains(), $this->domainRow('new.example.com', 'addon')]);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com:8443'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://new.example.com:8443', 'moved' => true]);

        // A host that is already a domain is not created again.
        $this->assertSame([
            ['POST /domains/new.example.com/request-ssl-cert', []],
            ['PUT /domains/new.example.com', ['main' => true, 'https_ports' => [8443], 'https_port' => 8443]],
            ['DELETE /domains/'.self::MAIN, []],
        ], $this->domainCalls());
    }

    public function test_the_server_s_own_name_keeps_the_engine_s_certificate(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains());

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://'.strtoupper(self::SERVER_NAME)])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://'.self::SERVER_NAME, 'moved' => true]);

        // The Engine refuses a certificate under its shared zone; the name has the Engine's own.
        $this->assertSame([
            ['POST /domains', ['domain' => self::SERVER_NAME, 'type' => 'addon']],
            ['PUT /domains/'.self::SERVER_NAME, ['main' => true]],
            ['DELETE /domains/'.self::MAIN, []],
        ], $this->domainCalls());
    }

    public function test_the_main_domain_on_another_port_is_one_update(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains());

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://'.self::MAIN.':8443'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://'.self::MAIN.':8443', 'moved' => true]);

        $this->assertSame([
            ['PUT /domains/'.self::MAIN, ['https_ports' => [8443], 'https_port' => 8443]],
        ], $this->domainCalls());
    }

    public function test_the_main_domain_goes_back_to_443(): void
    {
        $this->selfProject();
        $this->fakeEngine([$this->domainRow(self::MAIN, 'main', [8443])]);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://'.self::MAIN])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://'.self::MAIN, 'moved' => true]);

        $this->assertSame([
            ['PUT /domains/'.self::MAIN, ['https_ports' => [443], 'https_port' => 443]],
        ], $this->domainCalls());
    }

    public function test_the_address_the_panel_has_changes_nothing_but_drops_the_previous_panel_domain(): void
    {
        $this->selfProject();
        $this->fakeEngine([...$this->ownDomains(), $this->domainRow('old.example.com', 'addon')]);
        app(PanelSettings::class)->set('userapp.url', 'https://old.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://'.self::MAIN])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertExactJson(['url' => 'https://'.self::MAIN, 'moved' => false]);

        $this->assertSame([['DELETE /domains/old.example.com', []]], $this->domainCalls());
        $this->assertSame('https://'.self::MAIN, app(PanelSettings::class)->get('userapp.url'));
    }

    public function test_an_engine_before_mr_846_is_refused_before_anything_changes(): void
    {
        $this->selfProject();
        // Engine: core/app/Http/Resources/DomainResource.php:21 -> toArray, an older Engine has no https_ports in details
        $this->fakeEngine([['id' => 1, 'domain' => self::MAIN, 'type' => 'main', 'details' => ['aliases' => []]]]);
        $client = $this->signedIn();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
            ->assertJsonPath('errors.url.0', PanelAddressMove::ENGINE_TOO_OLD);
        $this->assertSame([], $this->domainCalls());
        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));

        // The address the panel has needs no move, so it is saved as before.
        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $client->putJson('/api/community/settings/url', ['url' => 'https://'.self::MAIN])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertJsonPath('moved', false);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function operatorRefusals(): array
    {
        return [
            'a port other than 443' => ['https_port_not_allowed', sprintf(PanelAddressMove::PORTS_NOT_ALLOWED, self::SELF)],
            'the server\'s own name' => ['host_domain_not_allowed', sprintf(PanelAddressMove::HOST_NOT_ALLOWED, 'new.example.com', self::SELF)],
            'any other refusal' => ['https_port_taken', 'The port is refused.'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('operatorRefusals')]
    public function test_a_refused_move_is_a_422_on_url_and_leaves_the_address(string $code, string $message): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), update: 422, problem: $code);
        app(PanelSettings::class)->set('userapp.url', 'https://old.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com:8443'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
            ->assertJsonPath('errors.url.0', $message);

        $this->assertSame('https://old.example.com', app(PanelSettings::class)->get('userapp.url'));
        $this->assertNotContains('DELETE /domains/'.self::MAIN, array_column($this->domainCalls(), 0));
    }

    public function test_a_panel_being_deployed_is_a_409_and_stores_nothing(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), update: 409);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(409)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:179 (`Api.getErrorMessage` shows `message`)
            ->assertJsonPath('message', PanelAddressMove::BUSY);

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        $this->assertNotContains('DELETE /domains/'.self::MAIN, array_column($this->domainCalls(), 0));
    }

    public function test_an_old_address_the_engine_keeps_does_not_undo_the_move(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), delete: 422);
        Log::spy();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:172 (`data.url`)
            ->assertJsonPath('moved', true);

        $this->assertSame('https://new.example.com', app(PanelSettings::class)->get('userapp.url'));
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context): bool => $context['domain'] === self::MAIN)->once();
    }

    public function test_an_ssl_failure_is_the_engine_s_reason_on_url_and_stores_nothing(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), ssl: 422);
        app(PanelSettings::class)->set('userapp.url', 'https://old.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (the inline error from `errors.url`)
            ->assertJsonPath('errors.url.0', 'Could not obtain a certificate for x: DNS problem');

        // The domain added for the attempt goes again, and nothing else changes.
        $this->assertSame([
            ['POST /domains', ['domain' => 'new.example.com', 'type' => 'addon']],
            ['POST /domains/new.example.com/request-ssl-cert', []],
            ['DELETE /domains/new.example.com', []],
        ], $this->domainCalls());
        $this->assertSame('https://old.example.com', app(PanelSettings::class)->get('userapp.url'));
    }

    public function test_an_engine_error_is_a_502_and_stores_nothing(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), ssl: 500);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(502)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:179 (`Api.getErrorMessage` shows `message`)
            ->assertJsonPath('message', PanelAddressMove::ENGINE_FAILED);

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        // A move that failed with the Engine's own error leaves no domain either.
        $this->assertSame([
            ['POST /domains', ['domain' => 'new.example.com', 'type' => 'addon']],
            ['POST /domains/new.example.com/request-ssl-cert', []],
            ['DELETE /domains/new.example.com', []],
        ], $this->domainCalls());
    }

    public function test_an_engine_that_cannot_list_domains_is_a_502_and_stores_nothing(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), list: 500);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(502)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:179 (`Api.getErrorMessage` shows `message`)
            ->assertJsonPath('message', PanelAddressMove::ENGINE_FAILED);

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
    }

    public function test_an_engine_refusal_to_add_the_domain_is_a_422_on_url(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains(), create: 422);

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:175 (Api.getErrorMessages on `errors`)
            ->assertJsonValidationErrors('url');

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
    }

    public function test_an_unset_self_project_is_a_409_and_stores_nothing(): void
    {
        config(['client-area.self_project' => '']);
        Http::fake();

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])
            ->assertStatus(409)
            // CA reads: packages/client-area/src/views/free/UrlChangeModal.vue:179 (`Api.getErrorMessage` shows `message`)
            ->assertJsonPath('message', PanelAddressMove::NOT_CONFIGURED);

        $this->assertNull(app(PanelSettings::class)->get('userapp.url'));
        Http::assertNothingSent();
    }

    public function test_a_paired_panel_gets_its_hub_admin_url_overwritten(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains());
        $hub = app(HubPairing::class);
        $hub->store('srv-1', 'secret', 'https://hub.example.com', 'Acme', 'https://old.example.com');

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])->assertOk();

        $this->assertSame('https://new.example.com', $hub->adminUrl());
        // The Hub learns the address at once, not at the next 5-minute report: a Hub login goes there.
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://hub.example.com/api/panel/v1/report'
            && $request['admin_url'] === 'https://new.example.com');
    }

    public function test_an_unpaired_panel_gets_no_hub_admin_url(): void
    {
        $this->selfProject();
        $this->fakeEngine($this->ownDomains());

        // CA: packages/client-area/src/views/free/UrlChangeModal.vue:171
        $this->signedIn()->putJson('/api/community/settings/url', ['url' => 'https://new.example.com'])->assertOk();

        $this->assertDatabaseMissing('settings', ['name' => 'hub.admin_url']);
        $this->assertNull(app(HubPairing::class)->adminUrl());
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/api/panel/v1/report'));
    }

    // ----- Sites base domain (`/api/community/settings/sites-base-domain`) -----------------------------------------
    //
    // The old Community Settings page had no such field (the operator ran `pae sites:base-domain` on the Engine); only
    // client-area-next calls these routes, so the citations name the old Community settings API they sit beside.

    /**
     * `system/info` of an Engine with no base domain on a public address (with `project_domain_bases`).
     *
     * @return array<string, mixed>
     */
    private static function systemInfo(?string $base = null, array $override = []): array
    {
        $bases = [
            ['base' => 'panelalpha.online', 'source' => 'panelalpha_online', 'suffixed' => true, 'publicly_resolvable' => true],
            ['base' => '203-0-113-10.panelalpha.direct', 'source' => 'panelalpha_direct', 'suffixed' => false, 'publicly_resolvable' => true],
            ['base' => 'local', 'source' => 'local', 'suffixed' => false, 'publicly_resolvable' => false],
        ];
        if ($base !== null) {
            array_unshift($bases, ['base' => $base, 'source' => 'sites_base_domain', 'suffixed' => false, 'publicly_resolvable' => null]);
        }

        return array_merge([
            'version' => '2.2.0',
            'sites_base_domain' => $base,
            'project_domain_bases' => $bases,
            'sites_certificates' => ['issuer' => 'self_signed', 'shared_zone' => $base === null, 'shared_zone_issuance' => false],
            'panelalpha_online' => ['last_error' => null],
        ], $override);
    }

    public function test_the_sites_base_domain_and_the_names_new_projects_get_are_read_from_the_engine(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:45 -> info, {data:{sites_base_domain, project_domain_bases, sites_certificates, panelalpha_online}}
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => self::systemInfo()])]);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the Community settings API; this route is client-area-next's only)
        $this->signedIn()->getJson('/api/community/settings/sites-base-domain')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (a flat body, as `apply` reads; client-area-next's fields)
            ->assertExactJson([
                'sites_base_domain' => null,
                'project_domain_bases' => [
                    ['base' => 'panelalpha.online', 'source' => 'panelalpha_online', 'suffixed' => true, 'publicly_resolvable' => true],
                    ['base' => '203-0-113-10.panelalpha.direct', 'source' => 'panelalpha_direct', 'suffixed' => false, 'publicly_resolvable' => true],
                    ['base' => 'local', 'source' => 'local', 'suffixed' => false, 'publicly_resolvable' => false],
                ],
                'certificate_issuer' => 'self_signed',
                'shared_zone_issuance' => false,
                'panelalpha_online_error' => null,
            ]);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'GET'
            && $request->url() === self::ENGINE.'/system/info');
    }

    public function test_an_engine_that_does_not_report_its_names_answers_null_and_the_online_error_is_passed_on(): void
    {
        $info = self::systemInfo(override: ['panelalpha_online' => ['last_error' => ['message' => 'Site quota used up', 'at' => '2026-11-06T14:00:00+00:00']]]);
        unset($info['project_domain_bases']);
        // Engine: core/app/Http/Controllers/SystemController.php:45 -> info (an older Engine: no project_domain_bases)
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => $info])]);

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the Community settings API; this route is client-area-next's only)
        $this->signedIn()->getJson('/api/community/settings/sites-base-domain')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (a flat body, as `apply` reads; client-area-next's fields)
            ->assertJsonPath('project_domain_bases', null)
            ->assertJsonPath('panelalpha_online_error', 'Site quota used up');
    }

    public function test_the_sites_base_domain_is_set_and_cleared_on_the_engine(): void
    {
        // The Engine keeps what it was sent ('' forgets it) and reports it in system/info.
        $stored = null;
        Http::fake(function (Request $request) use (&$stored) {
            if ($request->url() === self::ENGINE.'/system/ssl-config') {
                $stored = $request['sites_base_domain'] !== '' ? $request['sites_base_domain'] : null;

                // Engine: core/app/Http/Controllers/SystemController.php:263 -> updateSslConfig, {data: sslConfig()}
                return Http::response(['data' => ['issuer' => 'self_signed', 'sites_base_domain' => $stored]]);
            }

            // Engine: core/app/Http/Controllers/SystemController.php:45 -> info, read after the change
            return Http::response(['data' => self::systemInfo($stored)]);
        });
        $client = $this->signedIn();

        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $client->putJson('/api/community/settings/sites-base-domain', ['sites_base_domain' => ' mariusz.panelalpha.com '])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (the same body as GET, read after the change)
            ->assertJsonPath('sites_base_domain', 'mariusz.panelalpha.com')
            ->assertJsonPath('project_domain_bases.0', ['base' => 'mariusz.panelalpha.com', 'source' => 'sites_base_domain', 'suffixed' => false, 'publicly_resolvable' => null]);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT'
            && $request->url() === self::ENGINE.'/system/ssl-config'
            && $request->data() === ['sites_base_domain' => 'mariusz.panelalpha.com']);

        // An empty field clears it: the Engine forgets the setting and names new projects its own way again.
        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $client->putJson('/api/community/settings/sites-base-domain', ['sites_base_domain' => ''])
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (the same body as GET, read after the change)
            ->assertJsonPath('sites_base_domain', null)
            ->assertJsonPath('project_domain_bases.0.source', 'panelalpha_online');
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->data() === ['sites_base_domain' => '']);

        // A body without the field is the panel's 422, before the Engine.
        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $client->putJson('/api/community/settings/sites-base-domain', [])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/Settings.vue:451 (`fail` maps the 422 `errors` by request key)
            ->assertJsonValidationErrors('sites_base_domain');
        Http::assertSentCount(4);
    }

    public function test_a_sites_base_domain_the_engine_refuses_is_its_field_error(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:292-300 -> saveSitesBaseDomain, 422 sites_base_domain
        Http::fake(['engine.example.com/api/system/ssl-config' => Http::response([
            'message' => 'localhost is not a hostname sites can be named under.',
            'errors' => ['sites_base_domain' => ['localhost is not a hostname sites can be named under.']],
        ], 422)]);

        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $this->signedIn()->putJson('/api/community/settings/sites-base-domain', ['sites_base_domain' => 'localhost'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/Settings.vue:451 (`fail` maps the 422 `errors` by request key)
            ->assertJsonPath('errors.sites_base_domain.0', 'localhost is not a hostname sites can be named under.');
    }

    public function test_put_saves_a_sites_base_domain_sent_with_the_other_settings(): void
    {
        $sent = [];
        Http::fake(function (Request $request) use (&$sent) {
            if ($request->url() === self::ENGINE.'/system/ssl-config') {
                $sent[] = $request->data();

                // Engine: core/app/Http/Controllers/SystemController.php:263 -> updateSslConfig, {data: sslConfig()}
                return Http::response(['data' => ['issuer' => 'self_signed', 'sites_base_domain' => $request['sites_base_domain']]]);
            }

            // Engine: core/app/Http/Controllers/SystemController.php:45 -> info
            return Http::response(['data' => self::systemInfo()]);
        });
        $client = $this->signedIn();

        // CA: packages/client-area/src/apis/FreePanel.js:8 (the whole General form in one request)
        $client->putJson('/api/community/settings', $this->body(['sites_base_domain' => ' projects.example.com ']))
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Settings.vue:413 (`apply`, the same payload as GET)
            ->assertJsonPath('name', 'Office box');

        $this->assertSame([['sites_base_domain' => 'projects.example.com']], $sent);
        $this->assertSame('Office box', app(PanelSettings::class)->get('userapp.name'));

        // A body without the field - what the Client Area sends, as the domain has its own request - leaves the Engine alone.
        // CA: packages/client-area/src/apis/FreePanel.js:8
        $client->putJson('/api/community/settings', $this->body())->assertOk();
        $this->assertCount(1, $sent);
    }

    public function test_a_sites_base_domain_sent_with_the_settings_is_its_field_error_and_nothing_is_saved(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:292-300 -> saveSitesBaseDomain, 422 sites_base_domain
        Http::fake(['engine.example.com/api/system/ssl-config' => Http::response([
            'message' => 'not_a_domain is not a hostname sites can be named under.',
            'errors' => ['sites_base_domain' => ['not_a_domain is not a hostname sites can be named under.']],
        ], 422)]);

        // CA: packages/client-area/src/apis/FreePanel.js:8 (the whole General form in one request)
        $this->signedIn()->putJson('/api/community/settings', $this->body(['sites_base_domain' => 'not_a_domain']))
            ->assertStatus(422)
            // CA reads: packages/client-area/src/views/free/Settings.vue:451 (`fail` maps the 422 `errors` by request key)
            ->assertJsonPath('errors.sites_base_domain.0', 'not_a_domain is not a hostname sites can be named under.');

        $this->assertNull(app(PanelSettings::class)->get('userapp.name'));
    }

    public function test_the_sites_base_domain_routes_need_a_signed_in_owner_in_single_user_mode(): void
    {
        Http::fake();

        // CA: packages/client-area/src/apis/FreePanel.js:5 (the Community settings API; this route is client-area-next's only)
        $this->getJson('/api/community/settings/sites-base-domain')->assertUnauthorized();
        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $this->putJson('/api/community/settings/sites-base-domain', ['sites_base_domain' => 'example.com'])->assertUnauthorized();

        $this->bindMultiUserEdition([]);
        $client = $this->signedIn();
        // CA: packages/client-area/src/apis/FreePanel.js:5 (the Community settings API; this route is client-area-next's only)
        $client->getJson('/api/community/settings/sites-base-domain')->assertNotFound();
        // CA: packages/client-area/src/apis/FreePanel.js:8 (the Community settings API; this route is client-area-next's only)
        $client->putJson('/api/community/settings/sites-base-domain', ['sites_base_domain' => 'example.com'])->assertNotFound();

        Http::assertNothingSent();
    }
}
