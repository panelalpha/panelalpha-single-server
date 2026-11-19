<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Closure;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\EnvVarsApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\ClientArea\Jobs\Application\WatchApplicationTaskJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\ProtectedProject;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployLogJob;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Protected projects.
 *
 * Contract:
 * - Engine: an operator turns the `protected` project setting on
 *   (`pae project:settings:set protected on`); the project resource carries it as
 *   a boolean (core/app/Http/Resources/UserResource.php:34). While it is on, an API
 *   token's call to an operation in `EnsureProjectNotProtected::REFUSED`
 *   (core/app/Http/Middleware/EnsureProjectNotProtected.php:41-56) answers 409
 *   `{message, code: "project_protected"}` (:157-165). Conditional rows: a
 *   project container action only for `stop|down|restart` (:135), a service
 *   action only for `stop|restart` (:136), `PUT env-vars` unless `apply: none`
 *   (:137), `PUT /projects/{u}` only with a `domain` (:138), a domain delete only
 *   for the main domain (:139), and a push by its `target`
 *   (core/app/Auth/ProjectFields.php:16).
 * - Panel: every Engine call on that list checks the mirrored flag first and
 *   answers the old-style 422 `{message, errors: {0: [message]}}` without calling
 *   the Engine; a 409 `project_protected` that slips past a stale mirror becomes
 *   the same 422. Every other 409 keeps the busy answer. No new CA response
 *   field.
 * - CA: a 422 with key-0 errors shows the bare message
 *   (packages/client-area/src/apis/Api.js:80).
 */
final class ProtectedProjectTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const REPO = 'https://github.com/acme/site.git';

    /**
     * A container project deploying from git, as the sync mirrors it.
     *
     * @param  array<string, mixed>  $project
     */
    private function protectedApplication(User $user, bool $protected = true, array $project = []): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll; core/app/Http/Resources/UserResource.php:34 -> `protected`
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', array_merge([
                'protected' => $protected,
                'details' => ['template' => 'dind', 'git_repo' => self::REPO, 'git_branch' => 'main'],
            ], $project)),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        // The deploy guard reads the Engine's newest deploy before the refusal
        //Nothing runs.
        $this->fakeEngineDeploys('site1');

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    /**
     * @param  TestResponse<\Symfony\Component\HttpFoundation\Response>  $response
     */
    private function assertRefused(TestResponse $response): void
    {
        $response->assertStatus(422)
        // CA reads: packages/client-area/src/apis/Api.js:80 (key-0 errors show the bare message)
            ->assertJsonPath('errors.0.0', ProtectedProject::REFUSAL)
        // CA reads: packages/client-area/src/apis/Api.js:85 (`message` when there are no errors)
            ->assertJsonPath('message', ProtectedProject::REFUSAL);
    }

    private function assertEngineNotCalled(string $path, ?string $method = null): void
    {
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), $path)
            && ($method === null || $request->method() === $method));
    }

    public function test_the_sync_mirrors_the_protected_flag(): void
    {
        $user = User::factory()->create();

        $application = $this->protectedApplication($user);
        $this->assertTrue($application->isProtected());
        $this->assertTrue(($application->engine_payload ?? [])['protected'] ?? null);

        // `false`, an older Engine without the key, or a value that is not a
        // boolean read as not protected; the Engine's 409 still refuses.
        $payload = $application->engine_payload ?? [];
        foreach (['false' => false, 'string' => 'true', 'int' => 1] as $case => $value) {
            $application->update(['engine_payload' => array_merge($payload, ['protected' => $value])]);
            $this->assertFalse($application->refresh()->isProtected(), $case);
        }
        unset($payload['protected']);
        $application->update(['engine_payload' => $payload]);
        $this->assertFalse($application->refresh()->isProtected(), 'missing');
    }

    public function test_an_engine_409_project_protected_answers_the_old_style_422(): void
    {
        $user = User::factory()->create();
        // A stale mirror: the operator protected the project after the last sync.
        $application = $this->protectedApplication($user, false);

        Http::fake([
            // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:159 -> refuse()
            'engine.example.com/api/projects/site1' => Http::response([
                'message' => "Project 'site1' is protected from API and MCP tokens. Deleting, stopping or redeploying it needs an operator: clear the setting first with `pae project:settings:unset protected --project=site1`.",
                'code' => 'project_protected',
            ], 409),
        ]);

        $response = $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true]);

        $this->assertRefused($response);
        // The Engine's operator instruction never reaches the customer.
        $this->assertStringNotContainsString('pae project:settings', (string) $response->getContent());
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1'));
    }

    public function test_another_engine_409_keeps_the_busy_answer(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user, false);

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (409 + ProjectBusyException)
            'engine.example.com/api/projects/site1' => Http::response(['message' => 'Project is busy', 'code' => 'project_busy'], 409),
        ]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(409);
    }

    public function test_a_protected_project_delete_is_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        $this->assertRefused($this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true]));

        $this->assertEngineNotCalled('/projects/site1', 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    public function test_a_protected_project_redeploy_is_refused_before_the_engine(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        $this->assertRefused($this->actingAs($user)
        // CA: src/components/modal/GitRedeployModal.vue:401
            ->postJson("/api/projects/{$application->id}/redeploy", ['branch' => 'main']));

        $this->assertEngineNotCalled('/git/pull');
        $this->assertEngineNotCalled('/rebuild');
        Queue::assertNotPushed(WatchDeployLogJob::class);
        Queue::assertNotPushed(WatchApplicationTaskJob::class);
    }

    public function test_a_protected_project_archive_upload_is_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user, true, ['details' => ['template' => 'dind']]);

        $this->assertRefused($this->actingAs($user)
        // CA: src/components/modal/FilesUploadVersionModal.vue:500
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=site.zip", [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
                'HTTP_ACCEPT' => 'application/json',
            ], 'PK-zip-bytes'));

        $this->assertEngineNotCalled('/files/');
    }

    public function test_a_protected_project_git_pull_revert_and_branch_change_are_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        $this->assertRefused($this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:294 (`Api.post('/instances/{id}/git/pull', {strategy})`)
            ->postJson("/api/projects/{$application->id}/git/pull", ['strategy' => 'ff']));
        $this->assertRefused($this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:387 (`Api.post('/instances/{id}/git/revert')`)
            ->postJson("/api/projects/{$application->id}/git/revert"));
        $this->assertRefused($this->actingAs($user)
        // CA: packages/client-area/src/mixins/GitActionsMixin.js:264 (`Api.put('/instances/{id}/change-branch', {branch})`)
            ->putJson("/api/projects/{$application->id}/change-branch", ['branch' => 'develop']));

        $this->assertEngineNotCalled('/git/');
    }

    public function test_a_protected_project_domain_change_and_primary_switch_are_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        $this->assertRefused($this->actingAs($user)
        // CA: src/components/modal/SetYourDomainModal.vue:746
            ->putJson("/api/projects/{$application->id}/change-domain/domain", ['domain' => 'shop.example.com']));
        $this->assertRefused($this->actingAs($user)
        // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:519
            ->putJson("/api/server-accounts/{$application->id}/domains/shop.example.com/set-as-primary"));

        $this->assertEngineNotCalled('/projects/site1', 'PUT');
        $this->assertEngineNotCalled('/domains');
        $this->assertSame('site1.example.com', $application->refresh()->domain);
    }

    public function test_a_protected_project_env_apply_is_refused_and_a_stored_save_passes(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        $this->assertRefused($this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'kv',
                'contents' => "APP_ENV=production\n",
                'restart' => true,
            ]));
        $this->assertEngineNotCalled('/env-vars');

        // `apply: none` only stores the map for the next deploy, which the
        // Engine does not refuse (EnsureProjectNotProtected.php:137).
        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:122 -> EnvVarsController::update, {data:{keys}}
        Http::fake(['engine.example.com/api/projects/site1/env-vars' => Http::response(['data' => ['keys' => ['APP_ENV']]])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'kv',
                'contents' => "APP_ENV=production\n",
                'restart' => false,
            ])
            ->assertOk();
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/projects/site1/env-vars')
            && $request['apply'] === 'none');
    }

    public function test_a_protected_project_stopping_container_actions_are_refused_and_starting_ones_pass(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);
        $base = '/api/services/'.VirtualService::ID.'/containers/'.$application->id;

        // `down` is not a project action any more: its 422 `action` is
        // `ProxyRuleContainerTest::test_the_down_project_action_is_refused`.
        foreach (['stop', 'restart'] as $action) {
            $this->assertRefused($this->actingAs($user)
            // CA: packages/client-area/src/apis/Hosting.js:83
                ->postJson($base.'/action', ['action' => $action]));
        }
        foreach (['stop', 'restart'] as $action) {
            $this->assertRefused($this->actingAs($user)
            // CA: packages/client-area/src/apis/Hosting.js:84
                ->postJson($base.'/web/action', ['action' => $action]));
        }
        $this->assertEngineNotCalled('/containers/');

        // Engine: core/app/Http/Controllers/User/ContainerController.php:106 -> containers projectAction
        Http::fake([
            'engine.example.com/api/projects/site1/containers/action' => Http::response(['exit_code' => 0, 'stdout' => 'ok', 'stderr' => '']),
            'engine.example.com/api/projects/site1/containers/web/action' => Http::response(['exit_code' => 0, 'stdout' => 'ok']),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Hosting.js:83
            ->postJson($base.'/action', ['action' => 'up'])
            ->assertOk();
        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Hosting.js:84
            ->postJson($base.'/web/action', ['action' => 'start'])
            ->assertOk();
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/containers/action') && $request['action'] === 'up');
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/containers/web/action') && $request['action'] === 'start');
    }

    public function test_a_push_into_a_protected_live_project_is_refused_and_a_push_out_of_it_passes(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $live = $this->protectedApplication($user, true, ['details' => []]);
        $live->update(['type' => Application::TYPE_CUSTOM]);
        $staging = Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $live->id,
        ]);

        $this->assertRefused($this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:563
            ->putJson("/api/projects/{$staging->id}/push-to-live", ['overwrite_files' => true, 'push_db' => true]));
        $this->assertEngineNotCalled('/push');

        // The Engine refuses by the push's `target` (ProjectFields.php:16): a push
        // from the protected live project into its staging passes.
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1', 'details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 43], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$live->id}/push-to-staging", ['overwrite_files' => true, 'push_db' => true])
            ->assertOk();
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/projects/site1/push')
            && $request['target'] === 'site1-staging');
    }

    public function test_a_protected_project_addon_domain_delete_passes(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);

        // Only the main domain is guarded (EnsureProjectNotProtected.php:139).
        // Engine: core/app/Http/Controllers/User/DomainController.php:249 -> domains destroy
        Http::fake(['engine.example.com/api/projects/site1/domains/shop.example.com' => Http::response(['data' => ['id' => 1]])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:457
            ->deleteJson("/api/server-accounts/{$application->id}/domains/shop.example.com")
            ->assertOk();
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/domains/shop.example.com'));
    }

    public function test_a_project_that_is_not_protected_still_reaches_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user, false);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1'));
        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
    }

    /**
     * One case per refused Engine operation the panel calls
     * (EnsureProjectNotProtected.php:41-56), including the ones only a job or
     * the onboarding reaches (retry-install, archive deploy, source attach).
     *
     * @return array<string, array{Closure(Application, Application): mixed, string}>
     */
    public static function refusedEngineCalls(): array
    {
        return [
            'DELETE /projects/{u}' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->delete($app->engineProject()), '/projects/site1'],
            'PUT /projects/{u} domain' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->renameDomain($app->engineProject(), 'shop.example.com'), '/projects/site1'],
            'POST rebuild' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->rebuild($app->engineProject()), '/rebuild'],
            'POST deploy-archive' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->deployArchive($app->engineProject(), 'project/.panelalpha-upload/site.zip'), '/deploy-archive'],
            'POST source' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->attachSource($app->engineProject(), ['git_repo' => self::REPO]), '/source'],
            'POST git/pull' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->gitPull($app->engineProject()), '/git/pull'],
            'PUT git/change-branch' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->gitChangeBranch($app->engineProject(), 'develop'), '/git/change-branch'],
            'POST git/revert' => [static fn (Application $app): mixed => (new ProjectsApi($app->engine()))->gitRevert($app->engineProject()), '/git/revert'],
            'PUT env-vars apply' => [static fn (Application $app): mixed => (new EnvVarsApi($app->engine()))->update($app->engineProject(), ['APP_ENV' => 'production'], true), '/env-vars'],
            'POST containers/action stop' => [static fn (Application $app): mixed => (new ContainersApi($app->engine()))->projectAction($app->engineProject(), ['action' => 'stop']), '/containers/'],
            'POST containers/action down' => [static fn (Application $app): mixed => (new ContainersApi($app->engine()))->projectAction($app->engineProject(), ['action' => 'down']), '/containers/'],
            'POST containers/action restart' => [static fn (Application $app): mixed => (new ContainersApi($app->engine()))->projectAction($app->engineProject(), ['action' => 'restart']), '/containers/'],
            'POST containers/{s}/action stop' => [static fn (Application $app): mixed => (new ContainersApi($app->engine()))->serviceAction($app->engineProject(), 'web', ['action' => 'stop']), '/containers/'],
            'POST containers/{s}/action restart' => [static fn (Application $app): mixed => (new ContainersApi($app->engine()))->serviceAction($app->engineProject(), 'web', ['action' => 'restart']), '/containers/'],
            'DELETE main domain' => [static fn (Application $app): mixed => (new DomainsApi($app->engine()))->deleteDomain($app->engineProject(), 'site1.example.com'), '/domains/'],
            // Not a stub: ProjectsApi::push() is refused before the call.
            // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:55 (with core/app/Auth/ProjectFields.php:16 `target`)
            'POST push target' => [static fn (Application $app, Application $source): mixed => (new ProjectsApi($source->engine()))->push($source->engineProject(), $app->engineProject()), '/push'],
        ];
    }

    /**
     * @param  Closure(Application, Application): mixed  $call
     */
    #[DataProvider('refusedEngineCalls')]
    public function test_every_refused_engine_operation_is_checked_before_the_call(Closure $call, string $path): void
    {
        $user = User::factory()->create();
        $application = $this->protectedApplication($user);
        $source = Application::query()->create([
            'engine_id' => $application->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $application->id,
        ]);

        try {
            $call($application, $source);
            $this->fail('Expected the protected-project refusal.');
        } catch (ProjectProtectedException $e) {
            // The Engine client refuses with facts only; the
            // Client Area renders the old-style 422.
            $this->assertSame('site1', $e->username);
            $this->assertNull($e->engineStatus);
            $rendered = app(ExceptionHandler::class)->render(request(), $e);
            $this->assertSame(422, $rendered->getStatusCode());
            $this->assertSame([0 => [ProtectedProject::REFUSAL]], json_decode((string) $rendered->getContent(), true)['errors']);
        }

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), $path)
            && $request->method() !== 'GET');
    }
}
