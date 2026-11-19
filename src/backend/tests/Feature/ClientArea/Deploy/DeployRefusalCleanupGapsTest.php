<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * A refused deploy or redeploy deletes the staged archive only when the request
 * says enough to find the project; every other refusal is the plain 422.
 */
class DeployRefusalCleanupGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const ARCHIVE = 'project/.panelalpha-upload/site.zip';

    public function test_a_redeploy_refused_without_an_archive_path_calls_no_engine(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", ['mode' => 'not-a-mode'])
            // CA reads: src/components/modal/FilesUploadVersionModal.vue:518
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/remove'));
    }

    public function test_a_redeploy_refusal_stays_a_422_when_the_cleanup_fails(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> FileController::remove
            'engine.example.com/api/projects/site1/files/remove*' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: src/components/modal/FilesUploadVersionModal.vue:518
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/redeploy", ['remote_filepath' => self::ARCHIVE, 'mode' => 'not-a-mode'])
            // CA reads: src/components/modal/FilesUploadVersionModal.vue:518
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');
    }

    public function test_a_deploy_refused_with_a_path_string_calls_no_engine(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // CA: src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', ['service_id' => VirtualService::ID, 'domain_id' => 999, 'source_type' => 'files', 'remote_filepath' => self::ARCHIVE])
            // CA reads: src/components/onboarding/OnboardingModalWrapper.vue:924
            ->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_a_deploy_refused_without_a_project_deletes_nothing(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user);

        // CA: src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', ['service_id' => VirtualService::ID, 'source_type' => 'not-a-source', 'remote_filepath' => [self::ARCHIVE]])
            // CA reads: src/components/onboarding/OnboardingModalWrapper.vue:924
            ->assertStatus(422);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/remove'));
    }

    public function test_a_deploy_refused_for_a_project_the_user_cannot_see_stays_a_422(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();

        // CA: src/components/onboarding/OnboardingModalWrapper.vue:924
        $this->actingAs($user)
            ->postJson('/api/projects/deploy', ['service_id' => VirtualService::ID, 'domain_id' => 999, 'source_type' => 'not-a-source', 'remote_filepath' => [self::ARCHIVE]])
            // CA reads: src/components/onboarding/OnboardingModalWrapper.vue:924
            ->assertStatus(422);

        Http::assertNothingSent();
    }
}
