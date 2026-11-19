<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * GitService paths `Git/GitTest` does not reach: a repository the panel cannot
 * reuse or parse, the SSH refusals, a missing branch and a checkout that cannot
 * be settled.
 */
class GitServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Sleep::fake();
        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void {}

            public function allows(string $host): bool
            {
                return true;
            }

            public function validatedAddresses(string $host): array
            {
                return [$host];
            }
        });
    }

    private function service(): GitService
    {
        return app(GitService::class);
    }

    /**
     * A project with no git repository recorded.
     *
     * @param  array<string, mixed>  $details
     */
    private function application(array $details = [], string $status = 'active'): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1', ['details' => $details, 'status' => $status]);
    }

    public function test_show_rethrows_a_deploy_hook_failure_that_is_not_a_404(): void
    {
        $application = $this->application(['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);

        // Engine: core/app/Http/Controllers/User/GitController.php:94 -> GitController::status; deploy-hook GET DeployHookController.php:185 -> DeployHookController::show
        Http::fake([
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true, 'branch' => 'main']]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->expectException(EngineRequestException::class);

        $this->service()->show($application);
    }

    public function test_connect_by_repository_id_without_a_recorded_repository_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->connect($application, ['git_repository_id' => 4]);
            $this->fail('A repository that is not recorded cannot be reused.');
        } catch (ValidationException $e) {
            $this->assertSame(['The repository is not available any more.'], $e->errors()['repo_url']);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/git/'));
    }

    public function test_connect_by_repository_id_reuses_the_repository_of_the_parent_project(): void
    {
        $parent = $this->application(['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (+status :94, deploy-hook GET DeployHookController.php:185 -> DeployHookController::show)
        Http::fake([
            'engine.example.com/api/projects/site1-staging/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1-staging/git/status' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1-staging/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->service()->connect($staging, ['git_repository_id' => 4, 'branch' => 'main']);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/site1-staging/git/connect')
            && $request['repo_url'] === 'https://github.com/acme/site');
    }

    public function test_connect_by_repository_id_reuses_the_repository_of_the_staging(): void
    {
        $parent = $this->application();
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']],
        ]);

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (+status :94, deploy-hook GET DeployHookController.php:185 -> DeployHookController::show)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->service()->connect($parent->fresh(), ['git_repository_id' => 4, 'branch' => 'main']);

        $this->assertSame($staging->gitRepositoryUrl(), $parent->fresh()->git_source);
    }

    public function test_connect_refuses_a_url_the_panel_cannot_parse(): void
    {
        $application = $this->application();

        try {
            $this->service()->connect($application, ['repo_url' => 'not a repository']);
            $this->fail('An unparsable repository URL must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid repository URL.'], $e->errors()['repo_url']);
        }
    }

    public function test_connect_without_a_url_sends_no_branch_the_panel_could_not_find(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (+status :94, deploy-hook GET DeployHookController.php:185 -> DeployHookController::show)
        Http::fake([
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->service()->connect($application, ['token' => 'ghp_x']);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/git/connect') && ! isset($request['branch']));
    }

    public function test_connect_goes_on_without_a_branch_when_the_engine_cannot_inspect_the_repository(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/SourceInspectionController.php:130 -> inspect (Engine 5xx)
        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (+status :94, deploy-hook GET DeployHookController.php:185 -> DeployHookController::show)
        Http::fake([
            'engine.example.com/api/source/inspect' => Http::response(['message' => 'boom'], 500),
            'engine.example.com/api/projects/site1/git/connect' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => true]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->service()->connect($application, ['repo_url' => 'https://github.com/acme/site']);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/git/connect') && ! isset($request['branch']));
    }

    public function test_an_ssh_connect_without_a_branch_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->connect($application, ['repo_url' => 'git@github.com:acme/site.git']);
            $this->fail('An SSH repository needs a branch.');
        } catch (ValidationException $e) {
            $this->assertSame(['Enter the branch to deploy.'], $e->errors()['branch']);
        }
    }

    public function test_an_ssh_connect_keeps_the_engine_host_refusal_text(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (422, problems[].code host_refused)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response([
            'message' => 'The host is not allowed.',
            'errors' => ['repo_url' => ['The host is not allowed.']],
            'problems' => [['code' => 'host_refused', 'message' => 'The host is not allowed.']],
        ], 422)]);

        $this->expectException(EngineValidationException::class);

        $this->service()->connect($application, ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main']);
    }

    /**
     * @return array<string, array{int, array<string, mixed>, string}>
     */
    public static function sshRefusalProvider(): array
    {
        return [
            '422 key refused in problems' => [422, ['message' => 'no', 'errors' => ['repo_url' => ['no']], 'problems' => [['code' => 'git_ssh_key_refused']]], EngineText::SSH_KEY_REFUSED],
            '422 key refused in code' => [422, ['message' => 'no', 'errors' => ['repo_url' => ['no']], 'code' => 'git_ssh_key_refused'], EngineText::SSH_KEY_REFUSED],
            '422 other' => [422, ['message' => 'no', 'errors' => ['repo_url' => ['no']]], EngineText::SSH_CONNECT_FAILED],
            '400 key refused' => [400, ['message' => 'no', 'code' => 'git_ssh_key_refused'], EngineText::SSH_KEY_REFUSED],
            '400 key refused in problems' => [400, ['message' => 'no', 'problems' => [['code' => 'git_ssh_key_refused']]], EngineText::SSH_KEY_REFUSED],
            '400 other' => [400, ['message' => 'no'], EngineText::SSH_CONNECT_FAILED],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('sshRefusalProvider')]
    public function test_an_ssh_connect_refusal_becomes_one_of_two_user_sentences(int $status, array $body, string $message): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (400 and 422 refusals)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response($body, $status)]);

        try {
            $this->service()->connect($application, ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main']);
            $this->fail('A refused SSH connect must be a validation error.');
        } catch (ValidationException $e) {
            $this->assertSame([$message], $e->errors()['repo_url']);
        }
    }

    public function test_an_ssh_connect_rethrows_a_server_error(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:189 -> GitController::connect (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/git/connect' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->connect($application, ['repo_url' => 'git@github.com:acme/site.git', 'branch' => 'main']);
    }

    public function test_repair_without_a_recorded_repository_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->repair($application);
            $this->fail('A repair needs a recorded repository.');
        } catch (ValidationException $e) {
            $this->assertSame(['The repository is not available any more.'], $e->errors()['repo_url']);
        }
    }

    public function test_credentials_of_a_project_without_a_recorded_repository_go_to_the_engine_unchecked(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:292 -> GitController::updateCredentials (+status :94, deploy-hook GET DeployHookController.php:185 -> DeployHookController::show)
        Http::fake([
            'engine.example.com/api/projects/site1/git/update-credentials' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => false]]),
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => []]),
        ]);

        $this->service()->updateCredentials($application, ['token' => 'ghp_new', 'auth_type' => 'pat']);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/git/update-credentials'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/source/refs'));
    }

    public function test_changing_the_branch_names_the_branch_when_the_checkout_cannot_be_settled(): void
    {
        $application = $this->application(['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main']);
        $this->fakeEngineDeploys('site1');

        // Engine: core/app/Http/Controllers/UserController.php:626 -> UserController::rebuild (202 + Task)
        // Engine: core/app/Http/Controllers/TaskController.php:207 -> show (a failed task with details.error)
        Http::fake([
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 31]], 202),
            'engine.example.com/api/tasks/31' => Http::response(['data' => ['id' => 31, 'status' => 'failed', 'details' => ['error' => 'Rebuild failed.']]]),
        ]);

        try {
            $this->service()->changeBranch($application, 'develop');
            $this->fail('A checkout that cannot be settled must refuse the switch.');
        } catch (ValidationException $e) {
            $this->assertSame(['Rebuild failed.'], $e->errors()['branch']);
        }
    }
}
