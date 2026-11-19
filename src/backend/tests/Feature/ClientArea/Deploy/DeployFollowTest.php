<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Projects\DeployWatch;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The panel keeps no deploy history, so the deploy-tracking seam
 * (`DeployTracker`, its `NullDeployTracker` default and client-area-legacy's
 * `deploy_logs` `DeployLogTracker`) is gone. The controller follows every deploy
 * it starts with its own watcher (`DeployState::follow()` → `WatchDeployJob`) and
 * refuses a second deploy while the Engine runs one (`isDeployRunning()`, the
 * Engine's newest deploy).
 *
 * Contract: `GET /projects/{u}/deploys` newest first
 * (`DeployHistoryController.php:39-42`, `DeployHistory.php:69-78`); a DinD
 * account without git ends its create deploy `running` until files arrive
 * (`DeployLogger::WAITING_FOR_FILES`).
 */
final class DeployFollowTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_deploy_tracking_seam_is_gone(): void
    {
        $this->assertFalse(interface_exists('PanelAlpha\\ClientArea\\Projects\\DeployTracker'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\NullDeployTracker'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Projects\\DeployLogTracker'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'));
    }

    public function test_follow_dispatches_the_controller_watcher_after_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        Queue::fake();

        app(DeployState::class)->follow(
            $application,
            47,
            new DeployWatch('user.instance.redeploy_finished', 'user.instance.redeploy_failed', 'project/.panelalpha-upload/site.zip'),
            DeployState::SOURCE_FILES,
        );

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 47
            && $job->finishedType === 'user.instance.redeploy_finished'
            && $job->failedType === 'user.instance.redeploy_failed'
            && $job->archivePath === 'project/.panelalpha-upload/site.zip'
            && $job->sourceType === 'files'
            && $job->deployId === null
            && $job->afterCommit === true
            && $job->queue === WatchDeployJob::QUEUE);
    }

    public function test_the_first_accepted_deploy_ends_the_files_onboarding(): void
    {
        // A files project the user left before uploading is still marked as
        // onboarding; the archive another route delivers (Upload new version)
        // is its first accepted deploy, so the marker goes.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $application->forceFill(['onboarding_files_at' => now()])->save();
        Queue::fake();

        app(DeployState::class)->follow(
            $application,
            47,
            new DeployWatch('user.instance.redeploy_finished', 'user.instance.redeploy_failed', 'project/.panelalpha-upload/site.zip'),
            DeployState::SOURCE_FILES,
        );

        $this->assertNull($application->fresh()->onboarding_files_at);
        Queue::assertPushed(WatchDeployJob::class);
    }

    public function test_a_running_engine_deploy_counts_whoever_started_it(): void
    {
        $user = User::factory()->create();
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'trigger' => 'cli'])]);
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        $this->assertTrue(app(DeployState::class)->isDeployRunning($application));
    }

    public function test_a_finished_newest_deploy_does_not_count(): void
    {
        $user = User::factory()->create();
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'success'])]);
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        $this->assertFalse(app(DeployState::class)->isDeployRunning($application));
    }

    public function test_the_create_deploy_waiting_for_files_never_counts(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        $application->forceFill(['onboarding_files_at' => now()])->save();
        // The create's deploy waits for the archive, `running` on the Engine.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'source' => 'template', 'kind' => 'install'])]);

        $this->assertFalse(app(DeployState::class)->isDeployRunning($application));
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/deploys'));
    }

    public function test_the_same_wait_on_a_project_the_panel_adopted_does_not_count_either(): void
    {
        // A project created outside the panel carries no onboarding marker; its
        // create deploy waits for files too, so the archive upload may deploy.
        $user = User::factory()->create();
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'source' => 'template', 'kind' => 'install', 'task_id' => null, 'trigger' => 'cli'])]);
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        $this->assertFalse(app(DeployState::class)->isDeployRunning($application));
    }
}
