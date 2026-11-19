<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\ClientArea\Projects\ProjectSourceReport;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\TestCase;

/**
 * The General page's Source card, the redeploy/upload modals and the status
 * alert read one answer built from the Engine's project inspect and deploy
 * history, instead of the hardcoded `source` of the project payload.
 *
 * Contract:
 * - CA calls: `GET /instances/{id}/source` (`Instances.projectSource`), rewritten
 *   to `/projects`; CA reads `response.data.data`.
 * - Engine: `GET /projects/{u}/inspect`
 *   (`core/app/Http/Controllers/SourceInspectionController.php:190` -> project,
 *   `Lib/Deploy/Inspect/Report/ApplicationReport.php:72-110`,
 *   `Lib/Deploy/Inspect/DeploymentSnapshot.php:27-82`) and `GET /projects/{u}/deploys`
 *   (`DeployHistoryController.php:39-42`).
 */
final class ProjectSourceTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const INSPECT = 'engine.example.com/api/projects/site1/inspect*';

    private const DEPLOYS = 'engine.example.com/api/projects/site1/deploys';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private static function laravelInspect(array $overrides = []): array
    {
        return array_replace_recursive([
            'application' => [
                'label' => 'Laravel',
                'runtime' => 'php 8.3',
                'platform' => 'laravel',
                'database' => 'mysql',
                'deployable' => true,
                'issue' => null,
                'commands' => [
                    'install' => 'composer install --no-dev --no-interaction && { composer run-script post-autoload-dump; } || true',
                    'build' => '{ npm run build; } || true && true',
                    'start' => null,
                ],
                'stages' => [
                    'build' => [],
                    'upgrade' => [
                        ['id' => 'migrate', 'run' => 'php artisan migrate --force --no-interaction', 'optional' => false],
                    ],
                ],
            ],
            'services' => [],
            'metadata' => ['framework' => 'Laravel'],
            'deployment' => ['status' => 'success', 'warnings' => [], 'branch' => 'main', 'commit' => 'abc1234def'],
            'drift' => [],
        ], $overrides);
    }

    private function container(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
    }

    private function source(User $user, int $id): TestResponse
    {
        // CA: src/apis/Instances.js:38-52 (`Api.get(`/instances/${id}/source`)`, reads `response.data.data`)
        return $this->actingAs($user)->getJson('/api/projects/'.$id.'/source');
    }

    public function test_a_laravel_project_gets_every_field(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        // Engine: DeployHistory.php:91-101 -> entry
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect([
                'application' => ['deployable' => false, 'issue' => 'No start command.'],
                'deployment' => ['warnings' => ['Mail host unreachable', 'Cache not warmed']],
                'drift' => [
                    ['field' => 'runtime', 'deployed' => 'php 8.2', 'detected' => 'php 8.3'],
                    ['field' => 'commit', 'deployed' => 'a', 'detected' => 'b'],
                    ['field' => 'port', 'deployed' => 8000, 'detected' => 8080],
                ],
            ])]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        // CA reads: src/components/modal/GitRedeployModal.vue:402-405 (`source.available`, `source.deploy_steps`)
        // CA reads: src/components/instances/InstanceStatusTabAlert.vue:152-156 (`source.warnings`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.stack', ['label' => 'Laravel', 'runtime' => 'php 8.3'])
            ->assertJsonPath('data.database', ['present' => true, 'label' => 'MySQL'])
            ->assertJsonPath('data.last_deploy.status', 'finished')
            ->assertJsonPath('data.last_deploy.commit', 'abc1234def')
            ->assertJsonPath('data.last_deploy.branch', 'main')
            ->assertJsonPath('data.last_deploy.finished_at', '2026-10-14T10:16:40.000000Z')
            ->assertJsonPath('data.deploy_steps.dependencies', ['commands' => ['composer install --no-dev --no-interaction', 'composer run-script post-autoload-dump'], 'skippable' => false])
            ->assertJsonPath('data.deploy_steps.build', ['commands' => ['npm run build'], 'skippable' => false])
            ->assertJsonPath('data.deploy_steps.migrations', ['commands' => ['php artisan migrate --force --no-interaction'], 'skippable' => false])
            ->assertJsonPath('data.warnings', [
                ['code' => 'deploy.not_deployable', 'severity' => 'error', 'title' => null, 'details' => ['No start command.']],
                ['code' => 'deploy.last_deploy_warnings', 'severity' => 'warning', 'title' => null, 'details' => ['Mail host unreachable', 'Cache not warmed']],
                ['code' => 'deploy.drift.runtime', 'severity' => 'warning', 'title' => null, 'details' => ['php 8.2 → php 8.3']],
                ['code' => 'deploy.drift.port', 'severity' => 'warning', 'title' => null, 'details' => ['8000 → 8080']],
            ]);
    }

    public function test_the_engines_coded_deploy_warnings_reach_the_alert(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        // Engine: DeploymentSnapshot::describe -> `warnings` are stored findings
        // (`{code, message, ...facts}`), not the sentences an older Engine kept.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy(['status' => 'partial'])]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect([
                'deployment' => ['status' => 'partial', 'warnings' => [
                    ['code' => 'app_not_answering', 'message' => 'The application started but did not answer on any port it publishes.'],
                    ['code' => 'health_check_failed', 'message' => 'The application is restarting, not running.'],
                ]],
            ])]),
        ]);

        // CA reads: src/components/instances/InstanceStatusTabAlert.vue:152-156 (`source.warnings`, details on separate lines)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.warnings', [[
                'code' => 'deploy.last_deploy_warnings',
                'severity' => 'warning',
                'title' => null,
                'details' => [
                    'The application started but did not answer on any port it publishes.',
                    'The application is restarting, not running.',
                ],
            ]]);
    }

    public function test_the_card_facts_cache_does_not_shadow_the_source_report(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        // The Source card keeps its own facts per project; the report must not read them as its answer.
        Cache::put(ProjectSourceDetails::cacheKey($application), ['facts' => ['label' => 'Node.js'], 'refreshed_at' => now()->getTimestamp()], 60);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect()]),
        ]);

        $this->assertNotSame(ProjectSourceDetails::cacheKey($application), ProjectSourceReport::cacheKey($application->id));

        // CA reads: src/components/modal/GitRedeployModal.vue:402-405 (`source.available`, `source.deploy_steps`)
        // CA reads: src/components/deploy/DeploySteps.vue:65-69 (`steps[key].commands`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.deploy_steps.build.commands', ['npm run build']);
    }

    public function test_a_category_is_skippable_only_when_the_engine_announces_it(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // ASSUMED Engine contract (engine-handoff.md item 2): `application.skippable`
            // lists the Engine step names; panel `build` is the Engine's `assets`.
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect([
                'application' => ['skippable' => ['assets', 'upgrade']],
            ])]),
        ]);

        // CA reads: src/components/modal/GitRedeployModal.vue:402-405 (`source.available`, `source.deploy_steps`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.deploy_steps.dependencies.skippable', false)
            ->assertJsonPath('data.deploy_steps.build.skippable', true)
            ->assertJsonPath('data.deploy_steps.migrations.skippable', true);
    }

    public function test_a_node_project_has_no_migrations_and_a_datastore_service_names_the_database(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect([
                'application' => ['label' => 'Next.js', 'runtime' => 'node 22', 'database' => null, 'commands' => ['install' => 'npm ci', 'build' => 'npm run build'], 'stages' => ['upgrade' => null]],
                'services' => [['name' => 'db', 'role' => 'datastore', 'engine' => 'postgres']],
            ])]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        // CA reads: src/components/modal/GitRedeployModal.vue:402-405 (`source.available`, `source.deploy_steps`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.stack.label', 'Next.js')
            ->assertJsonPath('data.database', ['present' => true, 'label' => 'PostgreSQL'])
            ->assertJsonPath('data.deploy_steps.dependencies.commands', ['npm ci'])
            ->assertJsonPath('data.deploy_steps.build.commands', ['npm run build'])
            ->assertJsonPath('data.deploy_steps.migrations.commands', []);
    }

    public function test_no_database_found_is_present_false(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect(['application' => ['database' => null]])]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)->assertJsonPath('data.database', ['present' => false, 'label' => null]);
    }

    public function test_a_running_deploy_omits_inspect_warnings_and_names_the_previous_commit(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null])]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect(['application' => ['deployable' => false, 'issue' => 'x'], 'deployment' => ['warnings' => ['w']]])]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        // CA reads: src/components/instances/InstanceStatusTabAlert.vue:152-156 (`source.warnings`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.last_deploy.status', 'running')
            ->assertJsonPath('data.last_deploy.finished_at', null)
            ->assertJsonPath('data.last_deploy.commit', 'abc1234def')
            ->assertJsonPath('data.warnings', []);
    }

    public function test_the_create_deploy_waiting_for_a_files_projects_archive_is_marked(): void
    {
        // The Engine creates a DinD project in its request and leaves that
        // deploy `running` until the archive arrives: a files project the user
        // abandoned before uploading. The upload dialog may upload into it.
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::sequence()
                // Engine: core/app/Lib/Deploy/DeployLog/DeployLogger.php:64 (`WAITING_FOR_FILES`)
                ->push(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'template', 'task_id' => null])]])
                // Engine: core/app/Http/Controllers/UserController.php:931 -> deploy-archive (a task ran)
                ->push(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'redeploy', 'source' => 'archive'])]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect()]),
        ]);

        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.last_deploy.status', 'running')
            ->assertJsonPath('data.last_deploy.waiting_for_files', true);

        // A deploy a task ran is a deploy in flight, not a wait: the dialog stays locked.
        ProjectSourceReport::forget($application);
        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.last_deploy.status', 'running')
            ->assertJsonPath('data.last_deploy.waiting_for_files', false);
    }

    public function test_a_files_projects_create_deploy_waiting_for_files_is_marked_while_it_is_in_onboarding(): void
    {
        // The panel's own create runs as an Engine task and its deploy stays
        // `running` until the archive arrives: a files project left after its
        // first step. The upload dialog may upload into it.
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'template'])]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect()]),
        ]);
        $application->forceFill(['onboarding_files_at' => now()])->save();

        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.last_deploy.status', 'running')
            ->assertJsonPath('data.last_deploy.waiting_for_files', true);
    }

    public function test_no_deploys_means_no_last_deploy(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect()]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.last_deploy', null);
    }

    public function test_a_classic_project_is_unavailable_without_an_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertExactJson(['data' => ['available' => false]]);

        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/inspect') || str_contains($r->url(), '/deploys'));
    }

    /**
     * @return array<string, array{int}>
     */
    public static function silentInspectStatuses(): array
    {
        return ['forbidden' => [403], 'not found' => [404], 'no checkout yet or mid-deploy' => [422]];
    }

    #[DataProvider('silentInspectStatuses')]
    public function test_an_expected_inspect_refusal_degrades_silently_and_keeps_the_history(int $status): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['message' => 'nope'], $status),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        // CA reads: src/components/modal/GitRedeployModal.vue:402-405 (`source.available`, `source.deploy_steps`)
        // CA reads: src/components/instances/InstanceStatusTabAlert.vue:152-156 (`source.warnings`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.stack', null)
            ->assertJsonPath('data.database', null)
            ->assertJsonPath('data.last_deploy.status', 'finished')
            ->assertJsonPath('data.last_deploy.commit', null)
            ->assertJsonPath('data.deploy_steps.build.commands', [])
            ->assertJsonPath('data.warnings', []);

        Exceptions::assertNothingReported();
    }

    public function test_an_inspect_failure_other_than_403_404_422_is_reported_but_the_history_stays(): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['message' => 'boom'], 500),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.last_deploy.status', 'finished');

        Exceptions::assertReported(EngineRequestException::class);
    }

    public function test_both_halves_failing_is_unavailable(): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => fn () => throw new ConnectionException('down'),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['message' => 'forbidden'], 403),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertExactJson(['data' => ['available' => false]]);
    }

    public function test_the_answer_is_reused_and_forgotten_on_demand(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect()]),
        ]);
        $inspects = fn (): int => Http::recorded(fn (Request $r) => str_contains($r->url(), '/inspect'))->count();

        $this->source($user, $application->id)->assertOk();
        $this->source($user, $application->id)->assertOk();
        $this->assertSame(1, $inspects());

        ProjectSourceReport::forget($application);
        $this->source($user, $application->id)->assertOk();
        $this->assertSame(2, $inspects());
    }

    public function test_an_unavailable_answer_is_not_kept(): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::sequence()
                // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
                ->push(null, 500)
                // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
                ->push(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::sequence()
                // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
                ->push(['message' => 'forbidden'], 403)
                // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
                ->push(['data' => self::laravelInspect()]),
        ]);

        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertExactJson(['data' => ['available' => false]]);

        // The brief outage is over: the next read asks the Engine again.
        // CA reads: src/components/cards/GitSourceInfoCard.vue:237-240 (`data` of GET /source: `available`, `stack`, `database`, `last_deploy`)
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:154 (the same `data`)
        $this->source($user, $application->id)
            ->assertOk()
            ->assertJsonPath('data.available', true);
    }

    public function test_engine_paths_in_warnings_are_redacted(): void
    {
        $user = User::factory()->create();
        $application = $this->container($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39
            self::DEPLOYS => Http::response(['data' => [$this->engineDeploy()]]),
            // Engine: core/app/Http/Controllers/SourceInspectionController.php:190
            self::INSPECT => Http::response(['data' => self::laravelInspect([
                'application' => ['deployable' => false, 'issue' => 'No start command in /home/site1/project'],
                'deployment' => ['warnings' => ['Could not write /home/site1/project/.env']],
            ])]),
        ]);

        $details = $this->source($user, $application->id)->assertOk()->json('data.warnings.*.details.0');

        foreach ($details as $detail) {
            $this->assertStringNotContainsString('/home/site1', $detail);
        }
        $this->assertStringContainsString('[path]', implode(' ', $details));
    }

    public function test_splitting_the_engines_joined_commands(): void
    {
        $this->assertSame(
            ['composer install', 'composer run-script x && y', 'echo "a && b"'],
            ProjectSourceReport::splitCommands('composer install && { composer run-script x && y; } || true && true && echo "a && b"'),
        );
        $this->assertSame([], ProjectSourceReport::splitCommands(null));
        $this->assertSame([], ProjectSourceReport::splitCommands('  '));
    }
}
