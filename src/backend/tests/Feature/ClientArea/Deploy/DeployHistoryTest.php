<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\DeployHistoryController;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Projects\DeployHistoryService;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Support\EngineText;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The deploy history comes from the Engine (since Engine
 * `53c9a6ff4`), so a deploy Connect AI/MCP, `pae` or a deploy hook started shows
 * too, and one the Engine no longer keeps does not.
 *
 * Contract:
 * - CA calls: `GET /instances/{id}/deploy-logs` (`packages/client-area/src/apis/Instances.js:24`),
 *   `…/deploy-logs/{logId}` (`:29`), `…/deploy-logs/live?offset=` (`:34`),
 *   `…/deploy-logs/{logId}/download` (`:44`); axios rewrites `/instances` to
 *   `/projects`. Every answer is read as `response.data.data` (`:25,30,35`),
 *   the download as `response.data.data` + `response.data.filename` (`:46-50`).
 * - List item, CA reads: `id` (`views/instance/advanced/Logs.vue:114,387`,
 *   `components/deploy/DeployLogsTab.vue:16,53`, `DeployLogsViewer.vue:307`),
 *   `status` (`Logs.vue:126,518`, `deployLogUi.js:23-27`, `DeployLogsTab.vue:15`),
 *   `source_type` (`Logs.vue:144`, translated `deployLogs.source.git|files`),
 *   `started_at`/`finished_at`/`created_at` (`Logs.vue:146,517`).
 * - Show, CA reads: `status`, `stages[].name|started_at|finished_at`, `lines[].ts|stage|level|msg`,
 *   `error` (`DeployLogsViewer.vue:193-198,318-324`, `DeployStepsList.vue:57-74`,
 *   `DeployLogRows.vue:8-10`).
 * - Live, CA reads: `panel.id`, `engine.status|stage|stages|lines|next_offset|error`
 *   (`DeployLogsViewer.vue:267-282`).
 * - Engine: `GET /projects/{u}/deploys` (`Http/Controllers/User/DeployHistoryController.php:39-42`,
 *   items `Lib/Deploy/DeployLog/DeployHistory.php:84-102`); `GET /projects/{u}/deploys/{id}/log`
 *   (`DeployHistoryController.php:74-83`: the item plus `lines`, `next_offset`, `more`;
 *   404 "Deploy not found"); `GET /projects/{u}/deploy-log` (`DeployLogController.php:59-92`,
 *   the latest deploy with `stage`/`stages`).
 * - Old route: `packages/api/routes/api.php` deploy-logs, `general.view_logs`.
 */
final class DeployHistoryTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const ID = '20261014-101500-a1b2c3';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function application(User $user, array $details = ['template' => 'dind']): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => $details]);
    }

    /**
     * @param  list<array<string, mixed>>  $items
     */
    private function fakeDeploys(array $items): void
    {
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        Http::fake(['engine.example.com/api/projects/site1/deploys' => Http::response(['data' => $items])]);
    }

    /**
     * @return array<string, mixed>
     */
    private static function line(int $ts, ?string $stage, string $msg, string $level = 'info'): array
    {
        return ['ts' => $ts, 'stage' => $stage, 'level' => $level, 'msg' => $msg];
    }

    public function test_the_history_lists_the_engine_deploys_in_the_ca_vocabulary(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site.git']);

        $this->fakeDeploys([
            $this->engineDeploy(['id' => '20261014-120000-aaaaaa', 'status' => 'running', 'finished_at' => null, 'started_at' => 1791979200, 'trigger' => 'mcp', 'source' => 'git']),
            $this->engineDeploy(['id' => '20261014-110000-bbbbbb', 'status' => 'partial', 'error' => 'The site uses a self-signed certificate.', 'started_at' => 1791975600, 'trigger' => 'cli', 'source' => 'hook']),
            $this->engineDeploy(['id' => '20261014-100000-cccccc', 'status' => 'failed', 'error' => '[/var/lib/panelalpha/archive-stage/8ba359c90a7eb019/archive.zip] End-of-central-directory signature not found.', 'started_at' => 1791972000, 'source' => 'archive']),
            $this->engineDeploy(['id' => '20261014-090000-dddddd', 'status' => 'cancelled', 'started_at' => 1791968400, 'source' => 'rebuild']),
            $this->engineDeploy(['id' => '20261014-080000-eeeeee', 'status' => 'unknown', 'finished_at' => null, 'started_at' => 1791964800, 'source' => null, 'kind' => null]),
            $this->engineDeploy(['id' => '20261014-070000-ffffff', 'status' => 'success', 'started_at' => 1791961200, 'source' => 'template', 'kind' => 'install']),
        ]);

        $list = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
        // CA reads: packages/client-area/src/apis/Instances.js:25 (`response.data.data`, newest first – DeployLogsViewer.vue:307)
            ->assertJsonCount(6, 'data')
            ->assertJsonMissingPath('data.0.log')
            ->assertJsonMissingPath('data.0.lines');

        $items = $list->json('data');
        // The CA keys items by the Engine deploy id (Logs.vue:114,387), a string.
        $this->assertSame(['20261014-120000-aaaaaa', '20261014-110000-bbbbbb', '20261014-100000-cccccc', '20261014-090000-dddddd', '20261014-080000-eeeeee', '20261014-070000-ffffff'], array_column($items, 'id'));
        $this->assertSame(array_column($items, 'id'), array_column($items, 'engine_deploy_id'));
        // `success`/`partial` are a finished deploy, `unknown` a failed one
        // (the CA translates deployLogs.status.<status>, Logs.vue:518).
        $this->assertSame(['running', 'finished', 'failed', 'cancelled', 'failed', 'finished'], array_column($items, 'status'));
        // git and a push (`hook`) are git, an archive is files, a rebuild or a
        // template is the project's own kind (it has a repository here).
        $this->assertSame(['git', 'git', 'files', 'git', 'git', 'git'], array_column($items, 'source_type'));
        // A partial deploy's Engine error is a warning: the CA renders `error`
        // as a red box (DeployLogsViewer.vue:11,198,324).
        $this->assertNull($items[1]['error']);
        $this->assertSame('The site uses a self-signed certificate.', $items[1]['warning']);
        // An Engine-internal path never reaches the CA.
        $this->assertSame('['.EngineText::REDACTED_PATH.'] End-of-central-directory signature not found.', $items[2]['error']);
        $this->assertNull($items[2]['warning']);
        // CA reads: packages/client-area/src/views/instance/advanced/Logs.vue:146,517 (ISO times, `started_at || created_at`)
        $this->assertSame('2026-10-14T11:00:00.000000Z', $items[1]['started_at']);
        $this->assertSame('2026-10-14T11:00:00.000000Z', $items[1]['created_at']);
        $this->assertSame('2026-10-14T10:16:40.000000Z', $items[1]['finished_at']);
        $this->assertNull($items[0]['finished_at']);
        $this->assertSame($application->id, $items[0]['application_id']);
        $this->assertSame([], $items[0]['stages']);
    }

    /**
     * A deploy the Engine finished with warnings (`status: partial`) keeps its
     * status (`partial` is a finished deploy) and carries the Engine's warnings
     * as the CA's `warning`; the CA renders `error` as a failed deploy.
     */
    public function test_a_partial_deploy_carries_the_engines_own_warnings(): void
    {
        $this->assertSame('finished', DeployState::caStatus('partial'));

        $user = User::factory()->create();
        $application = $this->application($user);
        $warnings = [
            [
                'code' => 'app_not_answering',
                'message' => 'The application started but did not answer on any port it publishes.',
                'hints' => [['type' => 'rest', 'action' => 'read_app_logs']],
            ],
            ['code' => 'health_check_failed', 'message' => 'The application is restarting, not running.'],
        ];
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
            'engine.example.com/api/projects/site1/deploys' => Http::response(['data' => [
                $this->engineDeploy(['id' => '20261014-110000-bbbbbb', 'status' => 'partial', 'warnings' => $warnings]),
                // Engine: core/app/Lib/Deploy/DeployLog/DeployHistory.php:131 (`warnings: []` on a success)
                $this->engineDeploy(['id' => '20261014-100000-cccccc', 'warnings' => [], 'started_at' => 1791972000]),
            ]]),
        ]);

        $items = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
            ->json('data');

        // A finished deploy, not a failed one: the CA renders `error` as the red box of a failure.
        $this->assertSame('finished', $items[0]['status']);
        $this->assertNull($items[0]['error']);
        // CA reads: the deploy log viewer's warning box (`use-deploy-logs.ts` `warning`), one warning per line.
        $this->assertSame("The application started but did not answer on any port it publishes.\nThe application is restarting, not running.", $items[0]['warning']);
        // A clean deploy stays clean.
        $this->assertSame('finished', $items[1]['status']);
        $this->assertNull($items[1]['warning']);

        // The same warning comes with the log the CA opens for that deploy.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log
            'engine.example.com/api/projects/site1/deploys/20261014-110000-bbbbbb/log*' => Http::response(['data' =>
                $this->engineDeploy(['id' => '20261014-110000-bbbbbb', 'status' => 'partial', 'warnings' => $warnings]) + [
                    'lines' => [self::line(1791973000, 'running', 'Deploy finished with warnings: app_not_answering', 'warning')],
                    'next_offset' => 1,
                    'more' => false,
                ]]),
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/20261014-110000-bbbbbb")
            ->assertOk()
        // CA reads: src/views/instance/advanced/Logs.vue:518 (`status`), src/components/deploy/DeployLogsViewer.vue:11 (`error` box, beside the warning one)
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.error', null)
            ->assertJsonPath('data.warning', "The application started but did not answer on any port it publishes.\nThe application is restarting, not running.");
    }

    public function test_a_files_project_names_its_sources_by_the_engine_source_first(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDeploys([
            $this->engineDeploy(['id' => '20261014-120000-aaaaaa', 'source' => 'rebuild']),
            $this->engineDeploy(['id' => '20261014-110000-bbbbbb', 'source' => 'hook']),
            $this->engineDeploy(['id' => '20261014-100000-cccccc', 'source' => 'git']),
            $this->engineDeploy(['id' => '20261014-090000-dddddd', 'source' => 'archive']),
        ]);

        $items = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
            ->json('data');

        // A rebuild of a project without a repository deploys files; a push or
        // a git deploy is git whatever the mirror says.
        // CA reads: packages/client-area/src/views/instance/advanced/Logs.vue:144 (`deployLogs.source.git|files`)
        $this->assertSame(['files', 'git', 'git', 'files'], array_column($items, 'source_type'));
    }

    public function test_a_deploy_the_engine_no_longer_keeps_is_not_shown(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The panel's own deploy rows are gone with their table (the
        // controller's idempotent drop migration), so nothing but the
        // Engine's kept deploys can show.
        $this->assertFalse(Schema::hasTable('deploy_logs'));
        $this->fakeDeploys([$this->engineDeploy()]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
        // CA reads: packages/client-area/src/apis/Instances.js:25 (the Engine is the source)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', self::ID);
    }

    public function test_an_empty_engine_history_is_an_empty_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDeploys([]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsTab.vue:5 ("No deploys recorded yet")
            ->assertExactJson(['data' => []]);
    }

    public function test_a_stored_task_tail_is_listed_beside_the_engine_deploys(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A failed create whose rollback deleted the deploy log.
        DeployTaskTail::record($application, 55, null, 'git', 'failed', 'Cloning the repository failed.', [
            ['ts' => 1791970000, 'stage' => null, 'level' => 'info', 'msg' => 'fatal: could not read Username'],
        ], now()->setTimestamp(1791970000));
        // A tail of a deploy the Engine still lists is not shown twice.
        DeployTaskTail::record($application, 56, self::ID, 'git', 'failed', 'Gone.', [], now()->setTimestamp(1791970500));

        $this->fakeDeploys([$this->engineDeploy(['started_at' => 1791972900])]);

        $items = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertOk()
            ->json('data');

        // CA reads: packages/client-area/src/views/instance/advanced/Logs.vue:114,518 (`id`, `status`), newest first
        $this->assertSame([self::ID, 'task-55'], array_column($items, 'id'));
        $this->assertSame('failed', $items[1]['status']);
        $this->assertSame('Cloning the repository failed.', $items[1]['error']);
        $this->assertSame('git', $items[1]['source_type']);
        $this->assertNull($items[1]['engine_deploy_id']);
    }

    public function test_a_project_keeps_its_newest_ten_task_tails(): void
    {
        $this->assertSame(10, DeployTaskTail::KEEP);

        $user = User::factory()->create();
        $application = $this->application($user);

        foreach (range(1, 10) as $taskId) {
            DeployTaskTail::record($application, $taskId, null, 'files', 'failed', null, [], null);
        }
        $this->assertSame(10, DeployTaskTail::query()->count());

        DeployTaskTail::record($application, 11, null, 'files', 'failed', null, [], null);

        $this->assertSame(range(2, 11), DeployTaskTail::query()->orderBy('engine_task_id')->pluck('engine_task_id')->all());
    }

    public function test_show_pages_the_whole_engine_log_and_rebuilds_its_stages(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $item = $this->engineDeploy(['status' => 'failed', 'error' => 'npm ERR! missing script: build', 'started_at' => 1791972900, 'finished_at' => 1791972960]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log (two pages: `more`, `next_offset`)
            'engine.example.com/api/projects/site1/deploys/'.self::ID.'/log*' => Http::sequence()
                // Engine: core/app/Lib/Deploy/DeployLog/DeployLogReader.php:56-78 -> page (the first page)
                ->push(['data' => $item + [
                    'lines' => [
                        self::line(1791972900, null, 'Deploy started (source: git, branch: main)'),
                        self::line(1791972901, 'preparing', 'Starting stage: preparing'),
                        self::line(1791972910, 'cloning', 'Starting stage: cloning'),
                    ],
                    'next_offset' => 3,
                    'more' => true,
                ]])
                // Engine: core/app/Lib/Deploy/DeployLog/DeployLogReader.php:56-78 -> page (the last page)
                ->push(['data' => $item + [
                    'lines' => [
                        self::line(1791972930, 'running', 'Starting stage: running'),
                        self::line(1791972960, 'running', 'Deploy failed: npm ERR! missing script: build', 'error'),
                    ],
                    'next_offset' => 5,
                    'more' => false,
                ]]),
        ]);

        $show = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID)
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:318-324 (`status`, `stages`, `lines`, `error`)
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.error', 'npm ERR! missing script: build')
            ->assertJsonPath('data.id', self::ID)
            ->assertJsonPath('data.lines.0.msg', 'Deploy started (source: git, branch: main)')
            ->assertJsonPath('data.lines.4.level', 'error');

        $this->assertCount(5, $show->json('data.lines'));
        // CA reads: packages/client-area/src/components/deploy/DeployStepsList.vue:57-74 (`name`, unix `started_at`/`finished_at`)
        $this->assertSame([
            ['name' => 'preparing', 'started_at' => 1791972901, 'finished_at' => 1791972910],
            ['name' => 'cloning', 'started_at' => 1791972910, 'finished_at' => 1791972930],
            ['name' => 'running', 'started_at' => 1791972930, 'finished_at' => null],
        ], $show->json('data.stages'));

        Http::assertSent(static fn (Request $request): bool => str_contains($request->url(), '/deploys/'.self::ID.'/log')
            && ($request->data()['offset'] ?? null) === 3);
    }

    /**
     * @return array<string, array{0: string, 1: int|null}>
     */
    public static function endsThatLeaveTheLastStageOpen(): array
    {
        return [
            'a failed deploy' => ['failed', null],
            'a cancelled deploy' => ['cancelled', null],
        ];
    }

    #[DataProvider('endsThatLeaveTheLastStageOpen')]
    public function test_show_leaves_the_last_stage_open_for_a_deploy_that_did_not_finish(string $engineStatus, ?int $finishedAt): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $item = $this->engineDeploy(['status' => $engineStatus, 'error' => 'The deploy was stopped.', 'finished_at' => 1791972960]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log (one page, `more` false)
            'engine.example.com/api/projects/site1/deploys/'.self::ID.'/log*' => Http::response(['data' => $item + [
                'lines' => [
                    self::line(1791972901, 'preparing', 'Starting stage: preparing'),
                    self::line(1791972910, 'cloning', 'Starting stage: cloning'),
                    self::line(1791972930, 'running', 'Starting stage: running'),
                ],
                'next_offset' => 3,
                'more' => false,
            ]]),
        ]);

        $show = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID)
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployStepsList.vue:57-74 (`name`, unix `started_at`/`finished_at`)
            ->assertJsonPath('data.status', DeployState::caStatus($engineStatus));

        $this->assertSame([
            ['name' => 'preparing', 'started_at' => 1791972901, 'finished_at' => 1791972910],
            ['name' => 'cloning', 'started_at' => 1791972910, 'finished_at' => 1791972930],
            ['name' => 'running', 'started_at' => 1791972930, 'finished_at' => $finishedAt],
        ], $show->json('data.stages'));
    }

    public function test_show_closes_the_last_stage_of_a_deploy_that_finished(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $item = $this->engineDeploy(['status' => 'success', 'finished_at' => 1791972960]);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log (one page, `more` false)
            'engine.example.com/api/projects/site1/deploys/'.self::ID.'/log*' => Http::response(['data' => $item + [
                'lines' => [
                    self::line(1791972901, 'preparing', 'Starting stage: preparing'),
                    self::line(1791972910, 'cloning', 'Starting stage: cloning'),
                    self::line(1791972930, 'running', 'Starting stage: running'),
                ],
                'next_offset' => 3,
                'more' => false,
            ]]),
        ]);

        $show = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID)
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployStepsList.vue:57-74 (`stages[].finished_at`)
            ->assertJsonPath('data.stages.2.name', 'running');

        $this->assertSame(1791972960, $show->json('data.stages.2.finished_at'));
    }

    public function test_show_stops_paging_after_the_page_cap(): void
    {
        $this->assertSame(50, DeployHistoryService::MAX_LOG_PAGES);

        $user = User::factory()->create();
        $application = $this->application($user);
        $calls = 0;
        Http::fake([
            'engine.example.com/api/projects/site1/deploys/'.self::ID.'/log*' => function (Request $request) use (&$calls) {
                $calls++;
                $offset = (int) ($request->data()['offset'] ?? 0);

                // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log (an endless log)
                return Http::response(['data' => $this->engineDeploy() + [
                    'lines' => [self::line(1791972900, null, "line {$offset}")],
                    'next_offset' => $offset + 1,
                    'more' => true,
                ]]);
            },
        ]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID)
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:323 (`lines`)
            ->assertJsonCount(50, 'data.lines');
        $this->assertSame(50, $calls);
    }

    public function test_a_deploy_the_engine_no_longer_keeps_is_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:76-77 -> log ("Deploy not found")
        Http::fake(['engine.example.com/api/projects/site1/deploys/*' => Http::response(['message' => 'Deploy not found'], 404)]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID)
            ->assertNotFound();
        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:44
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID.'/download')
            ->assertNotFound();
    }

    public function test_a_stored_task_tail_shows_and_downloads_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        DeployTaskTail::record($application, 55, null, 'git', 'cancelled', null, [
            ['ts' => 1791972900, 'stage' => null, 'level' => 'info', 'msg' => 'Cloning https://github.com/example/site.git'],
        ], now()->setTimestamp(1791972900));
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/task-55")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:318-324
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.lines.0.msg', 'Cloning https://github.com/example/site.git')
            ->assertJsonPath('data.stages', []);

        $download = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:44
            ->getJson("/api/projects/{$application->id}/deploy-logs/task-55/download")
            ->assertOk();
        // CA reads: packages/client-area/src/apis/Instances.js:46-50 (`data`, `filename`)
        $this->assertSame('['.date('Y-m-d H:i:s', 1791972900).'] [-] Cloning https://github.com/example/site.git', $download->json('data'));
        $this->assertSame('deploy-log-task-55.txt', $download->json('filename'));

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/task-56")
            ->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_download_builds_the_text_from_the_paged_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log
        Http::fake(['engine.example.com/api/projects/site1/deploys/'.self::ID.'/log*' => Http::response(['data' => $this->engineDeploy() + [
            'lines' => [
                self::line(1791972900, null, 'Deploy started (source: git, branch: main)'),
                self::line(0, 'running', 'Deploy finished successfully', 'ok'),
            ],
            'next_offset' => 2,
            'more' => false,
        ]])]);

        $download = $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:44
            ->getJson("/api/projects/{$application->id}/deploy-logs/".self::ID.'/download')
            ->assertOk();

        // CA reads: packages/client-area/src/apis/Instances.js:46-50 (`response.data.data` is the text, `filename`)
        $this->assertSame(
            '['.date('Y-m-d H:i:s', 1791972900).'] [-] Deploy started (source: git, branch: main)'."\n"
            .'[-------------------] [running] Deploy finished successfully',
            $download->json('data'),
        );
        $this->assertSame('deploy-log-'.self::ID.'.txt', $download->json('filename'));
    }

    public function test_the_live_view_reads_the_running_deploys_log_by_its_id(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A redeploy started with `pae` (trigger cli) is followed like any other.
        $this->fakeDeploys([$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'trigger' => 'cli', 'task_id' => null])]);
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59-92 -> show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => self::ID,
            'status' => 'running',
            'stage' => 'cloning',
            'stages' => [['name' => 'preparing', 'started_at' => 1791972901, 'finished_at' => 1791972910], ['name' => 'cloning', 'started_at' => 1791972910, 'finished_at' => null]],
            'lines' => [self::line(1791972911, 'cloning', 'Cloning repository (branch: main)')],
            'next_offset' => 4,
            'more' => false,
            'error' => '[/var/lib/panelalpha/archive-stage/8ba359c90a7eb019/archive.zip] bad',
            'started_at' => 1791972900,
            'finished_at' => null,
        ]])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:34
            ->getJson("/api/projects/{$application->id}/deploy-logs/live?offset=3")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:268 (`panel.id`, the download id once it ends)
            ->assertJsonPath('data.panel.id', self::ID)
            ->assertJsonPath('data.panel.status', 'running')
            ->assertJsonPath('data.panel.source_type', 'git')
            ->assertJsonPath('data.panel.started_at', '2026-10-14T10:15:00.000000Z')
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:272-282 (`status`, `stage`, `stages`, `lines`, `next_offset`, `error`)
            ->assertJsonPath('data.engine.status', 'running')
            ->assertJsonPath('data.engine.stage', 'cloning')
            ->assertJsonPath('data.engine.stages.1.name', 'cloning')
            ->assertJsonPath('data.engine.next_offset', 4)
            ->assertJsonPath('data.engine.lines.0.msg', 'Cloning repository (branch: main)')
            ->assertJsonPath('data.engine.error', '['.EngineText::REDACTED_PATH.'] bad');

        Http::assertSent(static fn (Request $request): bool => str_contains($request->url(), '/projects/site1/deploy-log')
            && ($request->data()['offset'] ?? null) === 3);
    }

    public function test_the_live_view_is_empty_while_nothing_runs(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The newest deploy ended before the CA started following one (e.g. the
        // failed install a retry is about to replace).
        $this->fakeDeploys([$this->engineDeploy(['status' => 'failed'])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:34
            ->getJson("/api/projects/{$application->id}/deploy-logs/live?offset=0")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:267-272 (both null: keep polling)
            ->assertExactJson(['data' => ['panel' => null, 'engine' => null]]);

        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), '/deploy-log'));
    }

    public function test_the_live_view_serves_the_end_of_the_deploy_the_ca_follows(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDeploys([$this->engineDeploy(['status' => 'success'])]);
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59-92 -> show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => self::ID, 'status' => 'success', 'stage' => 'running', 'stages' => [],
            'lines' => [self::line(1791973000, 'running', 'Deploy finished successfully', 'ok')],
            'next_offset' => 8, 'more' => false, 'error' => null,
        ]])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:34
            ->getJson("/api/projects/{$application->id}/deploy-logs/live?offset=7")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:285-288 (a terminal status ends the live view)
            ->assertJsonPath('data.panel.id', self::ID)
            ->assertJsonPath('data.panel.status', 'finished')
            ->assertJsonPath('data.engine.status', 'success');
    }

    public function test_the_live_view_hides_a_page_of_another_deploy(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeDeploys([$this->engineDeploy(['status' => 'running', 'finished_at' => null])]);
        // The Engine already serves a newer deploy's log than the one it listed:
        // its lines must not be mixed into the listed deploy.
        // Engine: core/app/Http/Controllers/User/DeployLogController.php:59-92 -> show
        Http::fake(['engine.example.com/api/projects/site1/deploy-log*' => Http::response(['data' => [
            'id' => '20261014-101600-ffffff', 'status' => 'running', 'stage' => null, 'stages' => [],
            'lines' => [self::line(1791972960, null, 'Other deploy')], 'next_offset' => 1, 'more' => false,
        ]])]);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:34
            ->getJson("/api/projects/{$application->id}/deploy-logs/live?offset=0")
            ->assertOk()
        // CA reads: packages/client-area/src/components/deploy/DeployLogsViewer.vue:267-272
            ->assertJsonPath('data.panel.id', self::ID)
            ->assertJsonPath('data.engine', null);
    }

    public function test_classic_projects_have_no_deploy_logs(): void
    {
        $user = User::factory()->create();
        // Not a dind template and no git repo: a classic project.
        $application = $this->application($user, ['template' => '']);

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:24
            ->getJson("/api/projects/{$application->id}/deploy-logs")
            ->assertStatus(422);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function refusedLogIds(): array
    {
        return [
            // The panel row number the routes used to take.
            'an old panel row id' => ['3'],
            'not an Engine id' => ['20261014-101500'],
            'a path' => ['..%2Flatest'],
            'a task tail without a number' => ['task-'],
        ];
    }

    #[DataProvider('refusedLogIds')]
    public function test_the_log_id_must_be_an_engine_deploy_id_or_a_task_tail(string $logId): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        $this->actingAs($user)
        // CA: packages/client-area/src/apis/Instances.js:29
            ->getJson("/api/projects/{$application->id}/deploy-logs/{$logId}")
            ->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_the_four_routes_keep_their_uris_privileges_and_middleware_in_the_controller(): void
    {
        $expected = [
            'client-area.projects.deploy_logs.index' => ['api/projects/{application}/deploy-logs', 'index'],
            'client-area.projects.deploy_logs.live' => ['api/projects/{application}/deploy-logs/live', 'live'],
            'client-area.projects.deploy_logs.show' => ['api/projects/{application}/deploy-logs/{logId}', 'show'],
            'client-area.projects.deploy_logs.download' => ['api/projects/{application}/deploy-logs/{logId}/download', 'download'],
        ];

        foreach ($expected as $name => [$uri, $method]) {
            $route = Route::getRoutes()->getByName($name);
            $this->assertNotNull($route, $name);
            $this->assertSame($uri, $route->uri());
            $this->assertSame(['GET', 'HEAD'], $route->methods());
            $this->assertSame(DeployHistoryController::class.'@'.$method, $route->getActionName());
            $this->assertSame(['api', 'auth', 'activity', 'privilege:general.view_logs'], $route->middleware());
        }
        $this->assertNull(Route::getRoutes()->getByName('client-area-legacy.projects.deploy_logs.index'));
    }
}
