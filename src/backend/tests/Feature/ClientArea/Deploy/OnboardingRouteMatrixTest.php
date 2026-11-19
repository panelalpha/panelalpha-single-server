<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Support\VirtualService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Source inspection and the onboarding domain step + services: the
 * per-endpoint matrix for every onboarding/service route (`packages/client-area/routes/api.php`,
 * `packages/client-area/routes/hosting.php`):
 *
 *  - unauthenticated -> 401;
 *  - its own privilege missing -> 403 (only the routes that carry one);
 *  - unknown / foreign service -> 404; unknown / foreign project -> 404;
 *  - Engine down -> 503 on a connection error, 502 on an Engine 5xx
 *    (`EngineRequestException::render`);
 *  - the three pre-project source routes catch the Engine error and answer
 *    their old `{success:false}` / `{has_example:false}` body instead of a 5xx
 *    (`OnboardingService::GENERIC_ERROR`; the CA tolerates it).
 *
 * The deep files/domain logic already lives in OnboardingFilesDeployTest and
 * ServiceDomainTest; this file only pins the route-level contract, so the
 * Engine-down cases for `/projects|instances/upload-files` and
 * `/projects|instances/deploy` stay over there.
 *
 * CA call sites (request body / keys read):
 *   POST projects/test-git-url           OnboardingDeployFromGitModal.vue:230 / :235 (result.success) / :237 (result.error_message)
 *   POST projects/git-branches          OnboardingDeployFromGitModal.vue:248 / :254 / :255 (branches / default_branch)
 *   POST projects/preview-env-example   OnboardingDeployFromGitModal.vue:268 / OnboardingEnvVarsModal.vue:241 (has_example / variables)
 *   GET  projects|instances/onboarding/ssl-certificate  SuperQuickOnboardingMixin.js:72 / :74
 *   GET  projects|instances/wordpress-versions          OnboardingStandardFormModal.vue:1003 / :1004
 *   GET  projects|instances/onboarding/themes           OnboardingChooseTemplateModal.vue:465 / :468 (response.data.data) / :473 (response.data.meta.total)
 *   POST projects|instances/upload-files OnboardingModalWrapper.vue:905 / :916
 *   POST projects|instances/deploy       OnboardingModalWrapper.vue:924 / :932
 *   POST projects|instances/deploy-key   (new in git-deploy-keys; no CA call site yet, body `{service_id, domain_id?, shared_access?, repo_url}`)
 *   GET  services                        Services.vue:166 / :168
 *   GET  services/{id}/instance-options  InstanceActionsMixin.js:643 / :645
 *   GET  services/{id}/domains           ServiceDomainsMixin.js:55 / :59
 *   POST services/{id}/domains           OnboardingModalWrapper.vue:766 / :769 (files)
 *   GET  services/{id}/domains/validate  OnboardingChooseDomainModal.vue:631 (awaited; no response body key read)
 *   GET  services/{id}/domains/verify    OnboardingDomainTransferModal.vue:227 / :231
 *   GET  services/{id}/domains/resolve   SuperQuickOnboardingMixin.js:86 / :88
 */
class OnboardingRouteMatrixTest extends TestCase
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
     * The source-inspection routes run the user's repository host through the
     * HostGuard; the fake keeps the matrix off DNS.
     */
    private function fakeHostGuard(): void
    {
        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void
            {
                if (! $this->allows($host)) {
                    throw ValidationException::withMessages(['host' => ['blocked']]);
                }
            }

            public function allows(string $host): bool
            {
                return ! in_array($host, [TestNetwork::private(5)], true);
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

    /**
     * One case per onboarding/service route: route name => [method, path,
     * privilege, kind]. `kind` is `source` (degrades its own body), `engine`
     * (503/502 on a down Engine) or `plain` (no Engine on the request path).
     *
     * @return array<string, array{string, string, string|null, string}>
     */
    public static function onboardingServiceRoutes(): array
    {
        return [
            'client-area.projects.test_git_url' => ['POST', 'api/projects/test-git-url', null, 'source'],
            'client-area.projects.git_branches' => ['POST', 'api/projects/git-branches', null, 'source'],
            'client-area.projects.preview_env' => ['POST', 'api/projects/preview-env-example', null, 'source'],
            'client-area.projects.onboarding.ssl_certificate' => ['GET', 'api/projects/onboarding/ssl-certificate', null, 'plain'],
            'client-area.instances.onboarding.ssl_certificate' => ['GET', 'api/instances/onboarding/ssl-certificate', null, 'plain'],
            'client-area.projects.wordpress_versions' => ['GET', 'api/projects/wordpress-versions', null, 'plain'],
            'client-area.instances.wordpress_versions' => ['GET', 'api/instances/wordpress-versions', null, 'plain'],
            'client-area.projects.onboarding.themes' => ['GET', 'api/projects/onboarding/themes', null, 'plain'],
            'client-area.instances.onboarding.themes' => ['GET', 'api/instances/onboarding/themes', null, 'plain'],
            'client-area.projects.upload_files' => ['POST', 'api/projects/upload-files', null, 'plain'],
            'client-area.instances.upload_files' => ['POST', 'api/instances/upload-files', null, 'plain'],
            // The user-level service.create_instance privilege; the files-source
            // Engine-down cases are in OnboardingFilesDeployTest.
            'client-area.projects.deploy' => ['POST', 'api/projects/deploy', 'service.create_instance', 'plain'],
            'client-area.instances.deploy' => ['POST', 'api/instances/deploy', 'service.create_instance', 'plain'],
            // Deploy-key onboarding (git-deploy-keys): the same user-level privilege;
            // the create-with-key flow is OnboardingSshDeployTest.
            'client-area.projects.deploy_key' => ['POST', 'api/projects/deploy-key', 'service.create_instance', 'plain'],
            'client-area.instances.deploy_key' => ['POST', 'api/instances/deploy-key', 'service.create_instance', 'plain'],
            // Install WordPress (Engine 2.2.0): queues the install job; the
            // request itself makes no Engine call (InstallWordPressTest).
            'client-area.projects.install' => ['POST', 'api/projects/install', 'service.create_instance', 'plain'],
            'client-area.hosting.services.index' => ['GET', 'api/services', null, 'engine'],
            'client-area.hosting.services.instance_options' => ['GET', 'api/services/{service}/instance-options', null, 'plain'],
            'client-area.hosting.services.domains.index' => ['GET', 'api/services/{service}/domains', null, 'engine'],
            'client-area.hosting.services.domains.store' => ['POST', 'api/services/{service}/domains', 'service.create_instance', 'engine'],
            'client-area.hosting.services.domains.validate' => ['GET', 'api/services/{service}/domains/validate', null, 'plain'],
            'client-area.hosting.services.domains.verify' => ['GET', 'api/services/{service}/domains/verify', null, 'plain'],
            'client-area.hosting.services.domains.resolve' => ['GET', 'api/services/{service}/domains/resolve', null, 'plain'],
        ];
    }

    /**
     * @return array<string, array{string, string, string, string}>
     */
    public static function privilegedOnboardingRoutes(): array
    {
        $cases = [];
        foreach (self::onboardingServiceRoutes() as $name => [$method, $uri, $privilege]) {
            if ($privilege !== null) {
                $cases[$name] = [$method, $uri, $privilege, $name];
            }
        }

        return $cases;
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function serviceScopedRoutes(): array
    {
        $cases = [];
        foreach (self::onboardingServiceRoutes() as $name => [$method, $uri]) {
            if (str_contains($uri, '{service}')) {
                $cases[$name] = [$method, str_replace('{service}', '999', $uri), $name];
            }
        }

        return $cases;
    }

    /**
     * The routes that resolve `domain_id` = the files-source project id.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function projectScopedRoutes(): array
    {
        return [
            'client-area.projects.upload_files' => [
                'POST',
                'api/projects/upload-files?service_id='.VirtualService::ID.'&domain_id=999&filename=site.zip',
                'client-area.projects.upload_files',
            ],
            'client-area.instances.upload_files' => [
                'POST',
                'api/instances/upload-files?service_id='.VirtualService::ID.'&domain_id=999&filename=site.zip',
                'client-area.instances.upload_files',
            ],
            'client-area.projects.deploy' => ['POST', 'api/projects/deploy', 'client-area.projects.deploy'],
            'client-area.instances.deploy' => ['POST', 'api/instances/deploy', 'client-area.instances.deploy'],
            'client-area.projects.deploy_key' => ['POST', 'api/projects/deploy-key', 'client-area.projects.deploy_key'],
            'client-area.instances.deploy_key' => ['POST', 'api/instances/deploy-key', 'client-area.instances.deploy_key'],
        ];
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function sourceRoutes(): array
    {
        return [
            'test-git-url' => ['POST', 'api/projects/test-git-url', 'success'],
            'git-branches' => ['POST', 'api/projects/git-branches', 'success'],
            'preview-env-example' => ['POST', 'api/projects/preview-env-example', 'has_example'],
        ];
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function engineCallingRoutes(): array
    {
        $cases = [];
        foreach (self::onboardingServiceRoutes() as $name => [$method, $uri, , $kind]) {
            if ($kind === 'engine') {
                $cases[$name] = [$method, $uri, $name];
            }
        }

        return $cases;
    }

    #[DataProvider('onboardingServiceRoutes')]
    public function test_an_onboarding_or_service_route_requires_authentication(string $method, string $uri, ?string $privilege, string $kind): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA calls the onboarding/service APIs authenticated)
        $this->json($method, '/'.str_replace('{service}', (string) VirtualService::ID, strtok($uri, '?')))->assertUnauthorized();
    }

    #[DataProvider('privilegedOnboardingRoutes')]
    public function test_a_privileged_onboarding_route_answers_403_without_its_own_privilege(string $method, string $uri, string $privilege, string $name): void
    {
        $user = User::factory()->create();
        $this->denyPrivilege($privilege);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566 (the CA's domain step is gated on service.create_instance)
        $this->actingAs($user)
            ->json($method, '/'.str_replace('{service}', (string) VirtualService::ID, strtok($uri, '?')), $this->bodyFor($name))
            ->assertForbidden();
    }

    #[DataProvider('serviceScopedRoutes')]
    public function test_a_service_route_answers_404_for_an_unknown_service(string $method, string $uri, string $name): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55 (a service id the CA no longer sees)
        $this->actingAs($user)
            ->json($method, '/'.$uri, $this->bodyFor($name))
            ->assertNotFound();
    }

    #[DataProvider('projectScopedRoutes')]
    public function test_a_files_route_answers_404_for_an_unknown_project(string $method, string $uri, string $name): void
    {
        $user = User::factory()->create();
        // Seed one project so the repository does not re-sync before failing:
        // an unknown id is then a 404, not a down-Engine 503.
        $this->syncedApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924 (a project id the CA no longer sees)
        $this->actingAs($user)
            ->json($method, '/'.$uri, $this->bodyFor($name))
            ->assertNotFound();
    }

    #[DataProvider('sourceRoutes')]
    public function test_a_source_route_answers_its_old_body_on_a_connection_error(string $method, string $uri, string $key): void
    {
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (POST /instances/test-git-url)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:235 / :237 (result.success / result.error_message)
        $this->actingAs(User::factory()->create())
            ->json($method, '/'.$uri, $this->sourceBody($uri))
            ->assertOk()
            ->assertJsonPath($key, false);
    }

    #[DataProvider('sourceRoutes')]
    public function test_a_source_route_answers_its_old_body_on_an_engine_5xx(string $method, string $uri, string $key): void
    {
        // Engine: core/app/Http/Controllers/SourceInspectionController.php:118 -> SourceInspectionController::inspect
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248 (POST /instances/git-branches)
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:254 / :255 (branches / default_branch)
        $this->actingAs(User::factory()->create())
            ->json($method, '/'.$uri, $this->sourceBody($uri))
            ->assertOk()
            ->assertJsonPath($key, false);
    }

    #[DataProvider('engineCallingRoutes')]
    public function test_an_engine_calling_route_answers_503_on_a_connection_error(string $method, string $uri, string $name): void
    {
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55 (the CA surfaces the Engine error instead of an empty list)
        $this->actingAs(User::factory()->create())
            ->json($method, '/'.str_replace('{service}', (string) VirtualService::ID, strtok($uri, '?')), $this->bodyFor($name))
            ->assertStatus(503);
    }

    #[DataProvider('engineCallingRoutes')]
    public function test_an_engine_calling_route_answers_502_on_an_engine_5xx(string $method, string $uri, string $name): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (GET /services, GET .../domains)
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync (POST .../domains)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // A 5xx is the Engine's fault, not the user's: `EngineRequestException`
        // renders it 502, not 503.
        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55 (the CA surfaces the Engine error)
        $this->actingAs(User::factory()->create())
            ->json($method, '/'.str_replace('{service}', (string) VirtualService::ID, strtok($uri, '?')), $this->bodyFor($name))
            ->assertStatus(502);
    }

    /**
     * Since Engine 2.2.0 the install validates the old
     * `InstanceInstallRequest` fields; the whole flow is InstallWordPressTest's.
     */
    public function test_install_wordpress_validates_the_old_request(): void
    {
        $this->configureEngine();
        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605 (Api.post('/instances/install', …))
        $response = $this->actingAs(User::factory()->create())->postJson('/api/projects/install');
        // CA reads: packages/client-area/src/apis/Api.js:80 (field errors)
        $response->assertStatus(422)->assertJsonValidationErrors(['service_id', 'domain_id']);
        Http::assertNothingSent();
    }

    public function test_the_matrix_provider_covers_every_registered_onboarding_service_route(): void
    {
        $registered = [];
        foreach (Route::getRoutes() as $route) {
            if (! self::isOnboardingServiceRoute((string) $route->getName())) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $registered[] = $method.' '.$route->uri();
            }
        }

        $matrix = [];
        foreach (self::onboardingServiceRoutes() as [$method, $uri]) {
            $matrix[] = $method.' '.strtok($uri, '?');
        }

        sort($registered);
        sort($matrix);
        $this->assertSame($registered, $matrix, 'A registered onboarding/service route is missing from the matrix provider (or vice versa).');
    }

    private static function isOnboardingServiceRoute(string $name): bool
    {
        // The onboarding catalog and probe routes are
        // client-area-legacy's, named with its prefix.
        foreach (['client-area.', 'client-area-legacy.'] as $package) {
            if (str_starts_with($name, $package.'projects.onboarding.')
                || str_starts_with($name, $package.'instances.onboarding.')) {
                return true;
            }
        }

        return in_array($name, [
            'client-area.projects.test_git_url',
            'client-area.projects.git_branches',
            'client-area.projects.preview_env',
            'client-area.projects.wordpress_versions',
            'client-area.instances.wordpress_versions',
            'client-area.projects.upload_files',
            'client-area.instances.upload_files',
            'client-area.projects.deploy',
            'client-area.instances.deploy',
            'client-area.projects.deploy_key',
            'client-area.instances.deploy_key',
            'client-area.projects.install',
            'client-area.hosting.services.index',
            'client-area.hosting.services.instance_options',
            'client-area.hosting.services.domains.index',
            'client-area.hosting.services.domains.store',
            'client-area.hosting.services.domains.validate',
            'client-area.hosting.services.domains.verify',
            'client-area.hosting.services.domains.resolve',
        ], true);
    }

    /**
     * The body the CA sends for the routes that reach validation; the read
     * routes stay empty.
     *
     * @return array<string, mixed>
     */
    private function bodyFor(string $name): array
    {
        return match ($name) {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566 (`{domain, name, ...}`)
            'client-area.hosting.services.domains.store' => ['domain' => 'shop.example.com'],
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:924 (`{service_id, domain_id, source_type, remote_filepath, env_vars}`)
            'client-area.projects.deploy' => ['service_id' => VirtualService::ID, 'domain_id' => 999, 'source_type' => 'files', 'remote_filepath' => ['project/.panelalpha-upload/site.zip']],
            'client-area.instances.deploy' => ['service_id' => VirtualService::ID, 'domain_id' => 999, 'source_type' => 'files', 'remote_filepath' => ['project/.panelalpha-upload/site.zip']],
            // CA: (new in git-deploy-keys, no CA call site yet) `{service_id, domain_id, shared_access, repo_url}`
            'client-area.projects.deploy_key' => ['service_id' => VirtualService::ID, 'domain_id' => 999, 'repo_url' => 'git@github.com:acme/site.git'],
            'client-area.instances.deploy_key' => ['service_id' => VirtualService::ID, 'domain_id' => 999, 'repo_url' => 'git@github.com:acme/site.git'],
            default => [],
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function sourceBody(string $uri): array
    {
        return match ($uri) {
            // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:268 (`{repo_url, token, branch}`)
            'api/projects/preview-env-example' => ['repo_url' => 'https://github.com/acme/site', 'branch' => 'main'],
            // CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:230 (`{repo_url, token}`)
            default => ['repo_url' => 'https://github.com/acme/site'],
        };
    }
}
