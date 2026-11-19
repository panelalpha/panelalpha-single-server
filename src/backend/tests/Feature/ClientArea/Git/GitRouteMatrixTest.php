<?php

namespace Tests\Feature\ClientArea\Git;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The per-endpoint matrix for every git route
 * (`packages/client-area/routes/git.php`):
 *
 *  - unauthenticated -> 401;
 *  - its own privilege missing -> 403 (only the routes that carry one);
 *  - foreign / unknown application -> 404;
 *  - Engine down -> 503 on a connection error, 502 on an Engine 5xx
 *    (`EngineRequestException::render`).
 *
 * The panel-only `GET git/logs` and `POST git/drift/ignore` never call the
 * Engine, so a down Engine cannot change their answer; that exception is
 * pinned by its own test rather than a wrong status.
 *
 * CA call sites (request body and the keys read) per route:
 *   GET  git              packages/client-area/src/mixins/GitActionsMixin.js:8
 *   GET  git/branches     packages/client-area/src/mixins/GitActionsMixin.js:205
 *   GET  git/commits      packages/client-area/src/components/modal/GitRedeployModal.vue:551
 *   GET  git/logs         packages/client-area/src/views/instance/advanced/Git.vue:1042
 *   POST git/connect      packages/client-area/src/views/instance/advanced/Git.vue:1199 (body Git.vue:1149-1153)
 *   GET  git/deploy-key   (new in app-lite-source-containers-ux; the current key for the Git tab, none is created)
 *   POST git/deploy-key   (new in git-deploy-keys; no CA call site yet, body `{repo_url?}`)
 *   DELETE git/deploy-key (new in git-deploy-keys; no CA call site yet)
 *   GET  git/env-example  (new in git-deploy-keys; no CA call site yet, reads the checkout's `.env.example`)
 *   POST git/deploy       (new in git-deploy-keys; no CA call site yet, body `{branch, env_vars?}`)
 *   POST git/disconnect   packages/client-area/src/mixins/GitActionsMixin.js:529
 *   POST git/repair       packages/client-area/src/mixins/GitActionsMixin.js:22
 *   POST git/pull         packages/client-area/src/mixins/GitActionsMixin.js:294
 *   POST git/push         packages/client-area/src/mixins/GitActionsMixin.js:351
 *   POST git/revert       packages/client-area/src/mixins/GitActionsMixin.js:387
 *   PUT  git/credentials  packages/client-area/src/mixins/GitActionsMixin.js:464
 *   POST git/drift/ignore packages/client-area/src/mixins/GitActionsMixin.js:440
 *   PUT  auto-deploy      packages/client-area/src/mixins/GitActionsMixin.js:495
 *   PUT  change-branch    packages/client-area/src/mixins/GitActionsMixin.js:264
 *
 * @see packages/api/routes/api.php:267,281 (old auto-deploy / git credentials, both `privilege:general.manage_git`)
 * @see Engine core/routes/api.php:246-261 (git/*)
 */
class GitRouteMatrixTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->fakeHostGuard();
    }

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
                return $host !== TestNetwork::private(5);
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

    private function application(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']]),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        // CA reads: packages/client-area/src/apis/Instances.js:79 (`response.data.data`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
        ])->save();

        return $application;
    }

    /**
     * One case per git route: method, path suffix and the privilege the route
     * carries (null for the reads the old panel left open).
     *
     * @return array<string, array{string, string, string|null}>
     */
    public static function gitRoutes(): array
    {
        return [
            'GET git' => ['GET', 'git', null],
            'GET git/branches' => ['GET', 'git/branches', null],
            'GET git/commits' => ['GET', 'git/commits', null],
            'GET git/logs' => ['GET', 'git/logs', null],
            'POST git/connect' => ['POST', 'git/connect', 'general.manage_git'],
            'GET git/deploy-key' => ['GET', 'git/deploy-key', 'general.manage_git'],
            'POST git/deploy-key' => ['POST', 'git/deploy-key', 'general.manage_git'],
            'DELETE git/deploy-key' => ['DELETE', 'git/deploy-key', 'general.manage_git'],
            'GET git/env-example' => ['GET', 'git/env-example', null],
            'POST git/deploy' => ['POST', 'git/deploy', 'general.manage_git'],
            'POST git/disconnect' => ['POST', 'git/disconnect', 'general.manage_git'],
            'POST git/repair' => ['POST', 'git/repair', 'general.manage_git'],
            'POST git/pull' => ['POST', 'git/pull', 'general.manage_git'],
            'POST git/push' => ['POST', 'git/push', 'general.manage_git'],
            'POST git/revert' => ['POST', 'git/revert', 'general.manage_git'],
            'PUT git/credentials' => ['PUT', 'git/credentials', 'general.manage_git'],
            'POST git/drift/ignore' => ['POST', 'git/drift/ignore', 'general.manage_git'],
            'PUT auto-deploy' => ['PUT', 'auto-deploy', 'general.manage_git'],
            'PUT change-branch' => ['PUT', 'change-branch', 'general.manage_git'],
        ];
    }

    /**
     * Only the routes carrying `privilege:` on the route.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function privilegedGitRoutes(): array
    {
        $cases = [];
        foreach (self::gitRoutes() as $name => [, $suffix, $privilege]) {
            if ($privilege !== null) {
                $cases[$name] = [$suffix, $privilege, $name];
            }
        }

        return $cases;
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function engineCallingGitRoutes(): array
    {
        $cases = [];
        foreach (self::gitRoutes() as $name => [$method, $suffix]) {
            // The panel-only routes never touch the Engine.
            if (in_array($suffix, ['git/logs', 'git/drift/ignore'], true)) {
                continue;
            }
            $cases[$name] = [$method, $suffix];
        }

        return $cases;
    }

    #[DataProvider('gitRoutes')]
    public function test_a_git_route_requires_authentication(string $method, string $suffix, ?string $privilege = null): void
    {
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (the CA always calls the git page authenticated)
        $this->json($method, "/api/projects/1/{$suffix}")->assertUnauthorized();
    }

    #[DataProvider('privilegedGitRoutes')]
    public function test_a_privileged_git_route_answers_403_without_its_own_privilege(string $suffix, string $privilege, string $name): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->denyPrivilege($privilege);

        $method = $this->methodFor($suffix);
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (the CA gates each mutation behind `general.manage_git`)
        $response = $this->actingAs($user)->json($method, "/api/projects/{$application->id}/{$suffix}", $this->bodyFor($suffix));

        $this->assertSame(403, $response->status(), "{$name} ({$suffix}) did not answer 403 without {$privilege}.");
    }

    #[DataProvider('gitRoutes')]
    public function test_a_git_route_answers_404_for_an_unknown_application(string $method, string $suffix, ?string $privilege = null): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (a project id the CA no longer sees)
        $this->actingAs($user)
            ->json($method, "/api/projects/999999/{$suffix}", $this->bodyFor($suffix))
            ->assertNotFound();
    }

    #[DataProvider('engineCallingGitRoutes')]
    public function test_a_git_route_answers_503_when_the_engine_connection_fails(string $method, string $suffix): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (an unreachable Engine must not look like "not connected")
        $this->actingAs($user)
            ->json($method, "/api/projects/{$application->id}/{$suffix}", $this->bodyFor($suffix))
            ->assertStatus(503);
    }

    #[DataProvider('engineCallingGitRoutes')]
    public function test_a_git_route_answers_502_when_the_engine_answers_5xx(string $method, string $suffix): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:511 -> GitController::respond (the Engine's git error body)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // A 5xx is the Engine's fault, not the user's: `EngineRequestException`
        // renders it 502, not 503.
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:8 (the CA surfaces `Api.getErrorMessage(error)`)
        $this->actingAs($user)
            ->json($method, "/api/projects/{$application->id}/{$suffix}", $this->bodyFor($suffix))
            ->assertStatus(502);
    }

    public function test_the_panel_only_git_routes_do_not_call_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // `GET git/logs` is the panel's own (empty) operation log and
        // `POST git/drift/ignore` is a no-op: neither may depend on the Engine.
        // CA: packages/client-area/src/views/instance/advanced/Git.vue:1042 (`Api.get('/instances/{id}/git/logs')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Git.vue:1046-1048 (`response.data.data`, `meta.total`, `meta.last_page`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/git/logs")
            ->assertOk()
            ->assertJsonPath('data', []);

        // CA: packages/client-area/src/mixins/GitActionsMixin.js:440 (`Api.post('/instances/{id}/git/drift/ignore')`)
        // CA reads: packages/client-area/src/mixins/GitActionsMixin.js:441 (the CA shows a success alert, no body read)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/git/drift/ignore")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_the_matrix_provider_covers_every_registered_git_route(): void
    {
        $registered = [];
        foreach (Route::getRoutes() as $route) {
            // The git history and auto-deploy routes are
            // client-area-legacy's, named with its prefix.
            $name = (string) $route->getName();
            if (! str_starts_with($name, 'client-area.projects.git.') && ! str_starts_with($name, 'client-area-legacy.projects.git.')) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $registered[] = $method.' '.$route->uri();
            }
        }

        $matrix = [];
        foreach (self::gitRoutes() as [$method, $suffix]) {
            $matrix[] = $method.' api/projects/{application}/'.$suffix;
        }

        sort($registered);
        sort($matrix);
        $this->assertSame($registered, $matrix, 'A registered git route is missing from the matrix provider (or vice versa).');
    }

    private function methodFor(string $suffix): string
    {
        foreach (self::gitRoutes() as [$method, $route]) {
            if ($route === $suffix) {
                return $method;
            }
        }

        return 'GET';
    }

    /**
     * The body the CA sends for each route family (the read methods and the
     * bodyless mutations stay empty).
     *
     * @return array<string, mixed>
     */
    private function bodyFor(string $suffix): array
    {
        return match ($suffix) {
            // CA: packages/client-area/src/views/instance/advanced/Git.vue:1149-1153 (`{repo_url, auth_type, token}`)
            'git/connect' => ['repo_url' => 'https://github.com/acme/site'],
            // CA: (new in git-deploy-keys, no CA call site yet) `{branch, env_vars?}`
            'git/deploy' => ['branch' => 'main'],
            // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`{strategy}` or `{}`)
            'git/pull' => ['strategy' => 'ff'],
            // CA: packages/client-area/src/mixins/GitActionsMixin.js:464 (`{token, auth_type}`)
            'git/credentials' => ['token' => 'ghp_new', 'auth_type' => 'pat'],
            // CA: packages/client-area/src/mixins/GitActionsMixin.js:495 (`{auto_deploy_enabled}`)
            'auto-deploy' => ['auto_deploy_enabled' => false],
            // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`{branch}`)
            'change-branch' => ['branch' => 'main'],
            default => [],
        };
    }
}
