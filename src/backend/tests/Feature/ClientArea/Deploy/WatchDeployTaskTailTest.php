<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\ClientArea\Events\DeployLogUpdated;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The onboarding live log (`WatchDeployJob` now,
 * client-area-legacy's `WatchDeployLogJob` before). A git onboarding without a domain
 * step creates the container project and deploys inside the create task; the
 * create task names its deploy in `details.deploy_id` like a rebuild (Engine
 * `6763cdc64`, `Jobs/DeployProject.php` `recordDeployId`), so the deploy
 * watcher follows it the same way – live `DeployLogUpdated` chunks, the stored
 * lines and the status. When the create fails (its rollback deletes the
 * project and the deploy log) or the task never names a deploy (an Engine
 * before `6763cdc64`), the end of the task's own log is kept as the task's
 * `DeployTaskTail` (the deploy history is the Engine's, which no longer has
 * that deploy), so the history shows why it failed. The watcher
 * never guesses a deploy from `deploy-log` alone.
 *
 * Contract:
 * - CA: `OnboardingModalWrapper.vue:612` posts `/projects/deploy {source_type:
 *   git, repo_url, branch, …}` and waits for `user.instance.installation_*`;
 *   the live log is `DeployLogUpdated` (`components/deploy/DeployLogsViewer.vue`),
 *   the stored lines the deploy history (`/projects/{id}/deploy-logs/{id}`).
 * - Engine: `POST /projects` → 202 TaskResource (`UserController.php:300`);
 *   `GET /tasks/{id}` → `TaskController::show` (`:180`, `job_type`
 *   `App\Jobs\DeployProject` – `Lib/Project/ProjectCreator.php:139`,
 *   `details.deploy_id`, `details.error` from `Task::markFailed`,
 *   `Models/Task.php:279-288`); `GET /projects/{u}/deploy-log` →
 *   `DeployLogController::show` (`:47-80`); `GET /tasks/{id}/logs` →
 *   `TaskController::logs` (`:222-232`, `TaskLogResource.php:14-26`,
 *   `TaskLogCollection.php:20-28`); a failed deploy's last 150 lines are copied
 *   onto the task (`Lib/Task/DeployLogTail.php:30-58`).
 */
final class WatchDeployTaskTailTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const DEPLOY_ID = '20261014-081500-a1b2c3';

    /**
     * The git onboarding create as the CA starts it; returns the project, its
     * install row and the watcher the tracker queued.
     *
     * @return array{Application, WatchDeployJob}
     */
    private function startGitOnboarding(User $user): array
    {
        $this->configureEngine();
        $this->fakeHostResolver(['github.com' => [TestNetwork::routable(35)]]);
        // The new `pending` row reads its install state from the Engine's
        // deploys: the create has not started its deploy yet.
        $this->fakeEngineDeploys('sitex');
        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake([
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 55,
                'username' => 'sitex',
                'job_type' => 'App\\Jobs\\DeployProject',
                'status' => 'queued',
                'details' => ['username' => 'sitex', 'domain' => 'sitex.panelalpha.online', 'action' => 'deploy'],
            ]], 202),
        ]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:612
        $this->actingAs($user)->postJson('/api/projects/deploy', [
            'service_id' => VirtualService::ID,
            'source_type' => 'git',
            'repo_url' => 'https://github.com/example/site.git',
            'branch' => 'main',
        ])->assertOk();

        $application = Application::query()->where('engine_username', 'sitex')->sole();
        $job = null;
        Queue::assertPushed(WatchDeployJob::class, function (WatchDeployJob $pushed) use (&$job): bool {
            $job = $pushed;

            return true;
        });
        $this->assertInstanceOf(WatchDeployJob::class, $job);
        $this->assertSame(55, $job->taskId);

        return [$application, $job];
    }

    /**
     * The created project as the finishing sync lists it. Where the Engine's
     * rollback removed the account, the sync drops the mirror row and its
     * deploy rows with it (an open question); these tests pin
     * what the row stores while it is listed.
     *
     * @return array<string, mixed>
     */
    private function sitex(): array
    {
        return $this->engineProject(55, 'sitex', ['domain' => 'sitex.panelalpha.online', 'details' => ['template' => 'dind']]);
    }

    /**
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>
     */
    private function createTask(string $status, array $details): array
    {
        return [
            'id' => 55,
            'job_type' => 'App\\Jobs\\DeployProject',
            'queue' => 'default',
            'status' => $status,
            'details' => $details,
            'username' => 'sitex',
            'queued_at' => '2026-10-14T08:14:58.000000Z',
            'started_at' => '2026-10-14T08:14:59.000000Z',
            'logs' => [],
            'next_after_id' => 0,
        ];
    }

    /**
     * One `TaskLogResource`: a deploy line keeps its level and stage.
     *
     * @return array<string, mixed>
     */
    private static function taskLine(int $id, string $msg, ?string $stage = 'build', ?string $level = 'info'): array
    {
        return ['id' => $id, 'log' => $msg, 'level' => $level, 'stage' => $stage, 'created_at' => '2026-10-14T08:16:00.000000Z'];
    }

    private function runWatcher(WatchDeployJob $job): void
    {
        Queue::fake();
        $job->handle(app(ApplicationSynchronizer::class));
    }

    /**
     * The messages of the task tail kept for the create task.
     *
     * @return list<string>
     */
    private static function tailMessages(Application $application): array
    {
        $tail = DeployTaskTail::query()->where('application_id', $application->id)->where('engine_task_id', 55)->first();

        return $tail === null ? [] : array_map(static fn (array $line): string => $line['msg'], $tail->parsedLines());
    }

    public function test_a_git_onboarding_create_is_followed_live_and_its_lines_are_stored(): void
    {
        $user = User::factory()->create();
        [$application, $job] = $this->startGitOnboarding($user);

        Event::fake([DeployLogUpdated::class]);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (the create task names its deploy, Jobs/DeployProject.php:134-142 at 6763cdc64)
            'engine.example.com/api/tasks/55' => Http::response(['data' => $this->createTask('running', ['deploy_id' => self::DEPLOY_ID])]),
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:63-79 -> show()
            'engine.example.com/api/projects/sitex/deploy-log*' => Http::response(['data' => [
                'id' => self::DEPLOY_ID, 'status' => 'running', 'stage' => 'build', 'stages' => [],
                'lines' => [
                    ['ts' => 1792052100, 'stage' => null, 'level' => 'info', 'msg' => 'Deploy started (source: git, repo: https://github.com/example/site.git)'],
                    ['ts' => 1792052101, 'stage' => 'build', 'level' => 'info', 'msg' => 'Building image'],
                ],
                'next_offset' => 2, 'more' => false, 'error' => null, 'started_at' => 1792052100, 'finished_at' => null,
                'timings' => null, 'problem' => null,
            ]]),
        ]);

        $this->runWatcher($job);

        // Followed like a redeploy: the deploy id from the task, the live
        // chunk broadcast, the next poll queued with the id (the lines are the
        // Engine's history).
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e): bool => $e->status === 'running'
            && array_column($e->lines, 'msg') === ['Deploy started (source: git, repo: https://github.com/example/site.git)', 'Building image']);
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $next): bool => $next->offset === 2 && $next->deployId === self::DEPLOY_ID);
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/tasks/55/logs'));
        // A deploy the Engine lists keeps no task tail.
        $this->assertSame(0, DeployTaskTail::query()->count());
    }

    public function test_a_failed_create_keeps_the_task_log_tail_after_the_lines_followed_live(): void
    {
        $user = User::factory()->create();
        [$application, $job] = $this->startGitOnboarding($user);
        // The watcher already followed the live lines of the deploy the task
        // named (offset 1).
        $job = new WatchDeployJob($application->id, 55, $job->finishedType, $job->failedType, startedAt: now()->getTimestamp(), offset: 1, deployId: self::DEPLOY_ID, sourceType: $job->sourceType);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:49 -> show() (the rollback deleted the project)
            'engine.example.com/api/projects/sitex/deploy-log*' => Http::response(['message' => 'Project not found'], 404),
            // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (teed lines, then the DeployLogTail copy)
            'engine.example.com/api/tasks/55/logs*' => Http::sequence()
                // Engine: core/app/Http/Resources/TaskLogCollection.php:20-28 -> {data, meta}
                ->push(['data' => [
                    self::taskLine(1, 'Building image'),
                    self::taskLine(2, 'npm ERR! missing script: build'),
                    self::taskLine(3, 'Last 2 lines of the deploy log (the rollback deletes it):', null),
                    self::taskLine(4, 'Building image'),
                    self::taskLine(5, 'npm ERR! missing script: build'),
                ], 'meta' => ['next_after_id' => 5, 'task_status' => 'failed']])
                // Engine: core/app/Http/Resources/TaskLogCollection.php:20-28 -> the last page is empty
                ->push(['data' => [], 'meta' => ['next_after_id' => 5, 'task_status' => 'failed']]),
            // Engine: core/app/Models/Task.php:279-288 -> markFailed() stores details.error
            'engine.example.com/api/tasks/55' => Http::response(['data' => $this->createTask('failed', [
                'deploy_id' => self::DEPLOY_ID,
                'error' => "The build failed. The last lines of the deploy log are in this task's log.",
            ])]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the account is kept; see the class note)
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->sitex()]]),
        ]);

        $this->runWatcher($job);

        // The rollback deleted the deploy log, so the Engine's history has
        // nothing left of it: the task's whole tail is kept for the task, with
        // the deploy it named and the failure.
        $this->assertSame([
            'Building image',
            'npm ERR! missing script: build',
            'Last 2 lines of the deploy log (the rollback deletes it):',
            'Building image',
            'npm ERR! missing script: build',
        ], self::tailMessages($application));
        $tail = DeployTaskTail::query()->sole();
        $this->assertSame(self::DEPLOY_ID, $tail->engine_deploy_id);
        $this->assertSame('failed', $tail->status);
        $this->assertSame("The build failed. The last lines of the deploy log are in this task's log.", $tail->error);
        $this->assertSame('git', $tail->source_type);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n): bool => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === "The build failed. The last lines of the deploy log are in this task's log.",
        );
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function endedWithoutADeploy(): array
    {
        return [
            'failed before the deploy log started' => ['failed', 'failed'],
            'cancelled' => ['cancelled', 'cancelled'],
            // An Engine before 6763cdc64 never names the create's deploy.
            'completed on an older Engine' => ['completed', 'finished'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('endedWithoutADeploy')]
    public function test_a_create_task_that_never_names_a_deploy_stores_its_log_tail_without_guessing(string $taskStatus, string $rowStatus): void
    {
        $user = User::factory()->create();
        [$application, $job] = $this->startGitOnboarding($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs
            'engine.example.com/api/tasks/55/logs*' => Http::sequence()
                // Engine: core/app/Http/Resources/TaskLogCollection.php:20-28 -> {data, meta}
                ->push(['data' => [
                    self::taskLine(1, 'Cloning https://github.com/example/site.git', null, null),
                    self::taskLine(2, 'fatal: could not read Username', null, null),
                ], 'meta' => ['next_after_id' => 2, 'task_status' => $taskStatus]])
                // Engine: core/app/Http/Resources/TaskLogCollection.php:20-28 -> the last page is empty
                ->push(['data' => [], 'meta' => ['next_after_id' => 2, 'task_status' => $taskStatus]]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (no details.deploy_id)
            'engine.example.com/api/tasks/55' => Http::response(['data' => $this->createTask($taskStatus, $taskStatus === 'failed'
                ? ['error' => 'Cloning the repository failed.']
                : [])]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->sitex()]]),
        ]);

        $this->runWatcher($job);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => $n->broadcastType() === ($rowStatus === 'finished' ? 'user.instance.installation_finished' : 'user.instance.installation_failed'));
        $this->assertSame(['Cloning https://github.com/example/site.git', 'fatal: could not read Username'], self::tailMessages($application));
        $tail = DeployTaskTail::query()->sole();
        $this->assertSame($rowStatus, $tail->status);
        // A plain task line has no level; it is stored as `info`.
        $this->assertStringContainsString('"level":"info"', (string) $tail->lines);
        // No deploy id is ever taken from `deploy-log` alone.
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/deploy-log'));
        $this->assertNull($tail->engine_deploy_id);
    }

    public function test_the_tail_keeps_the_last_150_lines_over_pages_and_stops_after_ten_pages(): void
    {
        $this->assertSame(150, WatchDeployJob::TASK_LOG_TAIL_LINES);
        $this->assertSame(10, WatchDeployJob::TASK_LOG_MAX_PAGES);

        $user = User::factory()->create();
        [$application, $job] = $this->startGitOnboarding($user);

        Notification::fake();
        $calls = 0;
        Http::fake([
            'engine.example.com/api/tasks/55/logs*' => function (Request $request) use (&$calls) {
                $calls++;
                $after = (int) ($request->data()['after_id'] ?? 0);
                $lines = [];
                for ($id = $after + 1; $id <= $after + 16; $id++) {
                    $lines[] = self::taskLine($id, "line {$id}");
                }

                // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (an endless log)
                return Http::response(['data' => $lines, 'meta' => ['next_after_id' => $after + 16, 'task_status' => 'failed']]);
            },
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/55' => Http::response(['data' => $this->createTask('failed', ['error' => 'The build failed.'])]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->sitex()]]),
        ]);

        $this->runWatcher($job);

        // Ten pages of 16 lines (1..160): the last 150 are 11..160.
        $this->assertSame(10, $calls);
        $messages = self::tailMessages($application);
        $this->assertCount(150, $messages);
        $this->assertSame('line 11', $messages[0]);
        $this->assertSame('line 160', $messages[149]);
    }

    public function test_a_failed_tail_read_still_finishes_the_deploy(): void
    {
        $user = User::factory()->create();
        [$application, $job] = $this->startGitOnboarding($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:222 -> TaskController::logs unreachable
            'engine.example.com/api/tasks/55/logs*' => fn () => throw new ConnectionException('down'),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/55' => Http::response(['data' => $this->createTask('failed', ['error' => 'Cloning the repository failed.'])]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->sitex()]]),
        ]);

        $this->runWatcher($job);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n): bool => $n->broadcastType() === 'user.instance.installation_failed'
            && ($n->payload['message'] ?? null) === 'Cloning the repository failed.');
        $this->assertSame(0, DeployTaskTail::query()->count());
    }
}
