<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectScreenshotJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchPushJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * @see Engine core/routes/api.php:487 (lighthouse/generate-report)
 */
final class ProjectScreenshotQueueTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Storage::fake('local');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function finishedTypes(): array
    {
        return [
            'install, deploy or import' => ['user.instance.installation_finished'],
            'redeploy' => ['user.instance.redeploy_finished'],
            'git auto deploy' => ['user.instance.git_auto_deploy_finished'],
            'staging copy' => ['user.instance.create_staging_finished'],
        ];
    }

    #[DataProvider('finishedTypes')]
    public function test_a_finished_change_queues_the_screenshot_on_the_long_queue(string $type): void
    {
        $application = $this->syncedApplication(User::factory()->create());
        Notification::fake();
        Queue::fake([RefreshProjectScreenshotJob::class]);

        ClientAreaNotificationRequested::dispatch($application, $type);

        Queue::assertPushed(RefreshProjectScreenshotJob::class, fn (RefreshProjectScreenshotJob $job): bool => $job->applicationId === $application->id
            && $job->queue === 'long'
            && $job->connection === 'database-long'
            && $job->delay === RefreshProjectScreenshotJob::DELAY_SECONDS);
    }

    public function test_a_failure_or_another_notification_queues_nothing(): void
    {
        $application = $this->syncedApplication(User::factory()->create());
        Notification::fake();
        Queue::fake([RefreshProjectScreenshotJob::class]);

        ClientAreaNotificationRequested::dispatch($application, 'user.instance.installation_finished', isError: true);
        ClientAreaNotificationRequested::dispatch($application, 'user.instance.installation_failed', isError: true);
        ClientAreaNotificationRequested::dispatch($application, 'user.instance.plugin.install_finished');

        Queue::assertNotPushed(RefreshProjectScreenshotJob::class);
    }

    public function test_a_finished_push_queues_the_screenshot_of_its_target(): void
    {
        $live = $this->syncedApplication(User::factory()->create());
        $staging = Application::query()->create([
            'engine_id' => $live->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $live->id,
        ]);
        Notification::fake();
        Queue::fake([RefreshProjectScreenshotJob::class]);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:80 -> show
            'engine.example.com/api/tasks/77' => Http::response(['data' => ['id' => 77, 'status' => 'completed', 'details' => ['action' => 'push']]]),
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> show (the target mirror)
            'engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1', 'status' => 'active']]),
        ]);

        (new WatchPushJob($staging->id, $live->id, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', 77))
            ->handle(app(ApplicationSynchronizer::class));

        Queue::assertPushed(RefreshProjectScreenshotJob::class, fn (RefreshProjectScreenshotJob $job): bool => $job->applicationId === $live->id);
        Queue::assertNotPushed(RefreshProjectScreenshotJob::class, fn (RefreshProjectScreenshotJob $job): bool => $job->applicationId === $staging->id);
    }

    public function test_the_job_stores_the_lighthouse_screenshot(): void
    {
        $application = $this->syncedApplication(User::factory()->create());
        // Engine: core/app/Http/Controllers/LighthouseController.php:54 -> LighthouseController::generateReport
        Http::fake(['engine.example.com/api/lighthouse/generate-report' => Http::response(['data' => [
            'audits' => ['final-screenshot' => ['details' => ['data' => 'data:image/jpeg;base64,'.base64_encode("\xFF\xD8\xFF\xE0jpeg-bytes")]]],
        ]])]);

        RefreshProjectScreenshotJob::dispatchSync($application->id);

        Storage::disk('local')->assertExists("screenshots/{$application->id}.jpg");
        $this->assertGreaterThan(0, $application->fresh()->screenshot_time);
    }

    public function test_a_site_lighthouse_cannot_reach_keeps_its_old_picture_without_failing(): void
    {
        $application = $this->syncedApplication(User::factory()->create());
        // Engine: core/app/Http/Controllers/LighthouseController.php:54 -> LighthouseController::generateReport
        Http::fake(['engine.example.com/api/lighthouse/generate-report' => Http::response(['message' => 'lighthouse failed'], 502)]);

        RefreshProjectScreenshotJob::dispatchSync($application->id);

        Storage::disk('local')->assertMissing("screenshots/{$application->id}.jpg");
    }
}
