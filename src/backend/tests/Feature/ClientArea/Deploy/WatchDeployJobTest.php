<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\DeployLogUpdated;
use PanelAlpha\ClientArea\Http\Controllers\Project\AppHealthController;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;
use PanelAlpha\ClientArea\Http\Presenters\GitPresenter;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Watching an Engine deploy. The watcher lives in the controller (`WatchDeployJob`,
 * client-area-legacy's `WatchDeployLogJob` before) without the `deploy_logs` row: the outcome is
 * the notification and the terminal broadcast, the history the Engine's.
 *
 * Contract:
 * - CA waits for `user.instance.redeploy_finished|failed` and streams
 *   `DeployLogUpdated` chunks (`packages/client-area/src/components/deploy/DeployLogsViewer.vue`).
 * - Engine task: `GET tasks/{id}` → `TaskResource`
 *   (`// Engine: core/routes/api.php:114 → TaskController::show`), `{data:{status,details}}`;
 *   `details.deploy_id` is set by `Jobs/RebuildProject.php::recordDeployId`,
 *   `details.error`/`details.problems[].message` on failure.
 * - Engine deploy log: `GET projects/{u}/deploy-log?offset=` →
 *   `Lib/Deploy/DeployLog/DeployStatus.php:66` (`id` string, `started_at` unix int),
 *   page `{id,status,stage,stages,lines,next_offset,more,error}`.
 */
class WatchDeployJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user, array $overrides = []): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', $overrides + ['details' => ['template' => 'dind']]),
        ]])]);
        // A task that ends without naming a deploy has its log tail read
        // (`WatchDeployLogTaskTailTest` covers it). Registered first, so
        // the tests' `tasks/7*` task fakes do not answer the log read.
        // Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs (an empty page)
        Http::fake(['engine.example.com/api/tasks/7/logs*' => Http::response(['data' => [], 'meta' => ['next_after_id' => 0, 'task_status' => 'failed']])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    /**
     * The Engine deploy list names $commit as the newest successful deploy.
     */
    private function fakeDeployed(string $commit, string $branch = 'main'): void
    {
        // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118 -> entry (newest first)
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['commit' => $commit, 'branch' => $branch])]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        // The outcome is observable on the broadcast (no panel row); every
        // other event dispatches for real.
        Event::fake([DeployLogUpdated::class]);
    }

    /**
     * The deploy ended with this CA status: the watcher's last broadcast is the
     * status without lines (`WatchDeployJob::finish`).
     */
    private function assertEndedAs(string $status): void
    {
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e): bool => $e->status === $status
            && $e->lines === []
            && $e->nextOffset === null);
    }

    /**
     * The deploy has not ended: no end-of-deploy broadcast.
     */
    private function assertStillRunning(): void
    {
        Event::assertNotDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e): bool => $e->nextOffset === null);
    }

    /**
     * Run one poll of the watcher of the deploy task 7 (`$watch['task']`), or of
     * a deploy whose id it already resolved (`$watch['deploy']`).
     *
     * @param  array{task?: int|null, deploy?: string}  $watch
     */
    private function runOnce(Application $application, array $watch = [], int $startedAt = 0, ?string $archivePath = null): void
    {
        Queue::fake();
        (new WatchDeployJob(
            $application->id,
            array_key_exists('task', $watch) ? $watch['task'] : 7,
            'user.instance.redeploy_finished',
            'user.instance.redeploy_failed',
            startedAt: $startedAt > 0 ? $startedAt : now()->getTimestamp(),
            archivePath: $archivePath,
            deployId: $watch['deploy'] ?? null,
        ))->handle(app(ApplicationSynchronizer::class));
    }

    public function test_deploy_id_is_resolved_from_the_task_then_the_log_is_followed(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Event::fake([DeployLogUpdated::class]);
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => [
                'id' => 7, 'status' => 'running', 'details' => ['deploy_id' => 'd-1'],
            ]]),
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-1', 'status' => 'running', 'stage' => 'build', 'stages' => [],
                'lines' => [['ts' => 1, 'level' => 'info', 'msg' => 'Building']],
                'next_offset' => 1, 'more' => false,
            ]]),
        ]);

        $this->runOnce($application, $watch);

        // The live chunk is broadcast and the next poll carries the deploy id.
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e) => $e->status === 'running'
            && ($e->lines[0]['msg'] ?? null) === 'Building');
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->deployId === 'd-1' && $job->offset === 1);
    }

    public function test_a_finished_deploy_records_the_engine_deployed_commit(): void
    {
        $user = User::factory()->create();
        // Engine: core/app/Http/Resources/UserResource.php:24 -> `details` is
        // sent verbatim and carries the deployed `git_commit` (written by
        // Jobs/RebuildProject.php:114 once the rebuild finishes).
        $commit = str_repeat('a', 40);
        $this->fakeDeployed($commit);
        $application = $this->application($user, ['details' => ['template' => 'dind']]);
        $watch = ['deploy' => 'd-9'];
        $this->assertNull($application->git_last_commit_hash);

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-9', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $commit, 'short_hash' => substr($commit, 0, 7), 'subject' => 'Fix the checkout', 'author' => 'Dev', 'date' => '2026-10-12T09:15:00+00:00'],
            ]]),
        ]);

        $this->runOnce($application, $watch);

        $this->assertEndedAs('finished');

        $fresh = $application->fresh();
        $this->assertSame($commit, $fresh->git_last_commit_hash);
        // The deploy task carries only the hash; the message/time come from the
        // Engine's git log.
        $this->assertSame('Fix the checkout', $fresh->git_last_commit_message);
        $this->assertSame('2026-10-12T09:15:00.000000Z', $fresh->git_last_commit_at?->toJSON());

        // The Git page exposes them without a live call (CA Git.vue:495,886).
        $presented = app(GitPresenter::class)->present($fresh, [
            'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false,
        ]);
        $this->assertSame('Fix the checkout', $presented['last_deployed_commit_message']);
        $this->assertSame('2026-10-12T09:15:00.000000Z', $presented['last_deployed_commit_at']);
    }

    public function test_a_finished_deploy_without_the_commit_in_the_git_log_clears_the_old_message(): void
    {
        $user = User::factory()->create();
        $commit = str_repeat('c', 40);
        $this->fakeDeployed($commit);
        $application = $this->application($user, ['details' => ['template' => 'dind']]);
        $application->forceFill([
            'git_last_commit_hash' => str_repeat('9', 40),
            'git_last_commit_message' => 'Old message',
            'git_last_commit_at' => now(),
        ])->save();
        $watch = ['deploy' => 'd-11'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> commits (page without the deployed commit)
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-11', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => []]),
        ]);

        $this->runOnce($application, $watch);

        $fresh = $application->fresh();
        $this->assertSame($commit, $fresh->git_last_commit_hash);
        // The log has no row for the commit: the old message and time must not
        // stay under the new hash.
        $this->assertNull($fresh->git_last_commit_message);
        $this->assertNull($fresh->git_last_commit_at);
    }

    public function test_a_webhook_redeploy_records_the_deploy_list_commit_not_the_stale_details_commit(): void
    {
        $user = User::factory()->create();
        $stale = str_repeat('a', 40);
        $pushed = str_repeat('b', 40);
        // The details commit is frozen at the last panel deploy; a webhook moved the checkout since.
        $application = $this->application($user, ['details' => ['template' => 'dind', 'git_commit' => $stale]]);
        // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118 -> newest first
        $this->fakeEngineDeploys('site1', [
            $this->engineDeploy(['id' => '20261014-111500-b2c3d4', 'commit' => $pushed, 'branch' => 'release']),
            $this->engineDeploy(['id' => '20261014-101500-a1b2c3', 'commit' => $stale]),
        ]);

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-14', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $pushed, 'short_hash' => substr($pushed, 0, 7), 'subject' => 'Pushed fix', 'author' => 'Dev', 'date' => '2026-10-14T11:10:00+02:00'],
            ]]),
        ]);

        $this->runOnce($application, ['deploy' => 'd-14']);

        $fresh = $application->fresh();
        $this->assertSame($pushed, $fresh->git_last_commit_hash);
        $this->assertSame('Pushed fix', $fresh->git_last_commit_message);
        $this->assertSame('2026-10-14T09:10:00.000000Z', $fresh->git_last_commit_at?->toJSON());
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/git/commits')
            && str_contains($request->url(), 'branch=release')
            && str_contains($request->url(), 'limit=50'));
    }

    public function test_without_a_usable_deploy_list_item_the_details_commit_is_the_fallback(): void
    {
        $user = User::factory()->create();
        $commit = str_repeat('c', 40);
        $application = $this->application($user, ['details' => ['template' => 'dind', 'git_commit' => $commit]]);
        // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118 -> the list names no deploy
        $this->fakeEngineDeploys('site1', []);

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> {hash, short_hash, subject, author, date}
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-15', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $commit, 'short_hash' => substr($commit, 0, 7), 'subject' => 'Fallback commit', 'author' => 'Dev', 'date' => '2026-10-14T12:00:00+00:00'],
            ]]),
        ]);

        $this->runOnce($application, ['deploy' => 'd-15']);

        $fresh = $application->fresh();
        $this->assertSame($commit, $fresh->git_last_commit_hash);
        $this->assertSame('Fallback commit', $fresh->git_last_commit_message);
    }

    public function test_a_finished_deploy_takes_the_matching_commit_not_the_newest(): void
    {
        $user = User::factory()->create();
        $deployed = str_repeat('d', 40);
        $newer = str_repeat('e', 40);
        $this->fakeDeployed($deployed);
        $application = $this->application($user, ['details' => ['template' => 'dind']]);
        $watch = ['deploy' => 'd-12'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> newest-first log; the
        // branch moved on, so the deployed commit is not the first row.
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-12', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $newer, 'short_hash' => substr($newer, 0, 7), 'subject' => 'A newer commit', 'author' => 'Dev', 'date' => '2026-10-12T10:00:00+00:00'],
                ['hash' => $deployed, 'short_hash' => substr($deployed, 0, 7), 'subject' => 'The deployed commit', 'author' => 'Dev', 'date' => '2026-10-12T09:00:00+00:00'],
            ]]),
        ]);

        $this->runOnce($application, $watch);

        $fresh = $application->fresh();
        $this->assertSame($deployed, $fresh->git_last_commit_hash);
        // The message/time belong to the deployed hash, not to the newest row.
        $this->assertSame('The deployed commit', $fresh->git_last_commit_message);
        $this->assertSame('2026-10-12T09:00:00.000000Z', $fresh->git_last_commit_at?->toJSON());
    }

    public function test_a_finished_deploy_stores_the_commit_time_in_utc(): void
    {
        $user = User::factory()->create();
        $commit = str_repeat('f', 40);
        $this->fakeDeployed($commit);
        $application = $this->application($user, ['details' => ['template' => 'dind']]);
        $watch = ['deploy' => 'd-13'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        // Engine: core/app/System/Project/Git/WorkTree.php:559 -> `date` carries the author's offset
        Http::fake([
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-13', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            'engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => [
                ['hash' => $commit, 'short_hash' => substr($commit, 0, 7), 'subject' => 'Add viewport meta tag (#73)', 'author' => 'Dev', 'date' => '2026-03-20T09:28:21-04:00'],
            ]]),
        ]);

        $this->runOnce($application, $watch);

        // A recorded live answer: 09:28:21-04:00 is
        // 13:28:21Z, not the wall clock labelled UTC.
        $this->assertSame('2026-03-20T13:28:21.000000Z', $application->fresh()->git_last_commit_at?->toJSON());
    }

    public function test_the_finished_deploy_forgets_the_cached_source_before_the_notification(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $sourceKey = ProjectSourceReport::cacheKey($application->id);
        $healthKey = AppHealthController::cacheKey($application->id);
        Cache::put($sourceKey, ['available' => true], 60);
        Cache::put($healthKey, ['available' => true], 60);

        // The notification makes the CA refetch the project: by then both
        // answers must be gone.
        $seenAtNotification = null;
        Event::listen(ClientAreaNotificationRequested::class, function () use ($sourceKey, $healthKey, &$seenAtNotification): void {
            $seenAtNotification = Cache::has($sourceKey) || Cache::has($healthKey);
        });

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-11', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null,
        ]])]);

        $this->runOnce($application, ['deploy' => 'd-11']);

        $this->assertEndedAs('finished');
        $this->assertFalse($seenAtNotification, 'The cached answers were still there when the notification was requested.');
        $this->assertFalse(Cache::has($sourceKey));
        $this->assertFalse(Cache::has($healthKey));
    }

    public function test_the_finished_deploy_replaces_the_cached_running_source_facts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $key = ProjectSourceDetails::cacheKey($application);
        Cache::put($key, [
            'facts' => [
                'label' => 'Node.js',
                'services' => [],
                'database' => ['present' => false, 'label' => null],
                'last_deploy' => ['status' => 'running', 'finished_at' => null, 'waiting_for_files' => false],
            ],
            'refreshed_at' => now()->getTimestamp(),
        ], ProjectSourceDetails::KEEP_SECONDS);

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-11', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null,
        ]])]);
        // Engine: core/app/Http/Controllers/User/ContainerController.php:47 -> index
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
            ['Service' => 'app', 'Name' => 'site1-app-1', 'Image' => 'nginx:alpine', 'State' => 'running'],
        ]])]);
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['id' => 'd-11', 'status' => 'success', 'source' => 'archive', 'finished_at' => now()->getTimestamp()])]);

        $this->runOnce($application, ['deploy' => 'd-11']);

        // The CA refetches the project on the notification: the Source card must
        // show the ended deploy, not the running one cached while it ran.
        /** @var array<string, mixed> $cached */
        $cached = Cache::get($key);
        $this->assertSame('finished', $cached['facts']['last_deploy']['status']);
    }

    public function test_a_watcher_that_gives_up_drops_the_cached_source_facts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $key = ProjectSourceDetails::cacheKey($application);
        Cache::put($key, ['facts' => ['label' => 'Node.js', 'services' => [], 'database' => ['present' => false, 'label' => null], 'last_deploy' => ['status' => 'running', 'finished_at' => null, 'waiting_for_files' => false]], 'refreshed_at' => now()->getTimestamp()], ProjectSourceDetails::KEEP_SECONDS);
        Notification::fake();

        (new WatchDeployJob(
            $application->id,
            7,
            'user.instance.redeploy_finished',
            'user.instance.redeploy_failed',
        ))->failed(new \RuntimeException('the worker timed out'));

        $this->assertFalse(Cache::has($key));
    }

    public function test_the_git_commits_list_fills_from_with_the_recorded_commit(): void
    {
        $user = User::factory()->create();
        $commit = str_repeat('b', 40);
        $this->fakeDeployed($commit);
        $application = $this->application($user, ['details' => ['template' => 'dind']]);
        $watch = ['deploy' => 'd-10'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-10', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null,
        ]])]);

        $this->runOnce($application, $watch);

        // CA reads: packages/client-area/src/components/modal/GitRedeployModal.vue:558
        // (`from` is the last deployed commit the redeploy modal diffs against).
        $payload = app(GitPresenter::class)->commits($application->fresh(), [['hash' => 'tip-1']]);
        $this->assertSame($commit, $payload['from']);
    }

    public function test_a_failed_task_before_deploy_id_finishes_with_the_engine_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['data' => [
            'id' => 7, 'status' => 'failed', 'details' => ['error' => 'image build failed'],
        ]])]);

        $this->runOnce($application, $watch);

        $this->assertEndedAs('failed');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && ($n->payload['message'] ?? null) === 'image build failed',
        );
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/deploy-log'));
    }

    public function test_a_cancelled_task_before_deploy_id_finishes_as_cancelled(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['data' => [
            'id' => 7, 'status' => 'cancelled', 'details' => ['error' => 'deploy cancelled'],
        ]])]);

        $this->runOnce($application, $watch);

        // Cancelled is its own terminal state, not a generic failure.
        $this->assertEndedAs('cancelled');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && ($n->payload['message'] ?? null) === 'deploy cancelled',
        );
    }

    /**
     * The Engine closes the deploy log before its post-deploy steps, and the
     * project answers 409 busy until the deploy task ends (Engine #1528, live
     * API suite 2026-11-04). The watcher holds the notification while the task
     * still runs, for at most SETTLE_WAIT_SECONDS after the log's end.
     */
    public function test_the_notification_waits_for_the_deploy_task_to_end(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
        $page = fn (int $finishedAt) => Http::response(['data' => [
            'id' => 'd-5', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null, 'started_at' => $finishedAt - 30, 'finished_at' => $finishedAt,
        ]]);

        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape);
        // core/app/Http/Controllers/TaskController.php:180 -> show (`status`).
        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
            'engine.example.com/api/projects/site1/deploy-log*' => $page(now()->getTimestamp() - 5),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (`status`)
            'engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'running']]),
        ]);
        $this->runOnce($application, ['deploy' => 'd-5']);

        Notification::assertNothingSent();
        $this->assertStillRunning();
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->deployId === 'd-5');
    }

    public function test_a_task_still_running_long_after_the_log_ended_no_longer_holds_the_notification(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-5', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [], 'next_offset' => 0,
                'more' => false, 'error' => null, 'started_at' => 1700000000,
                'finished_at' => now()->getTimestamp() - WatchDeployJob::SETTLE_WAIT_SECONDS - 1,
            ]]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (`status`)
            'engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'running']]),
        ]);
        $this->runOnce($application, ['deploy' => 'd-5']);

        $this->assertEndedAs('finished');
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_finished');
    }

    public function test_an_ended_deploy_task_lets_the_notification_through(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape)
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-5', 'status' => 'success', 'stage' => 'done', 'stages' => [], 'lines' => [], 'next_offset' => 0,
                'more' => false, 'error' => null, 'started_at' => 1700000000, 'finished_at' => now()->getTimestamp() - 5,
            ]]),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (`status`)
            'engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'completed']]),
        ]);
        $this->runOnce($application, ['deploy' => 'd-5']);

        $this->assertEndedAs('finished');
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_finished');
    }

    public function test_a_cancelled_deploy_log_after_deploy_id_finishes_as_cancelled(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The deploy id is already stored, so the job polls the deploy log page
        // rather than the task's deploy_id resolution.
        $watch = ['deploy' => 'd-5'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 (deploy-log page shape).
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-5',
            'status' => 'cancelled',
            'stage' => 'build',
            'stages' => [],
            'lines' => [],
            'next_offset' => 0,
            'more' => false,
            'error' => null,
            'started_at' => 1700000000,
            'finished_at' => 1700000010,
        ]])]);

        $this->runOnce($application, $watch);

        // Cancelled is its own terminal state in the deploy-log path too.
        $this->assertEndedAs('cancelled');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed',
        );
    }

    public function test_a_completed_task_without_a_deploy_id_finishes_from_the_task(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        // Engine TaskResource (core/app/Http/Resources/TaskResource.php):
        // status, details, logs, next_after_id; `deployment_status` is written by
        // Jobs/RebuildProject.php:156-162 (partial/success/failed).
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => [
                'id' => 7,
                'job_id' => 'job-7',
                'queue' => 'default',
                'job_type' => 'rebuild',
                'status' => 'completed',
                'details' => ['deployment_status' => 'partial'],
                'username' => 'site1',
                'pid' => 123,
                'logs' => [],
                'next_after_id' => 3,
            ]]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        $this->runOnce($application, $watch);

        // The task finished without a deploy log - finish from the task.
        $this->assertEndedAs('finished');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_finished' && $n->isError === false,
        );
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/deploy-log'));
    }

    public function test_a_completed_task_reports_a_failed_deployment_status(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        // Engine RebuildProject.php marks a finished rebuild `deployment_status`
        // failed with `details.error`; no deploy log was recorded.
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => [
                'id' => 7,
                'status' => 'completed',
                'details' => ['deployment_status' => 'failed', 'error' => 'composer failed'],
                'logs' => [],
                'next_after_id' => 0,
            ]]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        $this->runOnce($application, $watch);

        $this->assertEndedAs('failed');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && $n->isError === true
                && ($n->payload['message'] ?? null) === 'composer failed',
        );
    }

    public function test_the_previous_deploys_log_is_ignored(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-2'];

        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-1', 'status' => 'success', 'started_at' => 1700000000,
            'lines' => [], 'next_offset' => 0, 'more' => false,
        ]])]);

        $this->runOnce($application, $watch);

        $this->assertStillRunning();
        Queue::assertPushed(WatchDeployJob::class);
    }

    public function test_terminal_status_drains_more_over_redispatches_then_finishes(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-3'];

        Notification::fake();
        Event::fake([DeployLogUpdated::class]);
        // Page 1 (offset 0) has `more=true`; page 2 (offset 1) is the last.
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
            'engine.example.com/api/projects/site1/deploy-log*' => function ($request) {
                $more = ((int) ($request['offset'] ?? 0)) < 1;

                // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
                return Http::response(['data' => [
                    'id' => 'd-3', 'status' => 'success', 'lines' => [],
                    'next_offset' => 1, 'more' => $more,
                ]]);
            },
        ]);

        $this->runOnce($application, $watch);
        // Still running: the drain continues over a re-dispatch.
        $this->assertStillRunning();
        Queue::assertPushed(WatchDeployJob::class);
        // The drained chunk is broadcast with its base offset.
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e) => $e->baseOffset === 0
            && $e->nextOffset === 1
            && $e->status === 'success');

        // Second run (offset 1) gets the last page and finishes.
        (new WatchDeployJob(
            $application->id, 7, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
            offset: 1, deployId: 'd-3',
        ))->handle(app(ApplicationSynchronizer::class));

        $this->assertEndedAs('finished');
        // The last drained chunk is broadcast too.
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e) => $e->baseOffset === 1
            && $e->status === 'finished');
        Notification::assertSentTo($user, ApplicationNotification::class, fn ($n) => $n->broadcastType() === 'user.instance.redeploy_finished');
    }

    public function test_engine_5xx_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
        Http::fake(['engine.example.com/api/tasks/7*' => Http::response(['message' => 'boom'], 500)]);

        $this->runOnce($application, $watch);

        $this->assertStillRunning();
        // First hiccup: the poll backs off 3 s.
        Queue::assertPushed(WatchDeployJob::class, function (WatchDeployJob $job) {
            $seconds = $job->delay instanceof \DateTimeInterface
                ? $job->delay->getTimestamp() - now()->getTimestamp()
                : -1;

            return $job->hiccupAttempt === 1 && $seconds >= 2 && $seconds <= 4;
        });
    }

    public function test_engine_down_redispatches_with_backoff(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        $this->runOnce($application, $watch);

        // A transport failure is a hiccup, not a deploy failure: the row stays
        // running and the poll backs off.
        $this->assertStillRunning();
        Queue::assertPushed(WatchDeployJob::class, function (WatchDeployJob $job) {
            $seconds = $job->delay instanceof \DateTimeInterface
                ? $job->delay->getTimestamp() - now()->getTimestamp()
                : -1;

            return $job->hiccupAttempt === 1 && $seconds >= 2 && $seconds <= 4;
        });
        Notification::assertNothingSent();
    }

    public function test_the_wall_clock_cap_fails_the_deploy(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-cap'];

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-cap', 'status' => 'running', 'lines' => [], 'next_offset' => 0, 'more' => false,
        ]])]);

        $this->runOnce($application, $watch, now()->getTimestamp() - WatchDeployJob::WALL_CLOCK_SECONDS);

        $this->assertEndedAs('failed');
        Queue::assertNotPushed(WatchDeployJob::class);
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && ($n->payload['message'] ?? null) === 'The deploy did not finish in time.',
        );
    }

    public function test_a_terminal_page_error_notifies_failure_with_the_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-4'];

        Notification::fake();
        // Engine DeployLogController::show page shape (User/DeployLogController.php:83).
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-4',
            'status' => 'failed',
            'stage' => 'build',
            'stages' => [],
            'lines' => [],
            'next_offset' => 0,
            'more' => false,
            'error' => 'build exploded',
            'started_at' => 1700000000,
            'finished_at' => 1700000010,
        ]])]);

        $this->runOnce($application, $watch);

        $this->assertEndedAs('failed');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && ($n->payload['message'] ?? null) === 'build exploded',
        );
    }

    public function test_a_failed_archive_deploy_hides_engine_paths_from_the_notification(): void
    {
        // A recorded live answer: the Engine's raw unzip
        // output names its private archive stage, which must not reach the CA.
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-14'];

        Notification::fake();
        Log::spy();
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-14',
            'status' => 'failed',
            'stage' => 'deploy',
            'stages' => [],
            'lines' => [['ts' => 1, 'level' => 'error', 'msg' => 'unzip: cannot find zipfile directory']],
            'next_offset' => 1,
            'more' => false,
            'error' => '[/var/lib/panelalpha/archive-stage/8ba359c90a7eb019/archive.zip] End-of-central-directory signature not found. Either this file is not a zipfile, or it constitutes one disk of a multi-part archive.',
            'started_at' => 1700000000,
            'finished_at' => 1700000010,
        ]])]);

        $this->runOnce($application, $watch);

        // The notification carries the redacted text; the streamed body stays
        // as the Engine sent it, and the full error goes to the log.
        $expected = '['.EngineText::REDACTED_PATH.'] End-of-central-directory signature not found. Either this file is not a zipfile, or it constitutes one disk of a multi-part archive.';
        Event::assertDispatched(DeployLogUpdated::class, fn (DeployLogUpdated $e): bool => ($e->lines[0]['msg'] ?? null) === 'unzip: cannot find zipfile directory');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_failed'
                && ($n->payload['message'] ?? null) === $expected,
        );
        Log::shouldHaveReceived('warning')
            ->with('Engine text hidden from the Client Area.', \Mockery::on(
                fn (array $context): bool => str_contains((string) ($context['message'] ?? ''), '/var/lib/panelalpha/archive-stage/'),
            ))
            ->once();
    }

    public function test_a_finished_deploy_keeps_its_engine_warning_out_of_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-11'];

        Notification::fake();
        // The Engine sets `error` even on a `success` deploy (a warning, e.g. a
        // self-signed certificate); a live run recorded it on every sslip.io deploy.
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-11',
            'status' => 'success',
            'stage' => 'done',
            'stages' => [],
            'lines' => [],
            'next_offset' => 0,
            'more' => false,
            'error' => 'The site uses a self-signed certificate.',
        ]])]);

        $this->runOnce($application, $watch);

        // A warning, not a failure: the finished notification carries no
        // message. The history shows it as the item's `warning`
        // (DeployHistoryTest::test_the_history_lists_the_engine_deploys_in_the_ca_vocabulary).
        $this->assertEndedAs('finished');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.redeploy_finished'
                && $n->isError === false
                && ! array_key_exists('message', $n->payload),
        );
    }

    public function test_engine_403_is_terminal(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = ['deploy' => 'd-9'];

        Notification::fake();
        // A 403/404 reads the task first: a failed create's rollback deletes the
        // deploy log; a running task keeps the 403 terminal.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:59 -> DeployLogController::show
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['message' => 'only dind'], 403),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => ['id' => 7, 'status' => 'running', 'details' => ['deploy_id' => 'd-9']]]),
        ]);

        $this->runOnce($application, $watch);

        $this->assertEndedAs('failed');
        Notification::assertSentTo($user, ApplicationNotification::class, fn ($n) => $n->broadcastType() === 'user.instance.redeploy_failed');
    }

    public function test_the_failed_hook_always_notifies(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        (new WatchDeployJob(
            $application->id, 7, 'user.instance.redeploy_finished', 'user.instance.redeploy_failed',
        ))->failed();

                Notification::assertSentTo($user, ApplicationNotification::class, fn ($n) => $n->broadcastType() === 'user.instance.redeploy_failed');
    }

    public function test_the_installation_failed_hook_notifies_installation_failed(): void
    {
        // The onboarding deploy dispatches this job with the `installation_*`
        // types (`OnboardingDeployService::NOTIFY_FAILED`); the CA's install
        // spinner listens for `user.instance.installation_failed`
        // (OnboardingModalWrapper.vue:924-940), so the generic failed() hook must
        // carry the passed type, not the redeploy one.
        $user = User::factory()->create();
        $application = $this->application($user);
        Notification::fake();

        (new WatchDeployJob(
            $application->id, 7, 'user.instance.installation_finished', 'user.instance.installation_failed',
        ))->failed();

                Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed'
                && $n->isError === true,
        );
    }

    public function test_an_installation_deploy_failure_notifies_installation_failed(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $watch = [];

        Notification::fake();
        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => [
                'id' => 7, 'status' => 'failed', 'details' => ['error' => 'install failed'],
            ]]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        (new WatchDeployJob(
            $application->id, 7, 'user.instance.installation_finished', 'user.instance.installation_failed',
            startedAt: now()->getTimestamp(),
        ))->handle(app(ApplicationSynchronizer::class));

        $this->assertEndedAs('failed');
        Notification::assertSentTo(
            $user,
            ApplicationNotification::class,
            fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.installation_failed'
                && ($n->payload['message'] ?? null) === 'install failed',
        );
    }

    public function test_the_uploaded_archive_is_deleted_when_the_deploy_finishes(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $archive = 'project/.panelalpha-upload/site.zip';
        $watch = ['deploy' => 'd-9'];

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 -> deploy-log page shape
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-9', 'status' => 'success', 'stage' => 'build', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        $this->runOnce($application, $watch, archivePath: $archive);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/api/projects/site1/files/remove')
            && $request['path'] === $archive
            && ($request['recursive'] ?? false) === true);
        $this->assertEndedAs('finished');
    }

    public function test_the_uploaded_archive_is_deleted_when_the_deploy_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $archive = 'project/.panelalpha-upload/site.zip';
        $watch = [];

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/7*' => Http::response(['data' => [
                'id' => 7, 'status' => 'failed', 'details' => ['error' => 'deploy failed'],
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        $this->runOnce($application, $watch, archivePath: $archive);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/api/projects/site1/files/remove')
            && $request['path'] === $archive);
        $this->assertEndedAs('failed');
    }

    public function test_the_uploaded_archive_is_deleted_when_the_deploy_is_cancelled(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $archive = 'project/.panelalpha-upload/site.zip';
        $watch = ['deploy' => 'd-9'];

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 -> deploy-log page shape
            'engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
                'id' => 'd-9', 'status' => 'cancelled', 'stage' => 'build', 'stages' => [], 'lines' => [],
                'next_offset' => 0, 'more' => false, 'error' => null,
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]]),
        ]);

        $this->runOnce($application, $watch, archivePath: $archive);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/api/projects/site1/files/remove')
            && $request['path'] === $archive);
        $this->assertEndedAs('cancelled');
    }

    public function test_a_running_deploy_redispatches_carrying_the_archive_path(): void
    {
        // The archive only needs deleting when the deploy ends, so
        // every re-dispatch of the still-running watcher must carry the path –
        // otherwise the cleanup is lost after the first poll.
        $user = User::factory()->create();
        $application = $this->application($user);
        $archive = 'project/.panelalpha-upload/site.zip';
        $watch = ['deploy' => 'd-9'];

        // Engine: core/app/Http/Controllers/User/DeployLogController.php:71 -> deploy-log page shape
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => 'd-9', 'status' => 'running', 'stage' => 'build', 'stages' => [], 'lines' => [],
            'next_offset' => 0, 'more' => false, 'error' => null,
        ]])]);

        $this->runOnce($application, $watch, archivePath: $archive);

        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->archivePath === $archive);
    }
}
