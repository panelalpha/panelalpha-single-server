<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use Tests\TestCase;

/**
 * @see packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:766 (POST /services/{id}/domains {source_type:"files"})
 * @see packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566 (POST /services/{id}/domains)
 * @see Engine core/app/Http/Controllers/UserController.php:283 -> UserController::storeAsync (POST /projects, 202 + Task)
 * @see packages/api/routes/api.php:179 (old instance.install)
 */
class CommunityProvisionerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_provision_creates_project_on_engine_and_pending_row(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => [
            'id' => 55,
            'username' => 'shop',
            'status' => 'queued',
        ]], 202)]);

        $result = $this->app->make(ApplicationProvisioner::class)->provision(
            User::factory()->create(),
            new ProvisionRequest(domain: 'shop.example.com', gitRepo: 'https://github.com/acme/shop', gitBranch: 'main'),
        );

        $this->assertSame(55, $result->taskId);
        $this->assertSame('shop', $result->application->engine_username);
        $this->assertSame('pending', $result->application->status);
        $this->assertNotNull($result->application->panel_created_at, 'the panel asked for this project');
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request['domain'] === 'shop.example.com'
            && $request['git_repo'] === 'https://github.com/acme/shop'
            && ! isset($request['template']));
    }
}
