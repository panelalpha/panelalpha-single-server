<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * GET /projects/{id}/screenshot(.jpg) and
 * POST /projects/{id}/refresh-thumbnail (Engine Lighthouse).
 * @see packages/client-area/src/apis/Instances.js:141 (screenshot_url)
 * @see Engine core/routes/api.php:487 (lighthouse/generate-report)
 */
class ScreenshotTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Storage::fake('local');
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    /** A tiny valid JPG data URI as Lighthouse returns it. */
    private function dataUri(): string
    {
        return 'data:image/jpeg;base64,'.base64_encode("\xFF\xD8\xFF\xE0jpeg-bytes");
    }

    public function test_refresh_thumbnail_stores_the_lighthouse_screenshot(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/LighthouseController.php:54 -> LighthouseController::generateReport
        Http::fake(['engine.example.com/api/lighthouse/generate-report' => Http::response(['data' => [
            'audits' => ['final-screenshot' => ['details' => ['data' => $this->dataUri()]]],
        ]])]);

        // CA: src/components/cards/SiteDetailsInfoCard.vue:115
        // CA reads: src/components/cards/SiteDetailsInfoCard.vue:117
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/refresh-thumbnail")
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertGreaterThan(0, $application->fresh()->screenshot_time);
        Storage::disk('local')->assertExists("screenshots/{$application->id}.jpg");
    }

    public function test_refresh_thumbnail_is_422_when_the_engine_cannot_produce_a_report(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/LighthouseController.php:54 -> LighthouseController::generateReport
        Http::fake(['engine.example.com/api/lighthouse/generate-report' => Http::response(['message' => 'lighthouse failed'], 502)]);

        // CA: src/components/cards/SiteDetailsInfoCard.vue:115
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/refresh-thumbnail")
            ->assertStatus(422);
    }

    public function test_refresh_thumbnail_is_422_when_the_engine_is_unreachable(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/LighthouseController.php:54 -> LighthouseController::generateReport
        Http::fake(['engine.example.com/api/lighthouse/generate-report' => Http::failedConnection()]);

        // CA: src/components/cards/SiteDetailsInfoCard.vue:115
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/refresh-thumbnail")
            ->assertStatus(422);
    }

    public function test_screenshot_jpg_serves_stored_image_or_a_placeholder(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // No screenshot yet -> 1x1 GIF placeholder, never a broken image.
        // CA: src/apis/Instances.js:141
        $this->actingAs($user)
            ->get("/api/projects/{$application->id}/screenshot.jpg")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/gif');

        Storage::disk('local')->put("screenshots/{$application->id}.jpg", 'jpeg-bytes');

        // CA: src/apis/Instances.js:141
        $this->actingAs($user)
            ->get("/api/projects/{$application->id}/screenshot.jpg")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            // A per-user resource: shared caches must not store it.
            ->assertHeader('Cache-Control', 'max-age=604800, private');
    }

    public function test_screenshot_returns_base64_payload(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Storage::disk('local')->put("screenshots/{$application->id}.jpg", 'jpeg-bytes');

        // CA: src/apis/Instances.js:141
        // CA reads: src/apis/Instances.js:141 (`screenshot_url` carries the id)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/screenshot")
            ->assertOk()
            ->assertJsonPath('base64', base64_encode('jpeg-bytes'));
    }

    public function test_screenshot_requires_authentication(): void
    {
        // CA: src/apis/Instances.js:141
        $this->get('/api/projects/1/screenshot.jpg')->assertUnauthorized();
    }
}
