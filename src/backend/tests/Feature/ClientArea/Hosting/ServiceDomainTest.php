<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Carbon\CarbonInterval;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Provisioning\ProvisionWaiter;
use PanelAlpha\ClientArea\Support\ProjectName;
use PanelAlpha\ClientArea\Support\VirtualService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The onboarding domain step of the virtual service.
 */
class ServiceDomainTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // The synchronous wait sleeps between polls; faked so no test waits 3 s
        // and the pinned interval can be asserted.
        Sleep::fake();
    }

    /**
     * Fake the Engine side of the files-source domain step: the project list,
     * the finished create task and the finished project the synchronous step
     * mirrors. `$create` is the `POST /projects` stub (202 +
     * TaskResource) the caller controls.
     *
     * @param  mixed  $create  the `POST /projects` stub (202 + TaskResource)
     * @param  array<string, mixed>  $project  overrides for the finished project
     */
    private function fakeFilesCreate($create, string $username = 'readmemd', array $project = [], int $taskId = 77): void
    {
        $finished = $this->engineProject($taskId, $username, array_merge([
            'domain' => $username.'.panelalpha.online',
            'status' => 'active',
            'details' => ['template' => 'dind', 'domain' => $username.'.panelalpha.online'],
        ], $project));

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll (UserCollection)
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
            'engine.example.com/api/projects' => $create,
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/'.$taskId => Http::response(['data' => ['id' => $taskId, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
            'engine.example.com/api/projects/'.$username => Http::response(['data' => $finished]),
        ]);
    }

    public function test_domains_index_lists_project_domains(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55
        // CA reads: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:59
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains')
            ->assertOk()
            ->assertJsonPath('data.0.domain', 'site1.example.com')
            ->assertJsonPath('data.0.id', Application::query()->where('engine_username', 'site1')->value('id'));
    }

    public function test_validate_accepts_a_fresh_domain_and_rejects_a_taken_one(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=fresh.example.com')
            ->assertOk();

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:606 (`error.response.data.errors.domain`)
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=site1.example.com')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
    }

    public function test_validate_rejects_a_domain_taken_by_another_users_project(): void
    {
        $this->configureEngine();
        $otherUser = User::factory()->create();
        $user = User::factory()->create();
        // The foreign project belongs to $otherUser in Pro/Multi – the
        // application mirror itself has no owner column, so the fake
        // repository below encodes that ownership.
        $foreign = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'foreign',
            'domain' => 'taken.example.com',
            'status' => 'active',
        ]);
        $own = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'own',
            'domain' => 'own.example.com',
            'status' => 'active',
        ]);

        // The taken check is a global integrity check, not a visibility read:
        // this repository stands in for Pro/Multi, where forUser() returns only
        // the acting user's project while domainsInUse() sees every mirrored
        // domain. Under forUser() the foreign
        // domain would pass and the request answers 200.
        $this->app->instance(ApplicationRepository::class, new class($foreign, $own) implements ApplicationRepository
        {
            public function __construct(
                private readonly Application $foreign,
                private readonly Application $own,
            ) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->own]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->own->id === $id ? $this->own : $this->foreign;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->own->domain, (string) $this->foreign->domain];
            }
        });

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:606 (`error.response.data.errors.domain`)
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=taken.example.com')
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'Domain is already in use.');
    }

    public function test_validate_accepts_a_subdomain_of_the_users_own_domain(): void
    {
        // The old subdomain-of rule only looked at domains of *other* users
        // (User\DomainController::check, packages/api/app/Http/Controllers/User/
        // DomainController.php:411-423). In Community the user sees every project, so
        // a subdomain of their own domain is accepted and the rule never fires.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'base'),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=shop.base.example.com')
            ->assertOk();
    }

    public function test_validate_accepts_a_subdomain_of_the_allocated_base_domain(): void
    {
        // The old check removed the plan/server onboarding base domains from
        // the subdomain-of list (array_diff($domains, $onboardingDomains),
        // User\DomainController.php:406-410): a subdomain of the Engine's
        // allocated base is not a taken domain.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info, `{data:{sites_base_domain}}`
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'panelalpha.online',
        ]])]);

        $user = User::factory()->create();
        $own = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'own',
            'domain' => 'own.example.com',
            'status' => 'active',
        ]);

        // The platform's base domain is in the global list but belongs to no
        // visible project – the Pro/Multi shape the old array_diff handled.
        $this->app->instance(ApplicationRepository::class, new class($own) implements ApplicationRepository
        {
            public function __construct(private readonly Application $own) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->own]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->own;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->own->domain, 'panelalpha.online'];
            }
        });

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=shop.panelalpha.online')
            ->assertOk();
    }

    public function test_validate_rejects_a_subdomain_of_an_existing_domain(): void
    {
        // An earlier version of this test used a domain the user can see,
        // which the old `user_id <> owner` rule never refused. The rule fires
        // only for a domain the asking user cannot see (domainsInUse() minus
        // forUser()); this repository stands in for Pro/Multi.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info, `{data:{sites_base_domain}}`
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'panelalpha.online',
        ]])]);

        $user = User::factory()->create();
        $own = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'own',
            'domain' => 'own.example.com',
            'status' => 'active',
        ]);

        // `forUser()` hides the other user's base domain while `domainsInUse()`
        // sees it – the Pro/Multi shape.
        $this->app->instance(ApplicationRepository::class, new class($own) implements ApplicationRepository
        {
            public function __construct(private readonly Application $own) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->own]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->own;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->own->domain, 'base.example.com'];
            }
        });

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:606 (`error.response.data.errors.domain`)
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=shop.base.example.com')
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'Domain name is not available.');
    }

    public function test_validate_accepts_a_fresh_domain_beside_another_users_unrelated_domain(): void
    {
        // The subdomain-of rule is the old
        // `Str::endsWith($domainName, '.'.$parentDomain)` over the domains the
        // asking user cannot see (User\DomainController::check,
        // packages/api/app/Http/Controllers/User/DomainController.php:411-423):
        // an unrelated hidden domain must not refuse a fresh name, and the rule
        // must short-circuit before the allocated-base Engine read.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info, `{data:{sites_base_domain}}`
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'panelalpha.online',
        ]])]);

        $user = User::factory()->create();
        $own = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'own',
            'domain' => 'own.example.com',
            'status' => 'active',
        ]);

        // `other.example.com` is in the global list but belongs to no visible
        // project; it is not a parent of the requested name.
        $this->app->instance(ApplicationRepository::class, new class($own) implements ApplicationRepository
        {
            public function __construct(private readonly Application $own) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->own]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->own;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->own->domain, 'other.example.com'];
            }
        });

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=fresh.example.org')
            ->assertOk();

        // The guard continued before the allocated-base read: no Engine call.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/system/info'));
    }

    public function test_resolve_returns_true_only_for_a_2xx_pinned_to_the_project_ip(): void
    {
        // Old User\DomainController::resolve (packages/api/app/Http/Controllers/
        // User/DomainController.php:476-482): Http::withOptions(CURLOPT_RESOLVE
        // "{domain}:443:{$domain->serverAccount->getIpAddress()}")->get('https://'.$domain)
        // and `is_resolved => $response->successful()`. The project IP comes
        // from Engine `config.ip_addresses.ipv4[0]`.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', [
                'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
            ]),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // The Engine host is only the fallback; with a project IP it must not
        // even be resolved.
        $resolver = new class implements HostResolver
        {
            /** @var list<string> */
            public array $hosts = [];

            public function addresses(string $host): array
            {
                $this->hosts[] = $host;

                return [TestNetwork::routable(34)];
            }
        };
        $this->app->instance(HostResolver::class, $resolver);

        $probe = new class implements PinnedProbe
        {
            /** @var list<array{host: string, address: string}> */
            public array $calls = [];

            public ?int $status = 200;

            public function httpsStatus(string $host, string $address): ?int
            {
                $this->calls[] = ['host' => $host, 'address' => $address];

                return $this->status;
            }
        };
        $this->app->instance(PinnedProbe::class, $probe);

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=site1.example.com')
            ->assertOk()
            ->assertJson(['is_resolved' => true]);

        $this->assertSame([['host' => 'site1.example.com', 'address' => TestNetwork::public(10)]], $probe->calls);
        $this->assertSame([], $resolver->hosts, 'The Engine host must not be resolved when the project has an IP.');

        // A non-2xx answer (404/500/redirect) is not resolved, the old panel's
        // `successful()`.
        foreach ([204, 301, 404, 500] as $status) {
            $probe->status = $status;
            // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
            // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
            $this->actingAs($user)
                ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=site1.example.com')
                ->assertOk()
                ->assertJson(['is_resolved' => $status >= 200 && $status < 300]);
        }
    }

    public function test_resolve_falls_back_to_the_engine_host_without_a_project_ip(): void
    {
        // A mirror row the first sync carried without a config uses the Engine
        // API host's address, still pinned and never the user's DNS.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function addresses(string $host): array
            {
                return [TestNetwork::routable(34)];
            }
        });

        $probe = new class implements PinnedProbe
        {
            /** @var list<array{host: string, address: string}> */
            public array $calls = [];

            public function httpsStatus(string $host, string $address): ?int
            {
                $this->calls[] = ['host' => $host, 'address' => $address];

                return 200;
            }
        };
        $this->app->instance(PinnedProbe::class, $probe);

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=site1.example.com')
            ->assertOk()
            ->assertJson(['is_resolved' => true]);

        $this->assertSame([['host' => 'site1.example.com', 'address' => TestNetwork::routable(34)]], $probe->calls);
    }

    public function test_the_address_fallback_uses_the_applications_own_engine_host(): void
    {
        // Multi-server safety: the fallback must resolve the
        // Engine the application belongs to (`forEngine($application->engine_id)`),
        // not the default one. A single-Engine edition hides the difference, so
        // the resolver fake answers the application's Engine (#1) and the
        // default Engine (#2) from different hosts.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        $hosts = new class implements HostResolver
        {
            /** @var list<string> */
            public array $hosts = [];

            public function addresses(string $host): array
            {
                $this->hosts[] = $host;

                return [TestNetwork::routable(34)];
            }
        };
        $this->app->instance(HostResolver::class, $hosts);

        $probe = new class implements PinnedProbe
        {
            /** @var list<array{host: string, address: string}> */
            public array $calls = [];

            public function httpsStatus(string $host, string $address): ?int
            {
                $this->calls[] = ['host' => $host, 'address' => $address];

                return 200;
            }
        };
        $this->app->instance(PinnedProbe::class, $probe);

        $this->app->instance(EngineResolver::class, new class implements EngineResolver
        {
            public function forEngine(int $engineId): EngineClient
            {
                return $engineId === 1
                    ? new EngineClient(new EngineConnection(1, 'https://engine-two.example.com/api', 'token'))
                    : new EngineClient(new EngineConnection(2, 'https://engine-one.example.com/api', 'token'));
            }

            public function defaultEngineId(): int
            {
                return 2;
            }

            /** @return list<int> */
            public function engineIds(): array
            {
                return [1, 2];
            }
        });
        $this->rememberNoSelfProject(app(EngineResolver::class)->forEngine(2));

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=site1.example.com')
            ->assertOk()
            ->assertJson(['is_resolved' => true]);

        $this->assertSame(['engine-two.example.com'], $hosts->hosts);
        $this->assertSame([['host' => 'site1.example.com', 'address' => TestNetwork::routable(34)]], $probe->calls);
    }

    public function test_public_ip_uses_only_a_valid_ipv4_mirror_value(): void
    {
        // `config.ip_addresses.ipv4` is untrusted Engine data; a
        // non-IPv4 literal must not become the pinned probe target, and an
        // invalid first entry must not hide a later valid one.
        $application = new Application();
        $application->engine_payload = ['config' => ['ip_addresses' => ['ipv4' => ['fe80::1']]]];
        $this->assertNull($application->publicIp());

        $application->engine_payload = ['config' => ['ip_addresses' => [
            'ipv4' => ['not-an-address', TestNetwork::public(10)],
        ]]];
        $this->assertSame(TestNetwork::public(10), $application->publicIp());

        // `ipv4` is documented as a list; a scalar value must
        // stay "no IP" as the removed `is_array` guard did.
        $application->engine_payload = ['config' => ['ip_addresses' => ['ipv4' => TestNetwork::public(10)]]];
        $this->assertNull($application->publicIp());
    }

    public function test_resolve_never_syncs_the_mirror(): void
    {
        // A CA polling route reads the mirror only: with `refresh: true` the
        // request would sync first.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=not%20a%20domain')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'projects/all'));
    }

    public function test_verify_reports_no_transfer_required(): void
    {
        // CA: packages/client-area/src/components/onboarding/OnboardingDomainTransferModal.vue:227
        // CA reads: packages/client-area/src/components/onboarding/OnboardingDomainTransferModal.vue:231
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services/'.VirtualService::ID.'/domains/verify?domain=fresh.example.com')
            ->assertOk()
            ->assertJson([
                'verification_allowed' => false,
                'verification_required' => false,
            ]);
    }

    /**
     * Community's onboarding always asks for a domain (`SimpleServiceOnboarding`), so a domain step without
     * one is still refused before the Engine is asked; the paid product generates it from the plan
     * (packages/edition-pro/tests/ClientArea/PlanOnboardingTest).
     */
    public function test_community_still_needs_the_domain(): void
    {
        $this->configureEngine();
        Http::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1716-1723
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1730-1733 (the error alert)
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['name' => 'My Blog'])
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'The domain field is required.');
        Http::assertNothingSent();
    }

    public function test_store_provisions_a_classic_project_for_the_plain_domain(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        // The CA's
        // createDomain does not send the installation type
        // (OnboardingModalWrapper.vue:1561-1572), so the plain domain step is a
        // classic project – PHP settings, cron and the push diff keep their
        // target.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])
            ->assertStatus(202)
            // The old `{id, domain}` shape, never the raw Application model.
            ->assertJsonPath('data.domain', 'shop.example.com')
            ->assertJsonMissingPath('data.engine_payload');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['domain'] === 'shop.example.com'
            && ! array_key_exists('template', $request->data()));

        // The classic domain-step project carries the onboarding marker the git
        // deploy reads to replace it.
        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertNotNull($application->onboarding_at);

        // No git source was sent, so no git source is recorded.
        $this->assertNull($application->git_source);
        $this->assertNull($application->git_provider);
        $this->assertNull($application->gitToken());
    }

    public function test_plain_domain_step_stores_the_custom_type_at_creation(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        // The panel knows it created a classic
        // custom project, so `applications.type` is written at creation. The
        // hourly WordPress probe only refines it later.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])
            ->assertStatus(202);

        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertSame(Application::TYPE_CUSTOM, $application->type);

        // The type did not wait for the `/wp/core` probe.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/wp/core'));
    }

    public function test_store_provisions_a_container_project_for_the_git_source(): void
    {
        $this->configureEngine();
        // The git source runs the repository host through the HostGuard; the
        // fake keeps the test off DNS.
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        // A domain step that names the source as git
        // creates the container the later `POST E:/source` attaches to. The CA
        // has no git domain step (the default git path opens the git modal
        // without one, `OnboardingModalWrapper.vue:533`); `source_type` is the
        // mechanism the files domain step already sends (`:754`), so the panel
        // rule under test is that kind selection.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:754
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => 'shop.example.com',
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
                'branch' => 'main',
                'token' => 'ghp_secret',
            ])
            ->assertStatus(202);

        // The container the onboarding asked for
        // carries its type at creation, so no kind-gated action waits for the
        // probe.
        $this->assertSame(
            Application::TYPE_CUSTOM,
            Application::query()->where('engine_username', 'shop')->sole()->type,
        );

        // The panel maps the CA's `repo_url`/`branch`/`token` onto the Engine's
        // `git_repo`/`git_branch`/`git_token` (the same mapping the deploy does).
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['template'] === 'dind'
            && $request['git_repo'] === 'https://github.com/example/site.git'
            && $request['git_branch'] === 'main'
            && $request['git_token'] === 'ghp_secret');

        // A container domain step is not the classic onboarding project the git
        // deploy replaces.
        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertNull($application->onboarding_at);

        // The git source the Engine accepted is kept on the row, like the Git
        // card keeps it, so the saved token shows and auto-deploy has it.
        $this->assertSame('https://github.com/example/site.git', $application->git_source);
        $this->assertSame('github', $application->git_provider);
        $this->assertSame('ghp_secret', $application->gitToken());
        $this->assertNotSame('ghp_secret', $application->getRawOriginal('git_token'), 'the token is encrypted at rest');
    }

    public function test_plain_domain_step_creates_a_classic_project_that_gets_php_settings(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 55,
                'username' => 'shop',
                'details' => ['username' => 'shop', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1575
        $this->actingAs($user)
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])
            ->assertStatus(202);

        // A classic project: the Engine was not asked for a dind template, so
        // the dind-only PHP-settings gate does not fire.
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && ! array_key_exists('template', $request->data()));
        $application = Application::query()->where('engine_username', 'shop')->sole();
        $this->assertFalse($application->isContainer());

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        // Engine: core/app/Http/Controllers/DomainController.php:128 -> setPhpDirectives
        Http::fake([
            'engine.example.com/api/projects/shop/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'shop.example.com', 'type' => 'main', 'details' => []],
            ]]),
            'engine.example.com/api/domains/shop.example.com/php-directives' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/php-settings", [
                ['directive' => 'memory_limit', 'value' => '512M'],
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/domains/shop.example.com/php-directives')
            && $request['settings'] === ['memory_limit' => '512M']);
    }

    public function test_install_wordpress_stays_classic(): void
    {
        // Install-WordPress is the only path that needs
        // a classic project, and it stays in POST /projects/install: since
        // Engine 2.2.0 it queues the classic install job on the project
        // the plain domain step created – it is never converted into a
        // container create.
        Queue::fake();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop', 'details' => ['username' => 'shop', 'domain' => 'shop.example.com']]], 202),
        ]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $domainId = $this->actingAs($user)->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])->json('data.id');
        $sentByTheDomainStep = count(Http::recorded());
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605 (POST /instances/install)
        $this->actingAs($user)
            ->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $domainId])
            ->assertCreated();

        // The request itself makes no Engine call; the job does.
        $this->assertCount($sentByTheDomainStep, Http::recorded());
        Http::assertNotSent(fn ($request) => array_key_exists('template', $request->data()));
        Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob::class);
        $this->assertFalse(Application::query()->findOrFail($domainId)->isContainer());
    }

    public function test_store_provisions_a_container_project_for_the_files_source(): void
    {
        $this->configureEngine();
        // Engine: POST /projects 202 TaskResource, `details.domain` filled by
        // ProjectCreator::queue (core/app/Lib/Project/ProjectCreator.php:123-137);
        // the CA's lost-response recovery matches the created row by domain
        // (OnboardingModalWrapper.vue:675-745).
        $this->fakeFilesCreate(
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
        );

        // The CA's files-source step sends `{source_type:"files", name}` with no
        // domain (OnboardingModalWrapper.vue:754).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.id', Application::query()->where('engine_username', 'readmemd')->value('id'))
            ->assertJsonPath('data.domain', 'readmemd.panelalpha.online');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['template'] === 'dind'
            && $request['name'] === 'readmemd');

        // The files-source container also carries
        // its type at creation.
        $this->assertSame(
            Application::TYPE_CUSTOM,
            Application::query()->where('engine_username', 'readmemd')->sole()->type,
        );
    }

    public function test_store_sanitises_the_files_source_upload_name(): void
    {
        $this->configureEngine();
        $this->fakeFilesCreate(
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            Http::response(['data' => [
                'id' => 78,
                'username' => 'mywebsitezip',
                'details' => ['username' => 'mywebsitezip', 'domain' => 'mywebsitezip.panelalpha.online'],
            ]], 202),
            'mywebsitezip',
            [],
            78,
        );

        // The CA sends the uploaded archive's file name; the Engine's project
        // name rule is `^[a-z][a-z0-9]{2,14}$` (Rules/ProjectName.php:18) and its
        // own suggestion strips non-alphanumerics and cuts to 15. The CA's
        // recovery slug does the same (OnboardingModalWrapper.vue:660-672).
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'My Website.zip',
            ])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && $request['name'] === 'mywebsitezip');
    }

    public function test_store_omits_an_unsalvageable_files_source_name(): void
    {
        $this->configureEngine();
        $this->fakeFilesCreate(
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            Http::response(['data' => [
                'id' => 79,
                'username' => 'app1a2b3c',
                'details' => ['username' => 'app1a2b3c', 'domain' => 'app1a2b3c.panelalpha.online'],
            ]], 202),
            'app1a2b3c',
            [],
            79,
        );

        // ".." leaves nothing to suggest; the Engine generates the name rather
        // than the panel answering its own 422.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => '...',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'app1a2b3c.panelalpha.online');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects')
            && ! array_key_exists('name', $request->data()));
    }

    public function test_store_maps_a_missing_engine_configuration_to_422_domain(): void
    {
        // A files create with no Engine configured must answer
        // 422 keyed `domain`, not the Engine exception's 503 the CA would read as
        // a lost response and adopt the half-created project. No configureEngine()
        // here: the resolver throws before any HTTP call.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => 'readmemd'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
    }

    /**
     * Engine: POST /projects with `name` reports the refusal under that field
     * (`UserStoreRequest::nameField()` -> `reportedField()`) and adds a stable
     * `problems[]` code (ProblemException; Handler.php:159-170).
     */
    #[DataProvider('takenNameCodes')]
    public function test_store_retries_the_files_source_without_a_taken_name(string $code): void
    {
        $this->configureEngine();
        $message = $code === 'name_taken'
            ? "A project named 'readmemd' already exists. Choose another name."
            : "'readmemd' is reserved or already used by the system. Choose another name.";

        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :283 -> projects storeAsync
        $this->fakeFilesCreate(
            Http::sequence()
                // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (422 ProblemException)
                ->push([
                    'message' => $message,
                    'errors' => ['name' => [$message]],
                    'problems' => [['field' => 'name', 'code' => $code, 'message' => $message]],
                ], 422)
                // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
                ->push(['data' => [
                    'id' => 77,
                    'username' => 'readmemd1',
                    'details' => ['username' => 'readmemd1', 'domain' => 'readmemd1.panelalpha.online'],
                ]], 202),
            'readmemd1',
        );

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'readmemd1.panelalpha.online');

        $attempts = collect(Http::recorded())
            ->map(fn ($pair) => $pair[0])
            ->filter(fn ($request) => $request->method() === 'POST' && str_ends_with($request->url(), '/api/projects'))
            ->values();

        $this->assertCount(2, $attempts, 'A taken panel-derived name must be retried once.');
        $this->assertSame('readmemd', $attempts[0]['name']);
        $this->assertArrayNotHasKey('name', $attempts[1]->data());
    }

    /**
     * @return array<string, array{string}>
     */
    public static function takenNameCodes(): array
    {
        return [
            'name_taken' => ['name_taken'],
            'name_unavailable' => ['name_unavailable'],
        ];
    }

    public function test_store_waits_for_the_files_create_task_and_mirrors_the_finished_project(): void
    {
        // The old panel's files create was synchronous (User\DomainController::
        // create, packages/api/app/Http/Controllers/User/DomainController.php:
        // 108-140): the CA reads the finished `{id, domain}` from the response.
        // `POST /projects` is async, so the step polls the task and mirrors the
        // project before answering.
        $this->configureEngine();
        $this->fakeFilesCreate(
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'status' => 'queued',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
            'readmemd',
            ['config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]]],
        );

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', 'readmemd.panelalpha.online');

        // The finished project resource was mirrored: the row is `active` and
        // carries the Engine config, not the `pending` row `POST /projects` left.
        $row = Application::query()->where('engine_username', 'readmemd')->sole();
        $this->assertSame('active', $row->status);
        $this->assertSame(TestNetwork::public(10), $row->publicIp());
        // The step marks the project in files onboarding only after the create
        // task finished.
        $this->assertNotNull($row->onboarding_files_at);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/tasks/77'));
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/projects/readmemd'));
    }

    public function test_store_fails_when_the_files_create_task_fails(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource, status failed)
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (failed task carries details.error)
            'engine.example.com/api/tasks/77' => Http::response(['data' => [
                'id' => 77,
                'status' => 'failed',
                'details' => ['error' => 'The deploy failed.'],
            ]]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            // A definite Engine failure answers 422 keyed `domain` with the Engine
            // message; 502/503/504 would make the CA treat it as a lost response
            // and adopt the half-created project.
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain')
            ->assertJsonPath('errors.domain.0', 'The deploy failed.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/api/projects/readmemd'));

        // A failed create never entered files onboarding.
        $this->assertNull(Application::query()->where('engine_username', 'readmemd')->value('onboarding_files_at'));
    }

    public function test_store_gives_up_on_the_files_create_task_at_the_long_budget(): void
    {
        // The synchronous wait is bounded by EngineClient::LONG_TIMEOUT_SECONDS
        //Pinned at its literal.
        $this->assertSame(1700, EngineClient::LONG_TIMEOUT_SECONDS);

        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (still running)
            'engine.example.com/api/tasks/77' => function () {
                // The task never becomes terminal: move the wall clock past the
                // long-call budget so the waiter stops instead of looping.
                Carbon::setTestNow(Carbon::now()->addSeconds(EngineClient::LONG_TIMEOUT_SECONDS + 1));

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => ['id' => 77, 'status' => 'running']]);
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            // An exhausted budget is a 422 with the "still being created" text,
            // never a 502/503/504 the CA would read as a lost response.
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', ProvisionWaiter::STILL_CREATING);

        $this->assertSame('The project is still being created – try again in a minute.', ProvisionWaiter::STILL_CREATING);

        // The budget guard runs before the marker is set: still null.
        $this->assertNull(Application::query()->where('engine_username', 'readmemd')->value('onboarding_files_at'));
        Carbon::setTestNow();
    }

    public function test_store_gives_up_only_at_the_long_budget(): void
    {
        // The boundary is pinned: at `LONG_TIMEOUT_SECONDS - 1` the
        // waiter still polls, at `LONG_TIMEOUT_SECONDS` it ends.
        $this->configureEngine();
        $start = Carbon::parse('2026-01-01T00:00:00Z');
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (never terminal)
            'engine.example.com/api/tasks/77' => function () use (&$polls, $start) {
                $polls++;
                // The waiter's deadline is `$start + LONG`; the first poll is
                // one second short and the second reaches it exactly. A larger
                // budget keeps polling, so the fallback jumps past any budget
                // instead of hanging the suite.
                $offset = match ($polls) {
                    1 => EngineClient::LONG_TIMEOUT_SECONDS - 1,
                    2 => EngineClient::LONG_TIMEOUT_SECONDS,
                    default => EngineClient::LONG_TIMEOUT_SECONDS * $polls,
                };
                Carbon::setTestNow($start->copy()->addSeconds($offset));

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => ['id' => 77, 'status' => 'running']]);
            },
        ]);

        Carbon::setTestNow($start);

        try {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
            $this->actingAs(User::factory()->create())
                ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                    'source_type' => 'files',
                    'name' => 'readmemd',
                ])
                ->assertStatus(422)
                ->assertJsonPath('errors.domain.0', ProvisionWaiter::STILL_CREATING);
        } finally {
            Carbon::setTestNow();
        }

        // Exactly two polls: cap - 1 continued, cap ended.
        $this->assertSame(2, $polls);

        // The poll interval is pinned at 3 s and the wait really used Sleep.
        $this->assertSame(3, ProvisionWaiter::POLL_SECONDS);
        Sleep::assertSlept(fn (CarbonInterval $duration): bool => (int) $duration->totalSeconds === 3, 1);

        // The budget guard runs before the marker is set: still null.
        $this->assertNull(Application::query()->where('engine_username', 'readmemd')->value('onboarding_files_at'));
    }

    public function test_store_fails_when_the_files_create_task_is_cancelled(): void
    {
        // The Engine can cancel a create as well as fail it; both are terminal
        // and answer the Engine's message, never the budget text.
        $this->configureEngine();
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77' => function () use (&$polls) {
                $polls++;

                // A cancellation carries the same terminal handling as a
                // failure; from the third poll it answers completed so a
                // regression that ignores `cancelled` cannot loop to the real
                // budget before the assertion runs.
                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => [
                    'id' => 77,
                    'status' => $polls >= 3 ? 'completed' : 'cancelled',
                    'details' => ['error' => 'The Engine cancelled the create.'],
                ]]);
            },
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show
            'engine.example.com/api/projects/readmemd' => Http::response(['data' => $this->engineProject(77, 'readmemd')]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'The Engine cancelled the create.');

        $this->assertSame(1, $polls);

        // A cancelled create never entered files onboarding.
        $this->assertNull(Application::query()->where('engine_username', 'readmemd')->value('onboarding_files_at'));
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function pollHiccups(): array
    {
        return [
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (connection error)
            'connection error' => [fn () => throw new ConnectionException('down')],
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (5xx)
            'engine 500' => [fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('pollHiccups')]
    public function test_store_retries_a_poll_hiccup_inside_the_budget(\Closure $hiccup): void
    {
        // A hiccup during the synchronous wait is not a failure: the step retries
        // inside the budget instead of answering 503/502.
        $this->configureEngine();
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77*' => function () use (&$polls, $hiccup) {
                $polls++;
                if ($polls === 1) {
                    return $hiccup();
                }

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => ['id' => 77, 'status' => 'completed']]);
            },
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
            'engine.example.com/api/projects/readmemd' => Http::response(['data' => $this->engineProject(77, 'readmemd')]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202);

        $this->assertSame(2, $polls, 'The hiccup must be retried inside the budget.');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/projects/readmemd'));
    }

    public function test_store_measures_the_wait_budget_from_the_request_start(): void
    {
        // The budget starts at the request, not at the first poll: the project
        // create and its retry-without-`name` count against it. A from-first-poll
        // budget would keep polling here.
        $this->configureEngine();
        $start = Carbon::parse('2026-01-01T00:00:00Z');
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => function () use ($start) {
                // The create call itself consumes 5 s of the request.
                Carbon::setTestNow($start->copy()->addSeconds(5));

                // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
                return Http::response(['data' => [
                    'id' => 77,
                    'username' => 'readmemd',
                    'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
                ]], 202);
            },
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77*' => function () use (&$polls, $start) {
                $polls++;
                Carbon::setTestNow($start->copy()->addSeconds(EngineClient::LONG_TIMEOUT_SECONDS + $polls));

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => ['id' => 77, 'status' => 'running']]);
            },
        ]);

        Carbon::setTestNow($start);

        try {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
            $this->actingAs(User::factory()->create())
                ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                    'source_type' => 'files',
                    'name' => 'readmemd',
                ])
                ->assertStatus(422)
                ->assertJsonPath('errors.domain.0', ProvisionWaiter::STILL_CREATING);
        } finally {
            Carbon::setTestNow();
        }

        // One poll: the wait was already past its deadline when the first poll
        // returned, because the budget started at the request.
        $this->assertSame(1, $polls);
    }

    public function test_store_carries_the_task_after_id_between_polls(): void
    {
        // The Engine TaskResource's next_after_id is the cursor the next poll
        // sends as after_id.
        $this->configureEngine();
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77*' => function () use (&$polls) {
                $polls++;

                if ($polls === 1) {
                    // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                    return Http::response(['data' => ['id' => 77, 'status' => 'running', 'next_after_id' => 5]]);
                }

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
                return Http::response(['data' => ['id' => 77, 'status' => 'completed']]);
            },
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
            'engine.example.com/api/projects/readmemd' => Http::response(['data' => $this->engineProject(77, 'readmemd')]),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/tasks/77') && str_contains($request->url(), 'after_id=5'));
        $this->assertSame(2, $polls);
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function allocatedBaseReadFailures(): array
    {
        return [
            // Engine: core/app/Http/Controllers/SystemController.php:41 -> system/info (connection error)
            'connection error' => [fn () => throw new ConnectionException('down')],
            // Engine: core/app/Http/Controllers/SystemController.php:41 -> system/info (5xx)
            'engine 500' => [fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('allocatedBaseReadFailures')]
    public function test_validate_fails_closed_when_the_allocated_base_read_errors(\Closure $failure): void
    {
        // The subdomain-of rule only consults the Engine's base domains when the
        // rule would fire. A read failure must fail **closed**: the name is
        // refused, never accepted, and the typing request never becomes a 503.
        // An Engine 5xx is an Engine error too.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/SystemController.php:41 -> system/info
        Http::fake(['engine.example.com/api/system/info' => $failure]);

        $user = User::factory()->create();
        $own = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'own',
            'domain' => 'own.example.com',
            'status' => 'active',
        ]);

        $this->app->instance(ApplicationRepository::class, new class($own) implements ApplicationRepository
        {
            public function __construct(private readonly Application $own) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->own]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->own;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->own->domain, 'base.example.com'];
            }
        });

        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        // CA reads: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:606 (`error.response.data.errors.domain`)
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=shop.base.example.com')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
    }

    public function test_store_checks_the_create_instance_privilege_before_validation(): void
    {
        // The old route's `privilege:` middleware ran before the FormRequest
        //A denied user gets 403, never the 422 the empty body
        // would produce.
        $this->configureEngine();
        $this->denyPrivilege('service.create_instance');

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [])
            ->assertForbidden();

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/api/projects'));
    }

    public function test_the_files_onboarding_domain_step_does_not_dispatch_an_install_watcher(): void
    {
        // The no-watcher guard, for the files branch: the create task is followed inline
        // by the domain step, so it must not push any watcher.
        $this->configureEngine();
        $this->fakeFilesCreate(
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            Http::response(['data' => [
                'id' => 77,
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
        );

        Queue::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => 'readmemd',
            ])
            ->assertStatus(202);

        Queue::assertNothingPushed();
    }

    public function test_the_onboarding_domain_step_does_not_dispatch_an_install_watcher(): void
    {
        $this->configureEngine();
        // The onboarding git source runs the repository host through the
        // HostGuard; the fake keeps the test off DNS.
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :283 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        Queue::fake();

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => 'shop.example.com',
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
            ])
            ->assertStatus(202);

        // The create task is not the installation: the old panel's `create` was
        // synchronous and the CA reads `response.data.data` instead of waiting
        // (OnboardingModalWrapper.vue:1566-1581); the following install row
        // (`/instances/install`) owns `installation_*`. A create-task
        // watcher would drive the install progress UI before the install starts.
        Queue::assertNothingPushed();
    }

    public function test_git_onboarding_never_sets_the_files_onboarding_marker(): void
    {
        // Only the files-source domain step marks a project in files
        // onboarding; a git project must not pass the onboarding upload/deploy
        // gate.
        $this->configureEngine();
        // The git source runs the repository host through the HostGuard; the
        // fake keeps the test off DNS.
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :283 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => 'shop.example.com',
                'source_type' => 'git',
                'repo_url' => 'https://github.com/example/site.git',
            ])
            ->assertStatus(202);

        $this->assertNull(
            Application::query()->where('engine_username', 'shop')->value('onboarding_files_at'),
        );
    }

    public function test_store_does_not_retry_a_422_when_no_name_was_sent(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :283 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response([
                'message' => "A project named 'app1a2b3c' already exists. Choose another name.",
                'errors' => ['username' => ["A project named 'app1a2b3c' already exists. Choose another name."]],
                'problems' => [['field' => 'username', 'code' => 'name_taken', 'message' => "A project named 'app1a2b3c' already exists. Choose another name."]],
            ], 422),
        ]);

        // '...' leaves nothing to suggest, so the panel sends no `name`: there
        // is no panel-derived name to drop and a retry would repeat the same
        // request.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'source_type' => 'files',
                'name' => '...',
            ])
            ->assertStatus(422);

        $attempts = collect(Http::recorded())
            ->filter(fn ($pair) => $pair[0]->method() === 'POST' && str_ends_with($pair[0]->url(), '/api/projects'));

        $this->assertCount(1, $attempts);
    }

    public function test_project_name_suggestion_strips_leading_digits(): void
    {
        // Engine ProjectName::suggest(): non-alphanumerics removed, lowercased,
        // leading digits stripped, cut to 15 (core/app/Rules/ProjectName.php:52,
        // core/app/Lib/Deploy/ProjectName.php:8-25).
        $this->assertSame('websitezip', ProjectName::suggest('123Website.zip'));
        $this->assertSame('abc', ProjectName::suggest('9abc'));
        $this->assertNull(ProjectName::suggest('1234'));
        $this->assertSame('abc123def456ghi', ProjectName::suggest('abc123def456ghi789'));
    }

    public function test_store_requires_a_domain_otherwise(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['name' => 'My Site'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['domain']);
    }

    public function test_store_rejects_a_private_git_host(): void
    {
        // A project created with `git_repo` makes the Engine clone a user URL;
        // a private host is refused before provisioning.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', [
                'domain' => 'shop.example.com',
                'source_type' => 'git',
                'repo_url' => 'http://'.TestNetwork::private(5).'/site.git',
            ])
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/projects'));
    }

    public function test_resolve_is_throttled_by_the_outbound_limiter(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);
        $user = User::factory()->create();

        for ($attempt = 0; $attempt < 10; $attempt++) {
            // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
            $this->actingAs($user)
                ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=not%20a%20domain')
                ->assertStatus(422);
        }

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=not%20a%20domain')
            ->assertStatus(429);
    }

    public function test_service_domains_require_authentication(): void
    {
        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:55
        $this->getJson('/api/services/'.VirtualService::ID.'/domains')->assertUnauthorized();
    }

    public function test_resolve_rejects_a_domain_that_is_not_the_users(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // Never reached: the domain is unknown, so no outbound probe is made.
        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=foreign.example.com')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
    }

    public function test_resolve_rejects_an_invalid_domain_name(): void
    {
        // The name is rejected before any probe or Engine call; the route reads
        // the mirror only.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:86
        // CA reads: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:88
        $this->actingAs(User::factory()->create())
            ->getJson('/api/services/'.VirtualService::ID.'/domains/resolve?domain=not%20a%20domain')
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'projects/all'));
    }

    public function test_validate_reads_the_mirror_without_syncing(): void
    {
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 → UserCollection
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
        ]);

        // The CA calls this while the user types; the taken check reads the
        // mirror only (`forUser(refresh: false)`), never an inline sync
        //The TTL cache must be clear or the
        // refreshing read would be a no-op and the assertNotSent below blind.
        cache()->flush();
        $this->rememberNoSelfProject();

        $user = User::factory()->create();
        // CA: packages/client-area/src/components/onboarding/OnboardingChooseDomainModal.vue:632
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/domains/validate?domain=fresh.example.com')
            ->assertOk();

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/projects/all'));
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function mirrorHiccups(): array
    {
        return [
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (connection error)
            'connection error' => [fn () => throw new ConnectionException('down')],
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (5xx)
            'engine 500' => [fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('mirrorHiccups')]
    public function test_store_retries_a_mirror_hiccup_after_the_completed_task(\Closure $hiccup): void
    {
        // The create task completed, so the marker is set
        // before the mirror read; a `show` hiccup is retried inside the budget and
        // the step still answers 202. A 502/503 here would make the CA adopt the
        // half-created project.
        $this->configureEngine();
        $username = 'readmemd';
        $attempts = 0;
        $finished = $this->engineProject(77, $username, [
            'domain' => $username.'.panelalpha.online',
            'status' => 'active',
            'details' => ['template' => 'dind', 'domain' => $username.'.panelalpha.online'],
        ]);

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
            'engine.example.com/api/projects/'.$username => function () use (&$attempts, $hiccup, $finished) {
                $attempts++;
                if ($attempts === 1) {
                    return $hiccup();
                }

                // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (UserResource)
                return Http::response(['data' => $finished]);
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
            ->assertStatus(202)
            ->assertJsonPath('data.domain', $username.'.panelalpha.online');

        $this->assertSame(2, $attempts, 'The mirror read must be retried inside the budget.');
        $this->assertNotNull(
            Application::query()->where('engine_username', $username)->value('onboarding_files_at'),
        );
    }

    #[DataProvider('mirrorHiccups')]
    public function test_store_sets_the_marker_and_ends_at_the_budget_when_the_mirror_never_answers(\Closure $hiccup): void
    {
        // The marker is set before the mirror read, so an
        // exhausted mirror budget still leaves the project in files onboarding
        // and answers 422 keyed `domain`, never 502/503/504.
        $this->configureEngine();
        $username = 'readmemd';
        $start = Carbon::parse('2026-01-01T00:00:00Z');
        $attempts = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show
            'engine.example.com/api/projects/'.$username => function () use (&$attempts, $hiccup, $start) {
                $attempts++;
                // The first mirror attempt is already past the deadline: the wait
                // stops instead of looping.
                Carbon::setTestNow($start->copy()->addSeconds(EngineClient::LONG_TIMEOUT_SECONDS + 1));

                return $hiccup();
            },
        ]);

        Carbon::setTestNow($start);

        try {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
            $this->actingAs(User::factory()->create())
                ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
                ->assertStatus(422)
                ->assertJsonPath('errors.domain.0', ProvisionWaiter::STILL_CREATING);
        } finally {
            Carbon::setTestNow();
        }

        $this->assertSame(1, $attempts);
        $this->assertNotNull(
            Application::query()->where('engine_username', $username)->value('onboarding_files_at'),
            'The marker is set before the mirror read.',
        );
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function createCallFailures(): array
    {
        return [
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (connection error)
            'connection error' => [fn () => throw new ConnectionException('down')],
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (5xx)
            'engine 500' => [fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('createCallFailures')]
    public function test_store_maps_a_create_call_hiccup_to_422_domain(\Closure $failure): void
    {
        // A transport error or 5xx on the create call itself
        // answers 422 keyed `domain`, never a 502/503 the CA would read as a lost
        // response and recover from by adopting the half-created project.
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => $failure,
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => 'readmemd'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');
    }

    public function test_store_rejects_a_create_answer_without_a_task_id(): void
    {
        // A create answer without a task id does not prove
        // the project exists; marking the row or answering 2xx would let the CA
        // adopt a half-created project.
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),

            // Defensive (not an Engine shape): the Engine's storeAsync 202 always carries a task id (ProjectCreator) – the no-id answer is exercised to prove the waiter refuses to mark or adopt the half-created project.
            'engine.example.com/api/projects' => Http::response(['data' => [
                'username' => 'readmemd',
                'details' => ['username' => 'readmemd', 'domain' => 'readmemd.panelalpha.online'],
            ]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => 'readmemd'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain')
            ->assertJsonPath('errors.domain.0', ProvisionWaiter::NO_TASK);
    }

    /**
     * @return array<string, array{0: \Closure}>
     */
    public static function persistentPollHiccups(): array
    {
        return [
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (connection error)
            'connection error' => [fn () => throw new ConnectionException('down')],
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (5xx)
            'engine 500' => [fn () => Http::response(['message' => 'boom'], 500)],
        ];
    }

    #[DataProvider('persistentPollHiccups')]
    public function test_store_ends_a_persistent_poll_hiccup_at_the_budget(\Closure $hiccup): void
    {
        // A hiccup that never clears must end at the budget
        // with 422 keyed `domain` (STILL_CREATING), not answer 502/503/504 and not
        // loop forever. The marker stays null because the task never completed.
        $this->configureEngine();
        $username = 'readmemd';
        $start = Carbon::parse('2026-01-01T00:00:00Z');
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show
            'engine.example.com/api/tasks/77*' => function () use (&$polls, $hiccup, $start) {
                $polls++;
                Carbon::setTestNow($start->copy()->addSeconds(EngineClient::LONG_TIMEOUT_SECONDS + $polls));

                return $hiccup();
            },
        ]);

        Carbon::setTestNow($start);

        try {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
            $this->actingAs(User::factory()->create())
                ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
                ->assertStatus(422)
                ->assertJsonPath('errors.domain.0', ProvisionWaiter::STILL_CREATING);
        } finally {
            Carbon::setTestNow();
        }

        $this->assertSame(1, $polls);
        $this->assertNull(Application::query()->where('engine_username', $username)->value('onboarding_files_at'));
    }

    /**
     * @return array<string, array{int, string}>
     */
    public static function definitePollFailures(): array
    {
        return [
            'not found' => [404, 'The Engine task is gone.'],
        ];
    }

    #[DataProvider('definitePollFailures')]
    public function test_store_treats_a_poll_failure_as_definite(int $status, string $message): void
    {
        // A 404 on the poll is definite – one poll answers 422
        // keyed `domain`, never a retry or a 502/503.
        $this->configureEngine();
        $username = 'readmemd';
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (definite refusal)
            'engine.example.com/api/tasks/77*' => function () use (&$polls, $status, $message) {
                $polls++;

                // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (404 error resource)
                return Http::response(['message' => $message], $status);
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        $this->assertSame(1, $polls, 'A definite poll failure must not be retried.');
        $this->assertNull(Application::query()->where('engine_username', $username)->value('onboarding_files_at'));
    }

    public function test_store_treats_a_poll_422_as_definite(): void
    {
        // A client error on the poll is definite too – one poll
        // answers 422 keyed `domain`. The Engine's task show documents only
        // 200/404, so the 422 is a defensive shape that must never be retried.
        $this->configureEngine();
        $username = 'readmemd';
        $polls = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            'engine.example.com/api/tasks/77*' => function () use (&$polls) {
                $polls++;

                // Defensive (not an Engine shape): TaskController::show documents only 200 and 404; a 422 is exercised to prove it is definite and never retried.
                return Http::response(['message' => 'The Engine rejected the task.'], 422);
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        $this->assertSame(1, $polls, 'A definite poll failure must not be retried.');
        $this->assertNull(Application::query()->where('engine_username', $username)->value('onboarding_files_at'));
    }

    /**
     * A transport error or 5xx on the retry-without-`name` create call must map
     * exactly like the first call: 422 keyed `domain`, never 502/503 the CA reads
     * as a lost response. The first call was refused for
     * the panel-derived name, so this exercises the second provision call.
     */
    #[DataProvider('createCallFailures')]
    public function test_store_maps_a_create_retry_hiccup_to_422_domain(\Closure $failure): void
    {
        $this->configureEngine();
        $username = 'readmemd';
        $message = "A project named 'readmemd' already exists. Choose another name.";
        $attempts = 0;

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (422, then a hiccup)
            'engine.example.com/api/projects' => function () use (&$attempts, $failure, $message) {
                $attempts++;
                if ($attempts === 1) {
                    // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (422 ProblemException)
                    return Http::response([
                        'message' => $message,
                        'errors' => ['name' => [$message]],
                        'problems' => [['field' => 'name', 'code' => 'name_taken', 'message' => $message]],
                    ], 422);
                }

                return $failure();
            },
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
            ->assertStatus(422)
            ->assertJsonValidationErrors('domain');

        $this->assertSame(2, $attempts, 'The panel-derived name must be retried once.');
    }

    public function test_store_maps_a_definite_mirror_failure_to_422_domain(): void
    {
        // The marker is already set from the completed task;
        // a definite `show` failure (4xx, not a retryable hiccup) still answers 422
        // keyed `domain` with the Engine message, never the Engine's own status.
        $this->configureEngine();
        $username = 'readmemd';

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 77,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => $username.'.panelalpha.online'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> tasks show (TaskResource)
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> projects show (definite failure)
            'engine.example.com/api/projects/'.$username => Http::response(['message' => 'The project is gone.'], 404),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:769
        $this->actingAs(User::factory()->create())
            ->postJson('/api/services/'.VirtualService::ID.'/domains', ['source_type' => 'files', 'name' => $username])
            ->assertStatus(422)
            ->assertJsonPath('errors.domain.0', 'The project is gone.');

        $this->assertNotNull(
            Application::query()->where('engine_username', $username)->value('onboarding_files_at'),
            'The marker is set before the mirror read.',
        );
    }
}
