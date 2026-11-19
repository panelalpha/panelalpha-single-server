<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Access\SingleServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The hosting-service seam: Community answers
 * its one virtual service; a paid edition replaces the directory and every
 * service the Client Area shows – `/home`, `/services`, a project's
 * `service_id`, the `/services/{service}/…` 404 – follows it.
 */
final class ServiceDirectoryTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_community_binds_the_virtual_service_by_default(): void
    {
        $directory = app(ServiceDirectory::class);
        $this->assertInstanceOf(SingleServiceDirectory::class, $directory);

        $user = User::factory()->create();
        $this->assertEquals([new HostingService(VirtualService::ID, VirtualService::PLAN_NAME)], $directory->forUser($user));
        $this->assertNull($directory->findForUser($user, 2));
        $this->assertSame(VirtualService::ID, $directory->ofApplication(new Application)->id);
    }

    public function test_a_replaced_directory_drives_every_service_the_client_area_shows(): void
    {
        $this->app->instance(ServiceDirectory::class, new class implements ServiceDirectory
        {
            public function forUser(Authenticatable $user): array
            {
                return [new HostingService(7, 'Business', projectLimit: 3, isTrial: true, trialExpiresAt: '2026-11-01')];
            }

            public function findForUser(Authenticatable $user, int $id): ?HostingService
            {
                return $id === 7 ? $this->forUser($user)[0] : null;
            }

            public function ofApplication(Application $application): HostingService
            {
                return new HostingService(7, 'Business', projectLimit: 3, isTrial: true, trialExpiresAt: '2026-11-01');
            }

            public function applicationsOf(HostingService $service, array $applications): array
            {
                return $applications;
            }
        });
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);

        // CA: packages/client-area/src/views/Services.vue:166 (Api.get("/services"))
        // CA reads: packages/client-area/src/views/Services.vue:168 (response.data.data)
        $this->actingAs($user)->getJson('/api/services')
            ->assertOk()
            ->assertJsonPath('data.0.id', 7)
            ->assertJsonPath('data.0.plan_name', 'Business')
            ->assertJsonPath('data.0.plan_settings.instance_limit', 3)
            ->assertJsonPath('data.0.is_trial', true);

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/views/Services.vue:168 (the services the CA lists)
        $this->actingAs($user)->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.services.0.id', 7)
            ->assertJsonPath('user.services.0.plan_name', 'Business')
            ->assertJsonPath('user.services.0.instance_limit', 3);

        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:36
        $this->actingAs($user)->getJson('/api/services/7/domains')->assertOk();
        // CA: packages/client-area/src/mixins/Onboarding/ServiceDomainsMixin.js:36
        $this->actingAs($user)->getJson('/api/services/'.VirtualService::ID.'/domains')->assertNotFound();
    }
}
