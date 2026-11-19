<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Contract:
 *  - the onboarding domain step answers 202 while the Engine still builds the
 *    container, so `POST E/projects/{u}/source` answers a busy 409
 *    (`ProjectRebuild::whileIdle`, core/app/Lib/Project/ProjectRebuild.php:123 ->
 *    `DeployBusyException`);
 *  - AttachGitSourceJob retries that busy answer in the background, so the CA's
 *    `POST /projects/deploy` never reads it, and hands the accepted task to
 *    the controller's `WatchDeployJob` (the files-onboarding watcher, `installation_*`;
 *    the job carries its own state – no deploy row).
 *
 * The job is the second half of the `domain_id` git deploy: the route writes a
 * `deploy_logs` install row with no Engine task and dispatches this job.
 */
class AttachGitSourceJobTest extends TestCase
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
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
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

    public function test_it_waits_while_the_project_prepares_then_attaches_and_watches(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::sequence()
                // Engine: core/app/Exceptions/DeployBusyException.php:19 -> whileIdle's busy 409
                ->push(['message' => 'A deploy of this project is already queued or running: task 91.'], 409)
                // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource (202 + TaskResource)
                ->push(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        $this->runOnce($application);

        // Busy = not ready yet: nothing is failed, the job is requeued.
        Queue::assertPushed(AttachGitSourceJob::class, fn (AttachGitSourceJob $job): bool => $job->applicationId === $application->id
            && $job->source === $this->source()
            && $job->hiccupAttempt === 0
            && $job->startedAt > 0);
        Queue::assertNotPushed(WatchDeployJob::class);

        $this->runOnce($application);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 9
            && $job->sourceType === 'git'
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_it_keeps_the_token_and_source_on_the_application(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        Queue::fake();
        (new AttachGitSourceJob(
            $application->id,
            ['git_token' => 'ghp_secret'] + $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle();

        $application->refresh();
        $this->assertSame('ghp_secret', $application->gitToken());
        $this->assertSame('https://github.com/example/site.git', $application->git_source);
        $this->assertSame('github', $application->git_provider);
    }

    public function test_it_does_not_wipe_a_saved_token_when_the_attach_sends_none(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 9, 'status' => 'queued']], 202),
        ]);

        $this->runOnce($application);

        $this->assertSame('ghp_old', $application->refresh()->gitToken());
    }

    public function test_it_does_not_store_anything_when_the_attach_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
        // Engine: core/app/Http/Requests/ProjectSourceAttachRequest.php:33 -> git_branch rules
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['message' => 'No.'], 422),
        ]);

        Queue::fake();
        (new AttachGitSourceJob(
            $application->id,
            ['git_token' => 'ghp_secret'] + $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle();

        $application->refresh();
        $this->assertNull($application->gitToken());
        $this->assertNull($application->git_source);
    }

    public function test_it_fails_when_the_project_never_becomes_ready(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Exceptions/DeployBusyException.php:19 -> whileIdle's busy 409
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response(['message' => 'busy'], 409),
        ]);

        $this->runOnce($application, startedAt: now()->getTimestamp() - AttachGitSourceJob::WALL_CLOCK_SECONDS - 1);

        Queue::assertNotPushed(AttachGitSourceJob::class);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === 'The project did not become ready for its git source in time.',
        );
    }

    public function test_it_fails_on_a_project_not_eligible_conflict(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Lib/Project/SourceAttacher.php:91 -> assertEligible project_not_eligible
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => "Project 'site1' is classic shared hosting.",
                'problems' => [['field' => 'git_repo', 'code' => 'project_not_eligible', 'message' => "Project 'site1' is classic shared hosting."]],
            ], 409),
        ]);

        $this->runOnce($application);

        Queue::assertNotPushed(AttachGitSourceJob::class);
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed');
    }

    /**
     * The source is already attached, so another
     * deploy is already following it. This duplicate attach ends without a
     * watcher or a notification.
     */
    public function test_it_ends_the_duplicate_attach_when_the_source_is_already_attached(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Lib/Project/SourceAttacher.php:82 -> assertEligible source_already_attached
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => "Project 'site1' already deploys from git.",
                'problems' => [['field' => 'git_repo', 'code' => 'source_already_attached', 'message' => "Project 'site1' already deploys from git."]],
            ], 409),
        ]);

        $this->runOnce($application);

        Queue::assertNotPushed(AttachGitSourceJob::class);
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertNothingSent();
    }

    /**
     * A duplicate attach ends without storing, so the token it carries does
     * not replace the saved one.
     */
    public function test_it_keeps_the_saved_token_when_the_source_is_already_attached(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['git_token' => 'ghp_old'])->save();

        Queue::fake();
        Notification::fake();
        // Engine: core/app/Lib/Project/SourceAttacher.php:82 -> assertEligible source_already_attached
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => "Project 'site1' already deploys from git.",
                'problems' => [['field' => 'git_repo', 'code' => 'source_already_attached', 'message' => "Project 'site1' already deploys from git."]],
            ], 409),
        ]);

        (new AttachGitSourceJob(
            $application->id,
            ['git_token' => 'ghp_new'] + $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle();

        $this->assertSame('ghp_old', $application->refresh()->gitToken());
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_it_fails_with_the_engine_validation_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
        // Engine: core/app/Http/Requests/ProjectSourceAttachRequest.php:33 -> git_branch rules
        Http::fake([
            'engine.example.com/api/projects/site1/source' => Http::response([
                'message' => 'The given data was invalid.',
                'errors' => ['git_branch' => ['The branch is not valid.']],
                'problems' => [['field' => 'git_branch', 'code' => 'invalid_ref', 'message' => 'The branch is not valid.']],
            ], 422),
        ]);

        $this->runOnce($application);

        Queue::assertNotPushed(AttachGitSourceJob::class);
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === 'The branch is not valid.',
        );
    }

    #[DataProvider('writeHiccups')]
    public function test_it_retries_a_write_hiccup(string $failure): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        if ($failure === 'connection') {
            // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
            Http::fake(['engine.example.com/api/projects/site1/source' => Http::failedConnection()]);
        } else {
            // Engine: core/app/Http/Controllers/UserController.php:1045 -> attachSource
            Http::fake(['engine.example.com/api/projects/site1/source' => Http::response(['message' => 'boom'], 503)]);
        }

        $this->runOnce($application);

        Queue::assertPushed(AttachGitSourceJob::class, fn (AttachGitSourceJob $job): bool => $job->hiccupAttempt === 1);
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

    public function test_failed_notifies(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();

        (new AttachGitSourceJob(
            $application->id,
            $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
        ))->failed(new \RuntimeException('boom'));

        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed',
        );
    }

    private function runOnce(Application $application, int $startedAt = 0, int $hiccupAttempt = 0): void
    {
        Queue::fake();
        (new AttachGitSourceJob(
            $application->id,
            $this->source(),
            'user.instance.installation_finished',
            'user.instance.installation_failed',
            startedAt: $startedAt > 0 ? $startedAt : now()->getTimestamp(),
            hiccupAttempt: $hiccupAttempt,
        ))->handle();
    }
}
