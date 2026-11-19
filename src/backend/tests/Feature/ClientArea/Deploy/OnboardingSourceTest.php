<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Projects\GitService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Onboarding: test-git-url and git-branches are backed by
 * the Engine's POST /source/refs (Engine:
 * core/app/Http/Controllers/SourceRefsController.php:80 ->
 * SourceRefsController::refs, {data:{repository, default_branch, branches,
 * tags, truncated}}), which lists a remote repository before a project exists.
 * preview-env-example still reads the .env.example variable names from POST
 * /source/inspect (core/app/Http/Controllers/SourceInspectionController.php:118 ->
 * SourceInspectionController::inspect, {data:...}).
 *
 * The HostGuard is injected and faked so no test resolves a name.
 */
class OnboardingSourceTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->configureEngine();
        $this->fakeHostGuard();
    }

    /**
     * @param  list<string>  $denied  hosts the guard must reject (all others pass)
     */
    private function fakeHostGuard(array $denied = []): void
    {
        $this->app->instance(HostGuard::class, new class($denied) implements HostGuard
        {
            /** @param list<string> $denied */
            public function __construct(private readonly array $denied) {}

            public function assertAllowed(string $host): void
            {
                if (! $this->allows($host)) {
                    throw ValidationException::withMessages(['host' => ['blocked']]);
                }
            }

            public function allows(string $host): bool
            {
                return ! in_array($host, $this->denied, true);
            }

            public function validatedAddresses(string $host): array
            {
                if (! $this->allows($host)) {
                    throw ValidationException::withMessages(['host' => ['blocked']]);
                }

                return [$host];
            }
        });
    }

    public function test_test_git_url_reports_success_and_failure(): void
    {
        // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs
        Http::fake(['engine.example.com/api/source/refs' => Http::response(['data' => [
            'repository' => 'https://github.com/acme/site',
            'default_branch' => 'main',
            'branches' => ['main'],
            'tags' => [],
            'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => true, 'error_message' => null]);

        Http::assertSent(fn ($request) => $request['repository'] === 'https://github.com/acme/site');
    }

    public function test_test_git_url_engine_error_is_reported_not_thrown(): void
    {
        // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs
        Http::fake(['engine.example.com/api/source/refs' => Http::response(['message' => 'Authentication failed'], 422)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 (result.success)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/private'])
            ->assertOk()
            ->assertJson(['success' => false]);
    }

    /**
     * The repository test says what is wrong: the panel's own refusal (an
     * unparsable address) and the Engine's repository codes (a credentials
     * update sends them to a token check, the onboarding test gets the same
     * sentences). Any other refusal keeps the generic text.
     */
    public function test_test_git_url_names_what_is_wrong(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'not-a-url'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => 'Invalid repository URL.']);

        // Engine: core/app/Http/Controllers/SourceRefsController.php:106-119 -> the refusal code beside `errors`: a refused token,
        // then a remote that asks for credentials nobody sent, then a missing repository, a refusal without a code we know,
        // and an Engine that could not answer (the generic sentence).
        $refusal = static fn (string $code): array => [
            'message' => 'The Engine refused the repository.',
            'errors' => ['repository' => ['The Engine refused the repository.']],
            'problems' => [['field' => 'repository', 'code' => $code, 'message' => 'The Engine refused the repository.']],
        ];
        $noCode = ['message' => 'The Engine refused the repository.', 'errors' => ['repository' => ['The Engine refused the repository.']]];
        // Engine: core/app/Http/Controllers/SourceRefsController.php:106-119 -> RepositoryAddress/Egress problem codes
        Http::fake(['engine.example.com/api/source/refs' => Http::sequence()
            ->push($refusal('authentication_failed'), 422)
            ->push($refusal('authentication_failed'), 422)
            ->push($refusal('repository_not_found'), 422)
            ->push($noCode, 422)
            ->push(['message' => 'fatal: could not resolve host'], 502)]);

        // A token the remote refused keeps the token's own sentence.
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site', 'token' => 'ghp_test'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => GitService::TOKEN_REFUSED_MESSAGE]);

        // The remote asked for credentials and none was sent (a wrong address, or a private repository): not-found.
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => 'Could not read the repository.']);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => 'Could not read the repository.']);
    }

    public function test_git_branches_returns_the_inspected_branch(): void
    {
        // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs
        Http::fake(['engine.example.com/api/source/refs' => Http::response(['data' => [
            'repository' => 'https://github.com/acme/site',
            'default_branch' => 'develop',
            'branches' => ['develop', 'main'],
            'tags' => ['v1.0'],
            'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248 (POST /instances/git-branches)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:254 / :255 (branches / default_branch)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/projects/git-branches', ['repo_url' => 'https://github.com/acme/site'])
            ->assertOk()
            ->assertJson(['success' => true, 'default_branch' => 'develop'])
            ->assertJsonPath('branches.0', 'develop')
            ->assertJsonPath('branches.1', 'main');
    }

    public function test_preview_env_example_returns_key_names_without_values(): void
    {
        // Engine: core/app/Http/Controllers/SourceInspectionController.php:118 -> SourceInspectionController::inspect
        Http::fake(['engine.example.com/api/source/inspect' => Http::response(['data' => [
            'source' => ['type' => 'git', 'git' => ['repository' => 'https://github.com/acme/site', 'branch' => 'main']],
            'environment' => ['files' => ['.env.example'], 'variables' => ['APP_KEY', 'DB_PASSWORD'], 'variables_truncated' => false],
        ]])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:268 (POST /instances/preview-env-example)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:241 (has_example / variables)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/projects/preview-env-example', [
                'repo_url' => 'https://github.com/acme/site',
                'branch' => 'main',
            ])
            ->assertOk()
            ->assertJson([
                'has_example' => true,
                'branch' => 'main',
            ])
            ->assertJsonPath('variables.0', ['key' => 'APP_KEY', 'value' => ''])
            ->assertJsonPath('variables.1', ['key' => 'DB_PASSWORD', 'value' => '']);
    }

    public function test_onboarding_source_endpoints_require_authentication(): void
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        $this->postJson('/api/projects/test-git-url', ['repo_url' => 'x'])->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248 (POST /instances/git-branches)
        $this->postJson('/api/projects/git-branches', ['repo_url' => 'x'])->assertUnauthorized();
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:268 (POST /instances/preview-env-example)
        $this->postJson('/api/projects/preview-env-example', ['repo_url' => 'x'])->assertUnauthorized();
    }

    public function test_git_routes_reject_a_blocked_host(): void
    {
        $this->fakeHostGuard([TestNetwork::private(5)]);
        $user = User::factory()->create();

        // The repository test carries the guard's own sentence (the fake guard's text here).
        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'http://'.TestNetwork::private(5).'/repo.git'])
            ->assertOk()
            ->assertJson(['success' => false, 'error_message' => 'blocked']);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248 (POST /instances/git-branches)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:254 / :255 (branches / default_branch)
        $this->actingAs($user)
            ->postJson('/api/projects/git-branches', ['repo_url' => 'http://'.TestNetwork::private(5).'/repo.git'])
            ->assertOk()
            ->assertJson([
                'success' => false,
                'error_message' => 'Could not read the repository.',
                'branches' => [],
            ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:268 (POST /instances/preview-env-example)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:241 (has_example / variables)
        $this->actingAs($user)
            ->postJson('/api/projects/preview-env-example', ['repo_url' => 'http://'.TestNetwork::private(5).'/repo.git'])
            ->assertOk()
            ->assertJson(['has_example' => false, 'error_message' => 'Could not read the repository.']);

        // The Engine is never asked to fetch the blocked host.
        Http::assertNothingSent();
    }

    public function test_git_routes_are_rate_limited(): void
    {
        // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> SourceRefsController::refs
        Http::fake(['engine.example.com/api/source/refs' => Http::response(['data' => [
            'repository' => 'https://github.com/acme/site',
            'default_branch' => 'main',
            'branches' => ['main'],
            'tags' => [],
            'truncated' => false,
        ]])]);
        $user = User::factory()->create();

        for ($attempt = 0; $attempt < 10; $attempt++) {
            // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
            $this->actingAs($user)
                ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
                ->assertOk();
        }

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        $this->actingAs($user)
            ->postJson('/api/projects/test-git-url', ['repo_url' => 'https://github.com/acme/site'])
            ->assertStatus(429);
    }

    public function test_onboarding_ssl_certificate_returns_top_level_keys_from_the_engine(): void
    {
        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        // The two keys are top-level in the body (old
        // OnboardingController::detectedSslCertificate). The certificate is the
        // certificate the domain really serves, checked by the owning project's
        // Engine, never a panel-side handshake.
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'shop', [
                    'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
                ]),
            ]]),
            'engine.example.com/api/projects/shop/domains/shop.example.com/ssl-check' => Http::response(['data' => $this->engineSslCheck('shop.example.com', [
                'issuer' => 'Acme CA',
                'status' => 'expired',
                'days_remaining' => -3,
            ])]),
        ]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76 (Api.get(`/instances...`))
        // CA reads: packages/client-area/src/apis/Instances.js:77 / :79 (response.data.meta / response.data.data)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        $this->actingAs($user)
            ->getJson('/api/projects/onboarding/ssl-certificate?domain=shop.example.com')
            ->assertOk()
            ->assertJsonPath('is_ssl_certificate_detected', true)
            ->assertJsonPath('ssl_certificate.issuer_name', 'Acme CA')
            ->assertJsonPath('ssl_certificate.status', 'expired')
            ->assertJsonPath('ssl_certificate.valid', false)
            ->assertJsonPath('ssl_certificate.days_remaining', -3)
            // Never the `{data:...}` wrapper (the CA reads the body itself).
            ->assertJsonMissingPath('data');

        // The CA builds the path without a leading slash; both spellings work.
        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        $this->actingAs($user)
            ->getJson('/api/instances/onboarding/ssl-certificate?domain=shop.example.com')
            ->assertOk()
            ->assertJsonPath('is_ssl_certificate_detected', true);
    }

    public function test_onboarding_ssl_certificate_rejects_a_foreign_or_ip_domain(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'shop'),
            // A hostile/odd mirror row: the Engine reported an IP as the domain.
            $this->engineProject(11, 'iphost', ['domain' => TestNetwork::private(5)]),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76 (Api.get(`/instances...`))
        // CA reads: packages/client-area/src/apis/Instances.js:77 / :79 (response.data.meta / response.data.data)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $probe = new class implements PinnedProbe
        {
            /** @var list<array{host: string, address: string}> */
            public array $calls = [];

            public function httpsStatus(string $host, string $address): ?int
            {
                return null;
            }
        };
        $this->app->instance(PinnedProbe::class, $probe);

        // Not one of the user's domains → never reaches the network.
        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        $this->actingAs($user)
            ->getJson('/api/projects/onboarding/ssl-certificate?domain=foreign.example.com')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        // An IP literal is not a domain name – even when the
        // mirror carries it as one of the user's "domains".
        foreach ([TestNetwork::LOOPBACK, '[::1]', TestNetwork::private(5)] as $ip) {
            // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
            // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
            $this->actingAs($user)
                ->getJson('/api/projects/onboarding/ssl-certificate?domain='.rawurlencode($ip))
                ->assertStatus(422)
                ->assertJsonValidationErrors('domain');
        }

        $this->assertSame([], $probe->calls);
    }

    public function test_onboarding_ssl_certificate_rejects_any_domain_when_the_user_has_none(): void
    {
        // The reader sees the mirror only; no Engine address → no probe.
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function addresses(string $host): array
            {
                return [];
            }
        });

        $probe = new class implements PinnedProbe
        {
            public int $calls = 0;

            public function httpsStatus(string $host, string $address): ?int
            {
                $this->calls++;

                return null;
            }
        };
        $this->app->instance(PinnedProbe::class, $probe);

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/onboarding/ssl-certificate?domain=shop.example.com')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        $this->assertSame(0, $probe->calls);
    }

    public function test_onboarding_ssl_certificate_requires_a_domain(): void
    {
        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72 (GET instances/onboarding/ssl-certificate)
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:74 (data.data.is_ssl_certificate_detected)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/onboarding/ssl-certificate')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain']);
    }

    public function test_wordpress_versions_lists_the_org_offers(): void
    {
        // External: api.wordpress.org (WordPress.org core version-check API)
        Http::fake(['api.wordpress.org/*' => Http::response(['offers' => [
            ['version' => '6.5.2'],
            ['version' => '6.5.1'],
            ['version' => '3.9'],   // too old for wp-cli
            ['version' => '6.5.2'], // duplicate
        ]])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1003 (Api.cached().get("/instances/wordpress-versions"))
        // CA reads: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1004 (response.data.data)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/wordpress-versions')
            ->assertOk()
            ->assertExactJson(['data' => ['6.5.2', '6.5.1']]);

        // The CA builds `/instances/wordpress-versions`.
        // CA: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1003 (Api.cached().get("/instances/wordpress-versions"))
        // CA reads: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1004 (response.data.data)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/instances/wordpress-versions')
            ->assertOk();
    }

    public function test_wordpress_versions_degrade_to_empty_when_the_org_api_fails(): void
    {
        // External: api.wordpress.org (WordPress.org core version-check API)
        Http::fake(['api.wordpress.org/*' => Http::response('nope', 503)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1003 (Api.cached().get("/instances/wordpress-versions"))
        // CA reads: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1004 (response.data.data)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/wordpress-versions')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_onboarding_themes_proxies_the_wordpress_org_query(): void
    {
        // External: api.wordpress.org (WordPress.org themes info API)
        Http::fake(['api.wordpress.org/*' => Http::response([
            'themes' => [
                ['slug' => 'twentytwentyfour', 'name' => 'Twenty Twenty-Four'],
                ['slug' => 'storefront', 'name' => 'Storefront'],
            ],
            'info' => ['page' => 1, 'pages' => 3, 'results' => 40],
        ])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseTemplateModal.vue:465 (Api.get(`/instances/onboarding/themes?${query}`))
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseTemplateModal.vue:468 (response.data.data) / :473 (response.data.meta.total)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/onboarding/themes?page=1&per_page=12&browse=popular')
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'twentytwentyfour')
            ->assertJsonPath('meta.total', null)  // the info keys are passed through as-is
            ->assertJsonPath('meta.results', 40);

        Http::assertSent(function ($request) {
            $query = [];
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_contains($request->url(), 'api.wordpress.org/themes/info')
                && ($query['action'] ?? null) === 'query_themes'
                && ($query['request']['browse'] ?? null) === 'popular'
                && (int) ($query['request']['per_page'] ?? 0) === 12;
        });
    }

    public function test_onboarding_themes_degrade_to_empty_when_the_org_api_fails(): void
    {
        // External: api.wordpress.org (WordPress.org themes info API)
        Http::fake(['api.wordpress.org/*' => Http::response('nope', 502)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseTemplateModal.vue:501 (Api.get(`/instances/onboarding/themes?${query}`))
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseTemplateModal.vue:503 (response.data.data)
        $this->actingAs(User::factory()->create())
            ->getJson('/api/projects/onboarding/themes')
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta', []);
    }
}
