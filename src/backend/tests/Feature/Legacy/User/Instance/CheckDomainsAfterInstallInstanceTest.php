<?php

namespace Tests\Feature\Legacy\User\Instance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Port of packages/api/tests/Feature/User/Instance/CheckDomainsAfterInstallInstanceTest.php.
 *
 * Since Engine 2.2.0 the install answers the old 201 with the instance
 * and queues the install job on the classic project the CA's domain step
 * created; the old expectations were a 201 plus rows with the `www.`-less
 * domain – v1 keeps no domain rows and presents the domain without `www.`
 *What these tests assert:
 * - main domain without www: packages/api/tests/Feature/User/Instance/CheckDomainsAfterInstallInstanceTest.php:73-107
 * - addon domain without www: :148-171
 * - subdomain without www: :214-237
 * - main domain with www: :267-301
 * - addon domain with www: :344-367
 * - subdomain with www: :410-433
 *
 * The old `User::first()` + `Plan::findOrFail()` + `createService()` internals
 * and the `@depends` chains are replaced by a v1 `User` factory and the domain
 * step.
 */
class CheckDomainsAfterInstallInstanceTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function assertInstalled(User $user, string $domain): void
    {
        Queue::fake();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'site55', 'details' => ['username' => 'site55', 'domain' => $domain]]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $domainId = $this->actingAs($user)->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => $domain])->json('data.id');

        // Legacy: CheckDomainsAfterInstallInstanceTest.php:64 POST /api/instances/install
        //   → POST /api/projects/install (v1 registers no /instances alias; the CA rewrites the segment)
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605 (POST /instances/install, …)
        $response = $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID,
            'domain_id' => $domainId,
            'install_method' => 'standard',
            'install_type' => 'clean',
            'name' => "custom {$domain}",
            'protocol' => 'https://',
            'domain' => $domain,
        ]);

        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1616-1621 (response.data.data)
        $response->assertStatus(201)
            ->assertJsonPath('data.id', $domainId)
            ->assertJsonPath('data.domain', preg_replace('/^www\./', '', $domain))
            ->assertJsonPath('data.async_status.installation', 'in_progress');
        Queue::assertPushed(InstallWordPressJob::class, fn (InstallWordPressJob $job): bool => $job->applicationId === $domainId);
        $this->assertSame("https://{$domain}", Application::query()->findOrFail($domainId)->wordpressInstall?->params['url']);
    }

    public function test_can_install_instance_in_main_domain_without_www_prefix(): void
    {
        // Legacy: CheckDomainsAfterInstallInstanceTest.php:55-57 Plan::findOrFail($planId) + $user->createService($plan)
        //   → a v1 user and the virtual service
        $user = User::factory()->create();

        $this->assertInstalled($user, 'main.without-www.dev');
    }

    public function test_can_install_instance_in_addon_domain_without_www_prefix(): void
    {
        $user = User::factory()->create();

        $this->assertInstalled($user, 'addon.without-www.dev');
    }

    public function test_can_install_instance_in_subdomain_without_www_prefix(): void
    {
        $user = User::factory()->create();

        $this->assertInstalled($user, 'sub.main.without-www.dev');
    }

    public function test_can_install_instance_in_main_domain_with_www_prefix(): void
    {
        $user = User::factory()->create();

        $this->assertInstalled($user, 'www.main.with-www.dev');
    }

    public function test_can_install_instance_in_addon_domain_with_www_prefix(): void
    {
        $user = User::factory()->create();

        $this->assertInstalled($user, 'www.addon.with-www.dev');
    }

    public function test_can_install_instance_in_subdomain_with_www_prefix(): void
    {
        $user = User::factory()->create();

        $this->assertInstalled($user, 'www.sub.main.with-www.dev');
    }
}
