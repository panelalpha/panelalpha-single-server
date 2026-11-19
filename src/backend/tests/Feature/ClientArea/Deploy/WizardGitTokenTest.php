<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Http\Presenters\GitPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitAutoDeployService;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The wizard git token end to end: a wizard create from a private repository
 * must leave the token on the project, so the Git card shows it as saved and
 * auto-deploy gets past its credentials check. A public repository has no
 * token and auto-deploy still asks for one.
 */
class WizardGitTokenTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Runs the no-domain wizard create (the CA default git path) for the given
     * repository and token, and returns the stored project row.
     */
    private function wizardCreate(string $username, string $repoUrl, ?string $token): Application
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->fakeHostResolver([
            'github.com' => [TestNetwork::routable(35)],
            'api.github.com' => [TestNetwork::routable(36)],
        ]);
        $this->fakeEngineDeploys($username);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 57,
                'username' => $username,
                'details' => ['username' => $username, 'domain' => "{$username}.panelalpha.online", 'action' => 'deploy'],
            ]], 202),
        ]);

        $payload = [
            'service_id' => VirtualService::ID,
            'source_type' => 'git',
            'repo_url' => $repoUrl,
            'branch' => 'main',
        ];
        if ($token !== null) {
            $payload['token'] = $token;
        }

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:624
        $this->actingAs($user)->postJson('/api/projects/deploy', $payload)->assertOk();

        return Application::query()->where('engine_username', $username)->sole();
    }

    public function test_a_wizard_create_with_a_token_shows_it_as_saved_and_lets_auto_deploy_enable(): void
    {
        $application = $this->wizardCreate('sitez', 'https://github.com/example/site.git', 'ghp_secret');

        // Advanced > Git: the token is saved, so the card does not say "No token saved".
        $this->assertSame('pat', app(GitPresenter::class)->present($application, [])['auth_type']);

        // Engine: core/app/Http/Controllers/User/DeployHookController.php:108 -> DeployHookController::create (new hook: URL and secret)
        Http::fake([
            'engine.example.com/api/projects/sitez/git/deploy-hook' => Http::response(['data' => [
                'url' => 'https://engine.test/hooks/z',
                'secret' => '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90',
                'tls' => ['state' => 'valid'],
            ]], 201),
            // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook)
            'api.github.com/*' => Http::response(['id' => 778]),
        ]);

        app(GitAutoDeployService::class)->enable($application);

        $this->assertSame('778', $application->fresh()->git_webhook_id);
    }

    public function test_a_wizard_create_without_a_token_still_asks_for_credentials_to_enable_auto_deploy(): void
    {
        $application = $this->wizardCreate('sitep', 'https://github.com/example/public-site.git', null);

        $this->assertNull(app(GitPresenter::class)->present($application, [])['auth_type']);

        $this->expectException(ValidationException::class);

        app(GitAutoDeployService::class)->enable($application);
    }
}
