<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Projects\ClassicOnboardingState;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Contract:
 *  - the untouched classic project the plain domain step created is replaced in
 *    the background: `DELETE E/projects/{u}` then one `POST E/projects`
 *    (`template: dind` + the git source, `UserController::storeAsync`, 202 +
 *    TaskResource), which the controller's `WatchDeployJob` follows (no deploy row);
 *  - a busy delete (the domain-step create task still running, 409) waits; an
 *    Engine hiccup at either write – a connection error or a 5xx – is retried
 *    with backoff until the wall-clock cap, then the row ends with
 *    `installation_failed`.
 */
class ReplaceClassicOnboardingProjectJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Sleep::fake();
    }

    private function application(User $user): Application
    {
        $application = $this->syncedApplication($user, 'shop', ['domain' => 'shop.example.com', 'details' => []]);
        $application->forceFill(['onboarding_at' => now()])->save();

        return $application;
    }

    /**
     * @return array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>}
     */
    private function source(): array
    {
        return [
            'git_repo' => 'https://github.com/example/site.git',
            'git_branch' => 'main',
            'git_token' => null,
            'env_vars' => [],
        ];
    }

    public function test_it_waits_while_the_classic_project_is_still_busy(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> destroy; the create task still runs -> busy 409
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['message' => 'A deploy of this project is already queued or running: task 91.'], 409),
        ]);

        $this->runOnce($application);

        // Busy = not ready yet: the job is requeued to poll, not backed off as
        // a hiccup.
        Queue::assertPushed(ReplaceClassicOnboardingProjectJob::class, fn (ReplaceClassicOnboardingProjectJob $job): bool => $job->applicationId === $application->id
            && $job->source === $this->source()
            && $job->hiccupAttempt === 0
            && $job->startedAt > 0);
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    #[DataProvider('writeHiccups')]
    public function test_it_retries_a_create_write_hiccup(string $failure): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        if ($failure === 'connection') {
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> destroy (the classic project is still there)
            // Engine: core/app/Http/Controllers/UserController.php:300 -> storeAsync
            Http::fake([
                'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
                'engine.example.com/api/projects' => Http::failedConnection(),
            ]);
        } else {
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> destroy (the classic project is still there)
            // Engine: core/app/Http/Controllers/UserController.php:300 -> storeAsync
            Http::fake([
                'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
                'engine.example.com/api/projects' => Http::response(['message' => 'boom'], 503),
            ]);
        }

        $this->runOnce($application);

        Queue::assertPushed(ReplaceClassicOnboardingProjectJob::class, fn (ReplaceClassicOnboardingProjectJob $job): bool => $job->hiccupAttempt === 1);
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function writeHiccups(): array
    {
        return [
            'connection' => ['connection'],
            '5xx' => ['5xx'],
        ];
    }

    public function test_it_fails_at_the_wall_clock_cap(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> destroy (still busy)
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['message' => 'busy'], 409),
        ]);

        $this->runOnce($application, startedAt: now()->getTimestamp() - ReplaceClassicOnboardingProjectJob::WALL_CLOCK_SECONDS - 1);

        Queue::assertNotPushed(ReplaceClassicOnboardingProjectJob::class);
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === 'The project could not be replaced in time.',
        );
    }

    /**
     * The replacement keeps the CA's
     * `applications.id` – one row before and after the swap – and clears the
     * marker it set to survive the Engine gap.
     */
    public function test_it_keeps_the_same_panel_row_and_clears_the_replacing_marker(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeReplace();

        $this->runOnce($application);

        $fresh = Application::query()->findOrFail($application->id);
        $this->assertSame(1, Application::query()->count(), 'the replacement must not orphan the CA row');
        $this->assertNull($fresh->replacing_at, 'the marker is cleared when the job ends');
        $this->assertNull($fresh->onboarding_at);
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 60
            && $job->sourceType === 'git');
    }

    public function test_it_keeps_the_token_and_source_on_the_replaced_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeReplace();

        Queue::fake();
        (new ReplaceClassicOnboardingProjectJob(
            $application->id,
            ['git_token' => 'ghp_secret'] + $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle(app(\PanelAlpha\ClientArea\Contracts\ApplicationProvisioner::class), app(\PanelAlpha\ClientArea\Contracts\AccessResolver::class));

        $fresh = Application::query()->findOrFail($application->id);
        $this->assertSame('ghp_secret', $fresh->gitToken());
        $this->assertSame('https://github.com/example/site.git', $fresh->git_source);
    }

    public function test_a_successful_replace_reopens_the_default_backup_schedule_decision(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['auto_backup_state' => 'scheduled', 'auto_backup_attempted_at' => now()])->save();

        $this->fakeReplace();

        $this->runOnce($application);

        $fresh = Application::query()->findOrFail($application->id);
        $this->assertNull($fresh->auto_backup_state, 'the replacement Engine project has no schedule');
        $this->assertNull($fresh->auto_backup_attempted_at);
    }

    /**
     * Review-fix: the job itself must write `replacing_at` before the
     * Engine swap; only the sync's keep clause was proven before, so removing
     * the job's write survived the suite. Here the delete answers busy (the
     * create task still runs), the job requeues and a sync in the delete→create
     * gap must keep the same CA row.
     */
    public function test_the_job_marks_the_row_replacing_before_the_swap_so_a_sync_keeps_it(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->replacingApplication($user, null);

        // Engine: core/app/Exceptions/ProjectBusyException.php:35 -> taskRunning (the domain-step create task still holds the project)
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (neither project is listed during the swap)
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response([
                'message' => "Project 'shop' is busy: deploy task 91 is running. Cancel it (POST /tasks/91/cancel) or wait for it to finish.",
            ], 409),
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
        ]);

        $this->runOnce($application);

        $this->assertNotNull($application->fresh()->replacing_at, 'the job marks the row before the Engine swap');

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(1, Application::query()->count(), 'the swap window keeps the CA row');
        $this->assertSame($application->id, Application::query()->sole()->id);
    }

    public function test_a_fresh_replacing_marker_is_kept_by_a_sync(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->replacingApplication($user, now());

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll; the replace job already deleted the only project with this username.
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $kept = Application::query()->sole();
        $this->assertSame($application->id, $kept->id);
        $this->assertTrue(ClassicOnboardingState::isReplacing($kept));
    }

    public function test_a_stale_replacing_marker_is_dropped_by_a_sync(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->replacingApplication($user, now()->subSeconds(ReplaceClassicOnboardingProjectJob::STALE_AFTER_SECONDS + 1));

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(0, Application::query()->count(), 'a lost job\'s marker is ignored');
    }

    /**
     * A row as the plain domain step left it, without the `syncedApplication`
     * fake (an earlier `/projects/all` stub would win over the empty list a
     * swap test needs).
     */
    private function replacingApplication(User $user, ?\Illuminate\Support\Carbon $replacingAt): Application
    {
        $application = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'shop',
            'domain' => 'shop.example.com',
            'status' => 'pending',
            'type' => Application::TYPE_CUSTOM,
            'onboarding_at' => now(),
        ]);
        $application->forceFill(['replacing_at' => $replacingAt])->save();

        return $application;
    }

    /**
     * The Engine answers the DELETE then the create with the **same** username;
     * the panel row is reused, so no second row is imported.
     */
    private function fakeReplace(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the classic project is still there)
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 60,
                'username' => 'shop',
                'details' => ['username' => 'shop', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);
    }

    private function runOnce(Application $application, int $startedAt = 0, int $hiccupAttempt = 0): void
    {
        Queue::fake();
        (new ReplaceClassicOnboardingProjectJob(
            $application->id,
            $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: $startedAt > 0 ? $startedAt : now()->getTimestamp(),
            hiccupAttempt: $hiccupAttempt,
        ))->handle(app(ApplicationProvisioner::class), app(AccessResolver::class));
    }
}
