<?php

namespace Tests\Feature\Legacy\User;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/User/InstanceControllerTest.php.
 * The old `User::first()` + service /
 * server-account / domain lookups become v1's one virtual service; the request
 * body is kept verbatim. The method ended in `$response->dd()` and asserted
 * nothing, so the ported assertion is v1's 201 with the install queued (Engine
 * 2.2.0).
 */
class InstanceControllerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_create_instance_by_user(): void
    {
        // Legacy: InstanceControllerTest.php:17-33 User::first() + the service,
        // server-account and domain lookups → v1's virtual service, a factory
        // user and the classic project the CA's domain step creates.
        \Illuminate\Support\Facades\Queue::fake();
        $user = User::factory()->create();
        $application = $this->domainStepProject($user);

        // Legacy: InstanceControllerTest.php:35-39 request body kept verbatim
        // (`service_id`, `domain_id`, `name`). The CA posts to
        // /instances/install and axios rewrites it to /projects/install in
        // single-server mode; v1 registers only the latter.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605 (POST /instances/install)
        $response = $this->actingAs($user)
            ->postJson('/api/projects/install', [
                'service_id' => VirtualService::ID,
                'domain_id' => $application->id,
                'name' => 'Test Instance',
            ]);

        // Legacy: InstanceControllerTest.php:42 `$response->dd()` → the old 201
        // with the instance installing (Engine 2.2.0); the Engine calls run
        // in the queued install job (InstallWordPressTest).
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1616-1621 (response.data.data)
        $response->assertStatus(201)->assertJsonPath('data.id', $application->id)->assertJsonPath('data.async_status.installation', 'in_progress');
        \Illuminate\Support\Facades\Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob::class);
        $this->assertSame('Test Instance', $application->fresh()?->site_name);
    }
}
