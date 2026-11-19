<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Http\Requests\Hosting\ProxyRuleRequest;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Service-level proxy rules (filtered to the user's
 * projects) and containers.
 * @see packages/client-area/src/apis/Hosting.js:61-69 – the CA call sites
 * @see Engine core/routes/api.php:337-341 (containers), 401-405 (proxy-rules)
 */
class ProxyRuleContainerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']]),
        ]])]);
// CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    public function test_proxy_rules_only_lists_owned_rules(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:41 -> proxy-rules index
        Http::fake(['engine.example.com/api/proxy-rules' => Http::response(['data' => [
            // `*` is the Engine `listen_ip` default for ANY
            // (core/database/migrations/2026_04_23_000000_create_proxy_rules_table.php:27).
            ['id' => 1, 'username' => 'site1', 'transport' => 'http', 'listen_ip' => '*', 'listen_port' => 80, 'server_name' => 'site1.example.com', 'upstream_protocol' => 'http', 'upstream_host' => 'site1', 'upstream_port' => 8080, 'is_generated' => false],
            ['id' => 2, 'username' => 'someone-else', 'transport' => 'http', 'listen_ip' => null, 'listen_port' => 80, 'server_name' => 'foreign.example.com', 'upstream_protocol' => 'http', 'upstream_host' => 'foreign', 'upstream_port' => 8080, 'is_generated' => false],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:61
            ->getJson('/api/services/'.VirtualService::ID.'/proxy-rules')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:61
            ->assertJsonCount(1, 'data')
// CA reads: packages/client-area/src/apis/Hosting.js:61
            ->assertJsonPath('data.0.username', 'site1')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:63
            ->assertJsonPath('data.0.listen_ip', '*')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:63
            ->assertJsonPath('data.0.listen_port', 80)
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:66
            ->assertJsonPath('data.0.server_name', 'site1.example.com')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:69
            ->assertJsonPath('data.0.upstream_protocol', 'http')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:69
            ->assertJsonPath('data.0.upstream_host', 'site1')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:69
            ->assertJsonPath('data.0.upstream_port', 8080)
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:117
            ->assertJsonPath('data.0.transport', 'http')
// CA reads: packages/client-area/src/views/hosting/ProxyRules.vue:89
            ->assertJsonPath('data.0.is_generated', false);
    }

    public function test_create_proxy_rule_for_an_owned_project(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:103 -> proxy-rules store
        Http::fake(['engine.example.com/api/proxy-rules' => Http::response(['data' => ['id' => 3]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'site1.example.com',
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(201);

        // The owner is derived from upstream_host.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/api/proxy-rules')
            && $request['owner_scope'] === 'user'
            && $request['username'] === 'site1');
    }

    /**
     * The Engine's duplicate refusal names its own fields ("A rule with the
     * same transport, port, and server_name already exists"); the panel
     * answers the same 422 field with the address and what to do. Another
     * Engine refusal passes unchanged.
     */
    public function test_create_proxy_rule_names_the_address_a_duplicate_already_uses(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:304 -> refuseDuplicateRule (ProxyRuleDuplicate::MESSAGE under listen_port)
        Http::fake(['engine.example.com/api/proxy-rules' => Http::sequence()
            ->push(['message' => 'A rule with the same transport, port, and server_name already exists', 'errors' => [
                'listen_port' => ['A rule with the same transport, port, and server_name already exists'],
            ]], 422)
            ->push(['message' => 'The listen port field must be at least 1.', 'errors' => [
                'listen_port' => ['The listen port field must be at least 1.'],
            ]], 422)]);
        $body = [
            'transport' => 'http',
            'listen_port' => 8080,
            'server_name' => 'site1.example.com',
            'upstream_host' => 'site1',
            'upstream_port' => 8080,
        ];

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', $body)
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Containers.vue:885 (`Api.getErrorMessage(e)`)
            ->assertJsonPath('errors.listen_port', ['site1.example.com already has a public URL on port 8080. Choose another port, or remove that URL first.']);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', $body)
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Containers.vue:885 (`Api.getErrorMessage(e)`)
            ->assertJsonPath('errors.listen_port', ['The listen port field must be at least 1.']);
    }

    public function test_create_proxy_rule_rejects_a_foreign_upstream_host(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'x.example.com',
                'upstream_host' => 'someone-else',
                'upstream_port' => 8080,
            ])
            ->assertStatus(422);
    }

    public function test_delete_proxy_rule_refuses_a_foreign_rule(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake(['engine.example.com/api/proxy-rules/2' => Http::response(['data' => ['id' => 2, 'username' => 'someone-else']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:64
            ->deleteJson('/api/services/'.VirtualService::ID.'/proxy-rules/2')
            ->assertNotFound();
    }

    public function test_update_proxy_rule_refuses_a_foreign_rule_without_writing(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The existing rule belongs to another project (Engine
        // ProxyRuleResource::id/username).
        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake(['engine.example.com/api/proxy-rules/2' => Http::response(['data' => ['id' => 2, 'username' => 'someone-else', 'server_name' => 'foreign.example.com']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/2', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertNotFound();

        // No PUT: a foreign rule must never be rewritten.
        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/2'));
    }

    public function test_update_proxy_rule_loads_the_rule_and_checks_the_old_owner(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake([
            'engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']]),
        ]);

        // No privilege on the owning project -> 403 before any write.
        $this->denyPrivilege('hosting.manage_proxy_routing');

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertForbidden();

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
    }

    public function test_update_proxy_rule_rejects_an_ip_server_name(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake(['engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']])]);

        // Old store() refused an IP listen address with a keyed 422 and this
        // exact text (old ProxyRuleController::store: `server_name`).
        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
                'server_name' => TestNetwork::public(7),
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:63
            ->assertJsonPath('errors.server_name.0', 'Select a domain; IP listen addresses are not allowed in Client Area.');

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
    }

    public function test_update_proxy_rule_rejects_a_foreign_server_name(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake(['engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
                'server_name' => 'other.example.com',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:63
            ->assertJsonValidationErrors(['server_name']);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
    }

    public function test_update_proxy_rule_rejects_a_changed_upstream_host(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake(['engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']])]);

        // The Engine PUT ignores `username` and refuses an upstream_host other
        // than the rule's own username (Engine ProxyRuleUpstream.php:16-24); the
        // panel answers that 422 up front instead of writing.
        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'someone-else',
                'upstream_port' => 8080,
                'server_name' => 'site1.example.com',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:63
            ->assertJsonPath(
                'errors.upstream_host.0',
                "The upstream must be the project's own app, 'site1': a project's rule cannot reach another project, the engine's services or the host.",
            );

        // No PUT: a rule can never be moved to another project.
        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
    }

    public function test_update_proxy_rule_matches_the_owner_on_the_rules_own_engine(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // The same engine username on another Engine must not own the rule the
        // panel loaded from the default Engine.
        $otherEngine = Application::query()->create([
            'engine_id' => 2,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);
        $ownEngine = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);

        $this->app->instance(ApplicationRepository::class, new class($otherEngine, $ownEngine) implements ApplicationRepository
        {
            public function __construct(
                private readonly Application $first,
                private readonly Application $second,
            ) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->first, $this->second]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->first->id === $id ? $this->first : $this->second;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->first->domain, (string) $this->second->domain];
            }
        });

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
        Http::fake([
            'engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']]),
            'engine.example.com/api/proxy-rules/1*' => Http::response(['data' => ['id' => 1, 'username' => 'site1']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && $r->url() === 'https://engine.example.com/api/proxy-rules/1');
    }

    public function test_create_proxy_rule_matches_the_owner_on_the_rules_own_engine(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // The same engine username on another Engine must not own the rule the
        // panel creates on the default Engine.
        $otherEngine = Application::query()->create([
            'engine_id' => 2,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);
        $ownEngine = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);

        $this->app->instance(ApplicationRepository::class, new class($otherEngine, $ownEngine) implements ApplicationRepository
        {
            public function __construct(
                private readonly Application $first,
                private readonly Application $second,
            ) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->first, $this->second]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->first->id === $id ? $this->first : $this->second;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->first->domain, (string) $this->second->domain];
            }
        });

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:103 -> proxy-rules store
        Http::fake(['engine.example.com/api/proxy-rules' => Http::response(['data' => ['id' => 3]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'site1.example.com',
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(201);

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://engine.example.com/api/proxy-rules'
            && $r['username'] === 'site1'
            && $r['owner_scope'] === 'user');
    }

    public function test_proxy_rules_list_ignores_usernames_from_another_engine(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // A project of the same name (or any name) on another Engine must not
        // make that Engine's rule look owned when the list is read from the
        // default Engine.
        $otherEngine = Application::query()->create([
            'engine_id' => 2,
            'engine_username' => 'site2',
            'domain' => 'site2.example.com',
            'status' => 'active',
        ]);
        $ownEngine = Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);

        $this->app->instance(ApplicationRepository::class, new class($otherEngine, $ownEngine) implements ApplicationRepository
        {
            public function __construct(
                private readonly Application $first,
                private readonly Application $second,
            ) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                return new Collection([$this->first, $this->second]);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                return $this->first->id === $id ? $this->first : $this->second;
            }

            public function domainsInUse(): array
            {
                return [(string) $this->first->domain, (string) $this->second->domain];
            }
        });

        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:41 -> proxy-rules index
        Http::fake(['engine.example.com/api/proxy-rules' => Http::response(['data' => [
            ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com', 'listen_port' => 80],
            ['id' => 2, 'username' => 'site2', 'server_name' => 'site2.example.com', 'listen_port' => 81],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:61
            ->getJson('/api/services/'.VirtualService::ID.'/proxy-rules')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:61
            ->assertJsonCount(1, 'data')
// CA reads: packages/client-area/src/apis/Hosting.js:61
            ->assertJsonPath('data.0.username', 'site1');
    }

    public function test_create_proxy_rule_requires_the_proxy_privilege(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The owner is derived from `upstream_host`; the privilege must be
        // checked on that project before any Engine write.
        $this->denyPrivilege('hosting.manage_proxy_routing');

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'site1.example.com',
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertForbidden();

        Http::assertNotSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/api/proxy-rules'));
    }

    public function test_create_proxy_rule_rejects_an_ip_server_name(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The missing ValidationException import turned this into a 500;
        // it must be the old keyed 422.
        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => TestNetwork::public(7),
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:62
            ->assertJsonPath('errors.server_name.0', 'Select a domain; IP listen addresses are not allowed in Client Area.');
    }

    public function test_create_proxy_rule_rejects_a_foreign_server_name(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'other.example.com',
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:62
            ->assertJsonValidationErrors(['server_name']);
    }

    /**
     * The old panel sent any host name to its control
     * panel (packages/api ProxyRuleController.php:141, `required|string`, an IP
     * refused). v1 takes the Engine's rule: only one of the project's own names,
     * exactly – a subdomain or a wildcard of it is refused before the Engine is
     * called, like the Engine itself would (live suite, ProxyRuleTest).
     */
    public function test_create_proxy_rule_refuses_a_subdomain_of_the_projects_domain(): void
    {
        $user = User::factory()->create();
        $this->application($user);
        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:132 -> ProxyRuleController::store
        Http::fake(['engine.example.com/api/proxy-rules' => Http::response(['data' => ['id' => 3]])]);

        foreach (['proxy.site1.example.com', '*.site1.example.com'] as $name) {
            $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
                ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                    'transport' => 'http',
                    'listen_port' => 80,
                    'server_name' => $name,
                    'upstream_host' => 'site1',
                    'upstream_port' => 8080,
                ])
                ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:62
                ->assertJsonPath('errors.server_name.0', 'The server name is not a domain of this project.');
        }

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/api/proxy-rules'));
    }

    public function test_containers_group_by_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:80 -> containers index
        // Engine: core/app/System/Project/Dind/ContainerOperations.php:52 -> `docker compose ps --format json`
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
            ['Service' => 'web', 'State' => 'running', 'Status' => 'Up', 'Image' => 'nginx'],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:81
            ->getJson('/api/services/'.VirtualService::ID.'/containers')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:81
            ->assertJsonPath('data.0.account.username', 'site1')
// CA reads: packages/client-area/src/views/hosting/Containers.vue:520
            ->assertJsonPath('data.0.containers.0.Service', 'web')
// CA reads: packages/client-area/src/views/hosting/Containers.vue:522
            ->assertJsonPath('data.0.containers.0.State', 'running');
    }

    /**
     * A project the Engine refuses is reported and its group
     * comes back empty; the projects that answered stay in the list.
     */
    public function test_one_broken_project_does_not_fail_the_container_list(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']]),
            $this->engineProject(11, 'site2', ['details' => ['template' => 'dind']]),
        ]])]);
// CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/ContainerController.php:80 -> containers index
            'engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
                ['Service' => 'web', 'State' => 'running'],
            ]]),
            // Engine: core/app/Exceptions/Handler.php:186 -> a 5xx answer for one project
            'engine.example.com/api/projects/site2/containers' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: packages/client-area/src/apis/Hosting.js:81
        $response = $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers')
            ->assertOk();

        $groups = collect($response->json('data'))->keyBy('account.username');
        $this->assertSame(['web'], array_column($groups['site1']['containers'], 'Service'));
        $this->assertSame([], $groups['site2']['containers']);
    }

    public function test_container_action_and_logs(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:106 -> containers projectAction; :171 -> containers logs
        Http::fake([
            'engine.example.com/api/projects/site1/containers/action' => Http::response(['exit_code' => 0, 'stdout' => 'ok', 'stderr' => '']),
            'engine.example.com/api/projects/site1/containers/web/action' => Http::response(['exit_code' => 0, 'stdout' => 'ok']),
            // The Engine container log is a bare string inside `data`.
            'engine.example.com/api/projects/site1/containers/web/logs*' => Http::response(['data' => 'line1']),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:83
            ->postJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/action', ['action' => 'restart'])
            ->assertOk();

        // The old service-level route name (packages/api/routes/api.php:541).
        $this->assertSame('user.hosting.service_container.project_action', ActivityLog::query()->latest('id')->value('action'));

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:84
            ->postJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/action', ['action' => 'restart'])
            ->assertOk();

        // The old service-level route name (packages/api/routes/api.php:543).
        $this->assertSame('user.hosting.service_container.service_action', ActivityLog::query()->latest('id')->value('action'));

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=10')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:85
            ->assertJsonPath('data', 'line1');
    }

    /**
     * The old panel accepted `down` (compose down: stop and remove every
     * container); v1 offers no Down any more and refuses it before the Engine.
     */
    public function test_the_down_project_action_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:83 (the old Down sent `{action: 'down'}`, Containers.vue:765)
            ->postJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/action', ['action' => 'down'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Containers.vue:771 (`Api.getErrorMessage(e)`)
            ->assertJsonValidationErrors(['action']);

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/containers/action'));
    }

    public function test_container_logs_cap_the_lines_and_reject_a_bad_service_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: `views/hosting/Containers.vue` opens the log modal; the old route
        // capped `lines` at 500 and answered `Invalid service name` (422) for a
        // name that is not a compose service
        // (ServiceContainerController::logs:215-219).
        // Engine: core/app/Http/Controllers/User/ContainerController.php:197 -> containers logs
        Http::fake(['engine.example.com/api/projects/site1/containers/web/logs*' => Http::response(['data' => 'line1'])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=900')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:85
            ->assertJsonPath('data', 'line1');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/containers/web/logs')
            && $request['lines'] === 500);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web%20bad/logs')
            ->assertStatus(422)
// CA reads: packages/client-area/src/apis/Hosting.js:85
            ->assertJsonPath('message', 'Invalid service name');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'bad/logs'));
    }

    public function test_container_logs_uses_the_old_int_lines_semantics(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old route cast the raw query with `(int)`
        // (ServiceContainerController::logs:219), so a non-numeric value reads as
        // 0 and a numeric prefix keeps its digits; a later typing pass replaced
        // that with an `is_numeric` default of 200.
        // Engine: core/app/Http/Controllers/User/ContainerController.php:209 → {data: <log string>}
        Http::fake(['engine.example.com/api/projects/site1/containers/web/logs*' => Http::response(['data' => 'line1'])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=abc')
            ->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), '/containers/web/logs')
            && $request['lines'] === 0);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=12abc')
            ->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), '/containers/web/logs')
            && $request['lines'] === 12);
    }

    public function test_container_logs_casts_an_array_lines_value_like_the_old_int_cast(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old `(int)` cast on a non-empty array reads as 1, so an array
        // query must not fall back to the 200 default.
        // Engine: core/app/Http/Controllers/User/ContainerController.php:209 → {data: <log string>}
        Http::fake(['engine.example.com/api/projects/site1/containers/web/logs*' => Http::response(['data' => 'line1'])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines[]=5')
            ->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), '/containers/web/logs')
            && $request['lines'] === 1);
    }

    public function test_container_logs_defaults_to_two_hundred_lines(): void
    {
        // The old route defaulted `lines` to 200 when the query was absent
        // (ServiceContainerController::logs:219); the CA opens the log modal
        // without a `lines` value, so the default is pinned here.
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:197 -> containers logs
        Http::fake(['engine.example.com/api/projects/site1/containers/web/logs*' => Http::response(['data' => 'line1'])]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:85
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs')
            ->assertOk()
// CA reads: packages/client-area/src/apis/Hosting.js:85
            ->assertJsonPath('data', 'line1');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/containers/web/logs')
            && $request['lines'] === 200);
    }

    public function test_container_logs_answer_503_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/apis/Hosting.js:85
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=10')
            ->assertStatus(503);
    }

    public function test_container_logs_answer_502_on_an_engine_5xx(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:197 -> containers logs
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // CA: packages/client-area/src/apis/Hosting.js:85
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers/'.$application->id.'/web/logs?lines=10')
            ->assertStatus(502);
    }

    public function test_proxy_rule_request_has_no_no_op_prepare_for_validation(): void
    {
        // The empty prepareForValidation() was dead code; the IP refusal lives
        // in the service with the old text. The base FormRequest
        // declares the hook, so the test checks the declaring class.
        $method = new \ReflectionMethod(ProxyRuleRequest::class, 'prepareForValidation');

        $this->assertNotSame(ProxyRuleRequest::class, $method->getDeclaringClass()->getName());
    }

    public function test_proxy_rules_require_authentication(): void
    {
// CA: packages/client-area/src/apis/Hosting.js:61
        $this->getJson('/api/services/'.VirtualService::ID.'/proxy-rules')->assertUnauthorized();
    }

    public function test_delete_proxy_rule_requires_the_proxy_privilege(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The rule loads on the default Engine, then the privilege is checked on
        // its owning project before any DELETE. The write routes carry no
        // `privilege:` middleware, so the service is the only guard.
        // Engine: core/app/Http/Resources/ProxyRuleResource.php:18 (ProxyRuleController::show:65-74)
        Http::fake(['engine.example.com/api/proxy-rules/1' => Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']])]);

        $this->denyPrivilege('hosting.manage_proxy_routing');

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:64
            ->deleteJson('/api/services/'.VirtualService::ID.'/proxy-rules/1')
            ->assertForbidden();

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE' && str_contains($r->url(), '/proxy-rules/1'));
    }

    public function test_create_proxy_rule_bubbles_an_engine_outage(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        Http::fake(['engine.example.com/api/proxy-rules' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:62
            ->postJson('/api/services/'.VirtualService::ID.'/proxy-rules', [
                'transport' => 'http',
                'listen_port' => 80,
                'server_name' => 'site1.example.com',
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(503);

        // Proxy rules live only on the Engine, so a failed write persists
        // nothing: no success and no activity entry.
        $this->assertSame(0, ActivityLog::query()->count());
    }

    public function test_update_proxy_rule_bubbles_an_engine_outage(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The load itself fails, so the write never happens.
        Http::fake(['engine.example.com/api/proxy-rules/1' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus(503);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
        $this->assertSame(0, ActivityLog::query()->count());
    }

    public function test_delete_proxy_rule_bubbles_an_engine_outage(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        Http::fake(['engine.example.com/api/proxy-rules/1' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:64
            ->deleteJson('/api/services/'.VirtualService::ID.'/proxy-rules/1')
            ->assertStatus(503);

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE' && str_contains($r->url(), '/proxy-rules/1'));
        $this->assertSame(0, ActivityLog::query()->count());
    }

    /**
     * @return iterable<string, array{callable(): mixed, int, bool}>
     */
    public static function writeOutages(): iterable
    {
        // A stub that throws a ConnectionException aborts before Laravel records
        // the request/response pair, so the connection case asserts the status
        // only; `writeRecorded` is true where the write reaches Http::recorded().
        yield 'connection error' => [fn () => throw new ConnectionException('down'), 503, false];
        // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:182 -> ProxyRuleController::update
        yield '5xx' => [fn () => Http::response(['message' => 'boom'], 500), 502, true];
    }

    /**
     * @param  callable(): mixed  $fail
     */
    #[DataProvider('writeOutages')]
    public function test_update_proxy_rule_bubbles_a_write_outage_after_a_successful_load(callable $fail, int $status, bool $writeRecorded): void
    {
        // The load answers 200 and only the write fails: the Engine error must
        // reach the CA and persist nothing.
        $user = User::factory()->create();
        $this->application($user);

        Http::fake([
            'engine.example.com/api/proxy-rules/1' => function ($request) use ($fail) {
                if ($request->method() === 'GET') {
                    // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
                    return Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']]);
                }

                return $fail();
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:63
            ->putJson('/api/services/'.VirtualService::ID.'/proxy-rules/1', [
                'upstream_host' => 'site1',
                'upstream_port' => 8080,
            ])
            ->assertStatus($status);

        if ($writeRecorded) {
            Http::assertSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/proxy-rules/1'));
        }

        $this->assertSame(0, ActivityLog::query()->count());
    }

    /**
     * @param  callable(): mixed  $fail
     */
    #[DataProvider('writeOutages')]
    public function test_delete_proxy_rule_bubbles_a_write_outage_after_a_successful_load(callable $fail, int $status, bool $writeRecorded): void
    {
        $user = User::factory()->create();
        $this->application($user);

        Http::fake([
            'engine.example.com/api/proxy-rules/1' => function ($request) use ($fail) {
                if ($request->method() === 'GET') {
                    // Engine: core/app/Http/Controllers/User/ProxyRuleController.php:67 -> proxy-rules show
                    return Http::response(['data' => ['id' => 1, 'username' => 'site1', 'server_name' => 'site1.example.com']]);
                }

                return $fail();
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/apis/Hosting.js:64
            ->deleteJson('/api/services/'.VirtualService::ID.'/proxy-rules/1')
            ->assertStatus($status);

        if ($writeRecorded) {
            Http::assertSent(fn ($r) => $r->method() === 'DELETE' && str_contains($r->url(), '/proxy-rules/1'));
        }

        $this->assertSame(0, ActivityLog::query()->count());
    }

    /**
     * @return iterable<string, array{string, array<string, mixed>}>
     */
    public static function proxyRuleWrites(): iterable
    {
        yield 'create' => ['POST', []];
        yield 'update' => ['PUT', []];
        yield 'delete' => ['DELETE', []];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('proxyRuleWrites')]
    public function test_proxy_rule_writes_require_authentication(string $method, array $payload): void
    {
        $path = '/api/services/'.VirtualService::ID.'/proxy-rules';
        if ($method !== 'POST') {
            $path .= '/1';
        }

// CA: packages/client-area/src/apis/Hosting.js:61
        $this->json($method, $path, $payload)->assertUnauthorized();
    }
}
