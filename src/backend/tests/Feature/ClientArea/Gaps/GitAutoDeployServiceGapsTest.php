<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use PanelAlpha\ClientArea\Git\Providers\ProviderFactory;
use PanelAlpha\ClientArea\Git\ProviderTarget;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitAutoDeployService;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The auto-deploy hook service paths `Git/GitTest` does not reach: a hook the
 * Engine still has, an Engine answer without a secret or a URL, a provider
 * answer without an id and a rollback that fails.
 */
class GitAutoDeployServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
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

    private function service(): GitAutoDeployService
    {
        return app(GitAutoDeployService::class);
    }

    /**
     * A GitHub project with a token and, optionally, a registered provider hook.
     */
    private function application(?string $webhookId = null, string $token = 'ghp_token'): Application
    {
        $application = $this->syncedApplication(User::factory()->create(), 'site1', [
            'details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main'],
        ]);
        $application->forceFill(['git_token' => $token, 'git_provider' => 'github', 'git_webhook_id' => $webhookId])->save();

        return $application->fresh();
    }

    public function test_enable_does_nothing_when_the_engine_still_has_the_hook(): void
    {
        $application = $this->application('555');

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:185 -> DeployHookController::show
        Http::fake(['engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => ['url' => 'https://engine.test/hooks/a']])]);

        $this->service()->enable($application);

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'api.github.com'));
        $this->assertSame('555', $application->fresh()->git_webhook_id);
    }

    public function test_enable_rethrows_a_hook_check_failure_that_is_not_a_404(): void
    {
        $application = $this->application('555');

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:185 -> DeployHookController::show (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->enable($application);
    }

    public function test_enable_rotates_the_hook_when_the_create_answer_has_no_secret(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (the hook existed: no secret)
        // Engine: core/app/Http/Controllers/User/DeployHookController.php:234 -> DeployHookController::rotate
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/new',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'valid'],
            ]]),
            // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (the hook existed: a URL and no secret)
            'engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => ['url' => 'https://engine.test/hooks/new', 'tls' => ['state' => 'valid']]], 201),
            // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook)
            'api.github.com/*' => Http::response(['id' => 777]),
        ]);

        $this->service()->enable($application);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/git/deploy-hook/rotate'));
        $this->assertSame('777', $application->fresh()->git_webhook_id);
    }

    public function test_enable_fails_with_a_bad_gateway_when_the_engine_sends_no_url(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (a secret but no URL)
        Http::fake(['engine.example.com/api/projects/site1/git/deploy-hook' => Http::response(['data' => ['secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90']], 201)]);

        try {
            $this->service()->enable($application);
            $this->fail('A hook without a URL cannot be registered.');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, $e->engineStatus);
        }
    }

    public function test_enable_removes_the_engine_hook_when_the_provider_gives_no_id(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => function ($request) {
                // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create
                // Engine: core/app/Http/Controllers/User/DeployHookController.php:259 -> DeployHookController::destroy (204) and :108 -> create
                return $request->method() === 'DELETE'
                    ? Http::response(null, 204)
                    // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (201, URL, secret and TLS state)
                    : Http::response(['data' => ['url' => 'https://engine.test/hooks/new', 'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90', 'tls' => ['state' => 'valid']]], 201);
            },
            // External: https://docs.github.com/en/rest/repos/webhooks (a created webhook has an id; this answer has none)
            'api.github.com/*' => Http::response([]),
        ]);

        try {
            $this->service()->enable($application);
            $this->fail('A provider answer without an id is a failed registration.');
        } catch (ValidationException $e) {
            $this->assertSame([GitService::WEBHOOK_REGISTRATION_FAILED], $e->errors()[0]);
        }

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE' && str_ends_with($request->url(), '/git/deploy-hook'));
        $this->assertNull($application->fresh()->git_webhook_id);
    }

    public function test_enable_still_reports_the_registration_failure_when_the_engine_rollback_fails(): void
    {
        $application = $this->application();

        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook' => function ($request) {
                // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create; DELETE answers 5xx
                return $request->method() === 'DELETE'
                    ? Http::response(['message' => 'boom'], 500)
                    // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (201, URL, secret and TLS state)
                    : Http::response(['data' => ['url' => 'https://engine.test/hooks/new', 'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90', 'tls' => ['state' => 'valid']]], 201);
            },
            // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook; a 5xx here)
            'api.github.com/*' => Http::response(['message' => 'nope'], 500),
        ]);

        $this->expectException(ValidationException::class);

        $this->service()->enable($application);
    }

    public function test_rotate_does_nothing_without_a_provider_hook(): void
    {
        $application = $this->application(null);

        $this->service()->rotate($application);

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'deploy-hook'));
    }

    public function test_rotate_fails_with_a_bad_gateway_when_the_engine_sends_no_secret(): void
    {
        $application = $this->application('555');

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:234 -> DeployHookController::rotate (no secret)
        Http::fake(['engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => ['url' => 'https://engine.test/hooks/new']])]);

        try {
            $this->service()->rotate($application);
            $this->fail('A rotated hook without a secret cannot be registered.');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, $e->engineStatus);
        }
    }

    public function test_rotate_fails_with_a_bad_gateway_when_the_provider_gives_no_id(): void
    {
        $application = $this->application('555');

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:234 -> DeployHookController::rotate
        Http::fake([
            'engine.example.com/api/projects/site1/git/deploy-hook/rotate' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/new',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'valid'],
            ]]),
            // External: https://docs.github.com/en/rest/repos/webhooks (delete and create a repository webhook; the create answer has no id)
            'api.github.com/*' => Http::response([]),
        ]);

        try {
            $this->service()->rotate($application);
            $this->fail('A provider answer without an id is a failed registration.');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, $e->engineStatus);
        }
    }

    public function test_a_repository_url_with_no_repository_path_has_no_provider_target(): void
    {
        $this->assertNull(ProviderTarget::fromUrl('https://github.com/solo'));
    }

    public function test_the_provider_factory_refuses_an_unknown_provider(): void
    {
        $target = new ProviderTarget('forgejo', 'git.example.org', 'https://git.example.org/api', 'acme', 'site', '');

        $this->expectException(InvalidArgumentException::class);

        app(ProviderFactory::class)->for($target, 'token');
    }
}
