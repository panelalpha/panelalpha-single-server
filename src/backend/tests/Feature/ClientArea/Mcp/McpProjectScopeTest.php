<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Mcp\McpProjectScope;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The reach of a user's Connect AI tokens is every project of
 * that user – live and staging – on that Engine, and nothing else
 * (`McpProjectScope`). The user ↔ project relation is the
 * edition's `ApplicationRepository::forUser($user, refresh: false)`, so the
 * scope follows the repository, never `Application::all()`, and never calls
 * the Engine. The panel's own project is never in it, and neither is any other
 * project that runs a panel (`PANELALPHA_SELF_PROJECT`).
 *
 * Engine: `GET /projects/all` (core/app/Http/Controllers/UserController.php:122)
 * feeds the mirror the Community repository reads; `staging_of` links a staging to
 * its live project.
 */
final class McpProjectScopeTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  list<array<string, mixed>>  $projects
     */
    private function mirror(array $projects): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 → UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => $projects])]);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
    }

    public function test_the_scope_is_every_live_and_staging_project_of_the_user(): void
    {
        $this->mirror([
            $this->engineProject(3, 'site2'),
            $this->engineProject(1, 'site1'),
            $this->engineProject(2, 'site1stg', ['staging_of' => 'site1']),
        ]);

        $scope = app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID);

        // Sorted and unique, the staging included.
        $this->assertSame(['site1', 'site1stg', 'site2'], $scope);
    }

    public function test_a_user_without_projects_gets_an_empty_scope(): void
    {
        $this->mirror([]);

        $scope = app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID);

        // Never null: an empty list scopes a token to no project.
        $this->assertSame([], $scope);
    }

    public function test_the_panels_own_project_is_never_in_the_scope(): void
    {
        config(['client-area.self_project' => 'panelv1']);
        $this->mirror([
            $this->engineProject(1, 'site1'),
            $this->engineProject(2, 'panelv1'),
        ]);

        $this->assertSame(['site1'], app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID));

        // The sync already skips it; a repository that returned it anyway
        // (an edition's own query) must still not hand it to an AI client.
        $this->bindRepository([
            $this->row(EngineConnection::DEFAULT_ID, 'site1'),
            $this->row(EngineConnection::DEFAULT_ID, 'panelv1'),
        ]);

        $this->assertSame(['site1'], app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID));
    }

    public function test_the_scope_follows_the_edition_repository_not_the_whole_mirror(): void
    {
        // Three projects are mirrored, but this edition links only one of them
        // (and one on another Engine) to the user: the scope is the
        // repository's answer, filtered to the Engine, not `Application::all()`.
        $this->mirror([
            $this->engineProject(1, 'site1'),
            $this->engineProject(2, 'site2'),
            $this->engineProject(3, 'site3'),
        ]);
        $repository = $this->bindRepository([
            $this->row(EngineConnection::DEFAULT_ID, 'site2'),
            $this->row(EngineConnection::DEFAULT_ID + 1, 'elsewhere'),
        ]);
        $user = User::factory()->create();
        Http::fake();

        $scope = app(McpProjectScope::class)->for($user, EngineConnection::DEFAULT_ID);

        $this->assertSame(['site2'], $scope);
        $this->assertSame(['elsewhere'], app(McpProjectScope::class)->for($user, EngineConnection::DEFAULT_ID + 1));
        // The mirror only: `refresh: false`, so a scope never calls the Engine.
        $this->assertSame([false, false], $repository->refreshes);
        $this->assertSame([$user->id, $user->id], $repository->users);
        Http::assertNothingSent();
    }

    public function test_no_project_that_runs_a_panel_is_in_the_scope(): void
    {
        // The Engine keeps a project's override keys among its details: the
        // panel is deployed with `PANELALPHA_SELF_PROJECT`, so a project that
        // carries it is a panel's own project (any panel, not only this one).
        // A setup-wizard install carries no override: its details name the
        // platform of the archive it runs instead.
        $this->mirror([
            $this->engineProject(1, 'site1'),
            $this->engineProject(2, 'otherpanel', ['details' => [
                'env_override_keys' => ['PANELALPHA_USER_EMAIL', 'PANELALPHA_USER_PASSWORD', 'PANELALPHA_SELF_PROJECT'],
            ]]),
            $this->engineProject(3, 'site2', ['details' => ['env_override_keys' => ['AUTH_PASSWORD_TIMEOUT']]]),
            $this->engineProject(4, 'wizardpanel', ['details' => ['template' => 'dind', 'deploy_platform' => 'panelalpha-v1']]),
        ]);

        // An ordinary project's other overrides do not hide it.
        $this->assertSame(['site1', 'site2'], app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID));

        // An edition's repository that returned one anyway (its own query, a
        // row a pre-fix sync imported) must not hand it to an AI client.
        $wizard = $this->row(EngineConnection::DEFAULT_ID, 'wizardpanel');
        $wizard->engine_payload = ['details' => ['template' => 'dind', 'deploy_platform' => 'panelalpha-v1']];
        $this->bindRepository([$this->row(EngineConnection::DEFAULT_ID, 'site1'), $wizard]);

        $this->assertSame(['site1'], app(McpProjectScope::class)->for(User::factory()->create(), EngineConnection::DEFAULT_ID));
    }

    private function row(int $engineId, string $username): Application
    {
        $application = new Application;
        $application->engine_id = $engineId;
        $application->engine_username = $username;

        return $application;
    }

    /**
     * A second edition's repository: it returns exactly the rows given and
     * records how it was asked.
     *
     * @param  list<Application>  $rows
     */
    private function bindRepository(array $rows): object
    {
        $repository = new class($rows) implements ApplicationRepository
        {
            /** @var list<bool> */
            public array $refreshes = [];

            /** @var list<mixed> */
            public array $users = [];

            /** @param list<Application> $rows */
            public function __construct(private readonly array $rows) {}

            public function forUser(Authenticatable $user, bool $refresh = true): Collection
            {
                $this->refreshes[] = $refresh;
                $this->users[] = $user->getAuthIdentifier();

                return new Collection($this->rows);
            }

            public function findForUser(Authenticatable $user, int $id): Application
            {
                throw new \LogicException('not used by the scope');
            }

            public function domainsInUse(): array
            {
                return [];
            }
        };
        $this->app->instance(ApplicationRepository::class, $repository);

        return $repository;
    }
}
