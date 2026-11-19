<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The project payload the Client Area reads on
 * GET /projects/{id} and in every list item, from the last Engine payload.
 * @see packages/client-area/src/apis/Instances.js:180-260 (the instanceResource mapping)
 * @see packages/api/app/Http/Resources/InstanceResource.php (old shape)
 */
class ProjectPresenterTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_server_account_details_error_is_redacted(): void
    {
        // The project detail's `server_account_details.error`
        // must not leak the raw Engine home path either.
        $this->configureEngine();
        $user = User::factory()->create();
        $application = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'name' => 'Site 1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'engine_payload' => ['details' => [
                'error' => 'open /home/e2estatic21537/.incoming/docker-compose.yml: permission denied',
            ]],
        ]);

        // CA: src/apis/Instances.js:17
        $response = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: src/apis/Instances.js:200
        $response->assertJsonPath(
            'data.server_account_details.error',
            'open '.EngineText::REDACTED_PATH.': permission denied',
        );
    }

    public function test_presenter_maps_engine_details_and_labels(): void
    {
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1', [
                    'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10), TestNetwork::public(11)]]],
                    // Only keys the Engine really returns.
                    'domain_names' => ['site1.example.com'],
                    'details' => [
                        'git_repo' => 'https://github.com/acme/site1.git',
                        'git_branch' => 'main',
                        'async_status' => ['staging' => 'completed', 'push' => 'running'],
                    ],
                ]),
            ]]),
        ]);

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        // Screenshot time is panel-owned, not read from the Engine.
        $application->forceFill(['screenshot_time' => 1234567890])->save();
        $application->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);

        $item = $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson('/api/projects/'.$application->id)
            ->assertOk()
            ->json('data');

        $this->assertSame($application->id, $item['id']);
        $this->assertSame($application->id, $item['server_account_id']);
        $this->assertSame(VirtualService::ID, $item['service_id']);
        $this->assertSame(VirtualService::PLAN_NAME, $item['plans.name']);
        $this->assertSame('custom', $item['type']);
        $this->assertSame('custom', $item['app_type']);
        // The document root is a domain detail; a project has none.
        $this->assertNull($item['dir']);
        $this->assertSame(1234567890, $item['screenshot_time']);
        // The old InstanceResource exposed the parent id, null for a live project
        // (packages/api/app/Http/Resources/InstanceResource.php:141).
        $this->assertNull($item['staging']);
        $this->assertSame([TestNetwork::public(10), TestNetwork::public(11)], $item['host_ipv4_addresses']);
        $this->assertSame(TestNetwork::public(10), $item['host_ip_address']);
        $this->assertSame(['site1.example.com'], $item['host_c_names']);
        $this->assertSame([], $item['dns_nameservers']);
        // CA: src/components/topbar/InstanceTopBarTabs.vue:208-213 reads
        // `report_provider.status` unguarded; a null drops the project's tabs.
        $this->assertSame(['report_provider' => ['status' => 'not_applicable']], $item['health_checks']);
        $this->assertNull($item['version']);
        $this->assertSame([['title' => 'Prod', 'color' => '#ff0000']], $item['labels']);
        // Engine async statuses map to the CA vocabulary. The Engine writes
        // `push` on the target, so a live project with the flag is the target of
        // a push-to-live (pull_from_staging) and has no staging to push to.
        $this->assertNull($item['async_status']['push_to_live']);
        $this->assertNull($item['async_status']['push_to_staging']);
        $this->assertSame('in_progress', $item['async_status']['pull_from_staging']);
        $this->assertNull($item['async_status']['installation']);
        // Git source card.
        $this->assertSame('git', $item['source']['type']);
        $this->assertSame('https://github.com/acme/site1.git', $item['git_repository']['repo_url']);
        $this->assertSame('main', $item['git_repository']['branch']);
        $this->assertTrue($item['git_repository']['connected']);
        // Every key the CA reads without a null check must exist.
        foreach ([
            'type', 'source', 'name', 'domain', 'url', 'status', 'created_at', 'staging',
            'staging_apps', 'parent_app', 'shared_access', 'labels', 'ssl_order_status',
            'cdn_enabled', 'cdn_dns_records', 'domain_ssl_details', 'domain_zone', 'dir',
            'privileges', 'service_id', 'service_status', 'server_account_id', 'plans.name',
            'hosting_server_type', 'screenshot_time', 'stats', 'details', 'async_status',
            'install_details', 'git_repository', 'host_ipv4_addresses', 'host_c_names',
            'dns_nameservers', 'plugin_details', 'backup_details',
        ] as $key) {
            $this->assertArrayHasKey($key, $item);
        }

        // An unchecked certificate, not null: the CA only probes the domain's
        // certificate for an object, so a null kept every padlock red
        // (src/components/security/DnsSslIndicator.vue:402-420).
        $this->assertSame([
            'installed_ssl_cert' => null,
            'installed_ssl_cert_checked_time' => null,
            'detected_ssl_cert' => null,
            'detected_ssl_cert_checked_time' => null,
        ], $item['domain_ssl_details']);

        // Keys the old InstanceResource did not have are gone.
        $this->assertArrayNotHasKey('username', $item);
        $this->assertArrayNotHasKey('domain_names', $item);
    }

    /**
     * @return array<string, array{0: ?string, 1: ?string, 2: ?string, 3: string}>
     */
    public static function projectTypes(): array
    {
        // [stored type, panel WordPress install, Engine `app.type`, shown type]
        return [
            'detected WordPress' => ['wordpress', null, null, 'wordpress'],
            'detected custom' => ['custom', null, 'wordpress', 'custom'],
            'not checked, Engine says WordPress' => [null, null, 'wordpress', 'wordpress'],
            'not checked, Engine says another app' => [null, null, 'laravel', 'custom'],
            'not checked, nothing deployed' => [null, null, null, 'custom'],
            'panel install still running' => ['custom', WordPressInstall::IN_PROGRESS, null, 'wordpress'],
            'panel install failed' => ['custom', WordPressInstall::FAILED, null, 'wordpress'],
        ];
    }

    /**
     * app-lite#1: a project the panel was installing WordPress on read `custom`,
     * so a failed install showed the container "Deploy failed" card.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('projectTypes')]
    public function test_the_shown_type(?string $stored, ?string $install, ?string $engineType, string $expected): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['app' => ['type' => $engineType]]);
        $application->forceFill(['type' => $stored])->save();
        if ($install !== null) {
            WordPressInstall::query()->create(['application_id' => $application->id, 'status' => $install, 'params' => []]);
        }

        $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson('/api/projects/'.$application->id)
            ->assertOk()
        // CA reads: src/apis/Instances.js:118 (`app.app_type ?? app.type`)
            ->assertJsonPath('data.type', $expected)
            ->assertJsonPath('data.app_type', $expected)
        // CA: InstanceItemMenu.vue / InstanceTopBar.vue show "Admin Area" only
            ->assertJsonPath('data.supports_admin_sso', $expected === 'wordpress');
    }

    public function test_invented_engine_keys_are_ignored(): void
    {
        // No `disk` and no `bandwidth`: `stats` stays null, and nothing comes
        // from the invented `details.usage`.
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1', [
                    'config' => [],
                    'domain_names' => [],
                    'details' => [
                        // Keys the Engine does **not** return. A presenter that
                        // reads them would show invented data; they are here to
                        // fail such a read.
                        'usage' => ['visitors' => 10, 'bandwidth' => 20, 'disk_space' => 30],
                        'limits' => ['bandwidth' => 40, 'disk_space' => 50],
                        'temp_site' => ['url' => 'https://temp.example.com'],
                        'ip_address' => TestNetwork::PRIVATE_10,
                        'async_status' => [
                            'installation' => 'failed',
                            'update' => 'completed',
                            'staging' => 'completed',
                        ],
                    ],
                ]),
            ]]),
        ]);

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        $item = $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson('/api/projects/'.$application->id)
            ->assertOk()
            ->json('data');

        // All panel-owned placeholders, none read from the payload keys above.
        $this->assertNull($item['stats']);
        $this->assertNull($item['temp_url']);
        $this->assertNull($item['host_ip_address']);
        $this->assertNull($item['install_details']);
        $this->assertNull($item['async_status']['installation']);
        $this->assertNull($item['async_status']['update']);
    }

    public function test_a_staging_instance_carries_its_parent_and_staging_status(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
        ]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'in_progress']]],
        ]);

        $item = $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson('/api/projects/'.$staging->id)
            ->assertOk()
            ->json('data');

        // The CA builds the staging top bar from parent_app.
        $this->assertSame($parent->id, $item['parent_app']['id']);
        $this->assertNull($item['parent_app']['parent_app']);
        // `staging` is the parent's local id, as the old InstanceResource.
        $this->assertSame($parent->id, $item['staging']);
        // The Engine's `staging` status shows as the staging's installation.
        $this->assertSame('in_progress', $item['async_status']['installation']);
        // A staging is never the target of a push-to-live.
        $this->assertNull($item['async_status']['pull_from_staging']);
    }

    public function test_a_failed_staging_creation_shows_installation_failed(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
        ]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // The Engine already dropped the destination; the stale payload still
        // says it was running. The panel-owned marker must win.
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'running']]],
        ]);

        $item = $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson('/api/projects/'.$staging->id)
            ->assertOk()
            ->json('data');

        $this->assertSame('failed', $item['async_status']['installation']);
    }

    public function test_a_staging_still_being_copied_shows_installation_in_progress(): void
    {
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user);

        // Right after the create: the panel watches the copy, the Engine has
        // no staging status on the destination yet (app-lite#1).
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
            'engine_payload' => ['details' => []],
        ]);

        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/Instances.js:210,243 (`async_status.installation`, hasInstallInProgress: the staging's spinner)
        $this->actingAs($user)->getJson('/api/projects/'.$staging->id)
            ->assertOk()
            ->assertJsonPath('data.async_status.installation', 'in_progress');

        // Once the watcher is done (or gave up) and the Engine still says
        // nothing, nothing is running.
        $staging->forceFill(['staging_creating_at' => null])->save();
        // CA: src/apis/Instances.js:17
        // CA reads: src/apis/Instances.js:210
        $this->actingAs($user)->getJson('/api/projects/'.$staging->id)
            ->assertOk()
            ->assertJsonPath('data.async_status.installation', null);
    }

    /**
     * The installation state is the Engine's. The synced
     * `details.deployment_status` (`success|partial|failed`, Jobs/DeployProject.php:184-208,
     * System/Project/Deployment/FailureRetention.php:31-39) and `deployed_before`
     * decide without a call; only an install that has not succeeded reads the
     * newest deploy (`GET E:/projects/{u}/deploys`) to tell a running install or
     * retry apart.
     *
     * @return array<string, array{array<string, mixed>, bool, list<array<string, mixed>>|null, string|null}>
     */
    public static function installationStates(): array
    {
        $deploy = static fn (string $status): array => [[
            'id' => '20261014-101500-a1b2c3', 'status' => $status, 'error' => null, 'started_at' => 1791972900,
            'finished_at' => null, 'kind' => 'install', 'source' => 'git', 'branch' => 'main', 'commit' => null,
            'trigger' => 'api', 'action' => 'deploy', 'task_id' => 41,
        ]];
        // A create the Engine ran in its request: `running` with no task until
        // files arrive (Engine `DeployLogger::WAITING_FOR_FILES`).
        $waiting = [[
            'id' => '20261014-101500-a1b2c3', 'status' => 'running', 'error' => null, 'started_at' => 1791972900,
            'finished_at' => null, 'kind' => 'install', 'source' => 'template', 'branch' => null, 'commit' => null,
            'trigger' => 'cli', 'action' => 'deploy', 'task_id' => null,
        ]];

        return [
            'a successful deploy' => [['template' => 'dind', 'deployment_status' => 'success'], false, null, 'finished'],
            'a partial deploy' => [['template' => 'dind', 'deployment_status' => 'partial'], false, null, 'finished'],
            // A failed redeploy after a successful install never undoes it.
            'a failed redeploy after a successful one' => [['template' => 'dind', 'deployment_status' => 'failed', 'deployed_before' => true], false, null, 'finished'],
            'a failed install' => [['template' => 'dind', 'deployment_status' => 'failed'], false, $deploy('failed'), 'failed'],
            'a cancelled install' => [['template' => 'dind', 'deployment_status' => 'failed'], false, $deploy('cancelled'), 'failed'],
            'a retry of a failed install' => [['template' => 'dind', 'deployment_status' => 'failed'], false, $deploy('running'), 'in_progress'],
            'a new project installing' => [['template' => 'dind'], true, $deploy('running'), 'in_progress'],
            'a new project the mirror has not seen finish' => [['template' => 'dind'], true, $deploy('success'), 'finished'],
            'a new project whose install failed' => [['template' => 'dind'], true, $deploy('unknown'), 'failed'],
            'a new project with nothing deployed' => [['template' => 'dind'], true, [], null],
            'a project waiting for its files' => [['template' => 'dind'], true, $waiting, null],
            'an older project without an outcome' => [['template' => 'dind'], false, null, null],
            'a classic project' => [['deployment_status' => 'failed'], true, null, null],
        ];
    }

    /**
     * @param  array<string, mixed>  $details
     * @param  list<array<string, mixed>>|null  $deploys  null: no Engine read may happen
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('installationStates')]
    public function test_async_status_installation_comes_from_the_engine_deploys(array $details, bool $new, ?array $deploys, ?string $expected): void
    {
        if ($deploys !== null) {
            $this->fakeEngineDeploys('site1', $deploys);
        }
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', [
            'details' => $details,
            'created_at' => $new ? now()->subMinutes(5)->toJSON() : '2026-01-01T00:00:00.000000Z',
        ]);

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->json('data');
        // CA reads: src/apis/Instances.js:202,235-243 (`async_status.installation`, hasInstallInProgress/hasInstallFailed)
        $this->assertSame($expected, $item['async_status']['installation']);

        // The list item carries the same state.
        // CA: src/apis/Instances.js:76
        $list = $this->actingAs($user)->getJson('/api/projects')->json('data');
        // CA reads: src/apis/Instances.js:202
        $this->assertSame($expected, $list[0]['async_status']['installation']);

        if ($deploys === null) {
            Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), '/deploys'));
        }
    }

    public function test_an_adopted_project_waiting_for_files_shows_no_install_the_panel_can_cancel(): void
    {
        // A project created outside the panel (`pae project:create --template
        // dind`): its create ran in the request, so no task, and the Engine
        // leaves that deploy `running` for good. The panel did not start an
        // install on it, so none of its states may offer Cancel Installation –
        // the CA's only destructive way out of an install, which deletes the
        // project.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy([
            'status' => 'running', 'finished_at' => null, 'kind' => 'install',
            'source' => 'template', 'trigger' => 'cli', 'task_id' => null,
        ])]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', [
            'details' => ['template' => 'dind'],
            'created_at' => now()->subMinutes(5)->toJSON(),
        ]);

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->json('data');
        // CA reads: src/apis/Instances.js:202,235-243 (`hasInstallInProgress`
        // gates the Cancel Installation button; a project without one is `ready`)
        $this->assertNull($item['async_status']['installation']);
        $this->assertSame($application->id, $item['id']);
    }

    public function test_a_template_install_a_task_ran_is_still_an_install(): void
    {
        // The panel creates a project as a task (`POST /projects`, 202): its
        // create deploy carries that task, so it stays the panel's install.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy([
            'status' => 'running', 'finished_at' => null, 'kind' => 'install',
            'source' => 'template', 'task_id' => 41,
        ])]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', [
            'details' => ['template' => 'dind'],
            'created_at' => now()->subMinutes(5)->toJSON(),
        ]);

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->json('data');
        // CA reads: src/apis/Instances.js:202
        $this->assertSame('in_progress', $item['async_status']['installation']);
    }

    public function test_a_files_onboarding_project_has_no_installation_until_its_archive_deploys(): void
    {
        // The create's deploy waits for the files, `running` on the Engine
        // (`DeployLogger::WAITING_FOR_FILES`); the panel has not deployed yet.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'running', 'finished_at' => null, 'source' => 'template', 'kind' => 'install'])]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind'], 'created_at' => now()->subMinutes(5)->toJSON()]);
        $application->forceFill(['onboarding_files_at' => now()])->save();
        Http::fake();

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->json('data');

        // CA reads: src/apis/Instances.js:202 (no install spinner before the archive deploy)
        $this->assertNull($item['async_status']['installation']);
        Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), '/deploys'));
    }

    public function test_the_install_window_is_one_hour(): void
    {
        $this->assertSame(3600, DeployState::INSTALL_WINDOW_SECONDS);

        // The newest deploy runs: a project inside the window reads it.
        $this->fakeEngineDeploys('site1', [['id' => '20261014-101500-a1b2c3', 'status' => 'running', 'error' => null, 'started_at' => 1791972900, 'finished_at' => null, 'kind' => 'install', 'source' => 'git', 'branch' => 'main', 'commit' => null, 'trigger' => 'api', 'action' => 'deploy', 'task_id' => 41]]);
        $this->fakeEngineDeploys('site2', [['id' => '20261014-101500-a1b2c4', 'status' => 'running', 'error' => null, 'started_at' => 1791972900, 'finished_at' => null, 'kind' => 'install', 'source' => 'git', 'branch' => 'main', 'commit' => null, 'trigger' => 'api', 'action' => 'deploy', 'task_id' => 42]]);
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1', ['details' => ['template' => 'dind'], 'created_at' => now()->subSeconds(3590)->toJSON()]),
                $this->engineProject(11, 'site2', ['details' => ['template' => 'dind'], 'created_at' => now()->subSeconds(3610)->toJSON()]),
            ]]),
        ]);
        $user = User::factory()->create();

        // CA: src/apis/Instances.js:76
        $items = collect($this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data'))->keyBy('domain');

        // CA reads: src/apis/Instances.js:202
        $this->assertSame('in_progress', $items['site1.example.com']['async_status']['installation']);
        $this->assertNull($items['site2.example.com']['async_status']['installation']);
        Http::assertNotSent(static fn ($request): bool => str_ends_with($request->url(), '/projects/site2/deploys'));
    }

    public function test_a_failed_install_stays_failed_when_the_engine_cannot_be_read(): void
    {
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index (unreachable)
        Http::fake(['engine.example.com/api/projects/site1/deploys' => fn () => throw new \Illuminate\Http\Client\ConnectionException('down')]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind', 'deployment_status' => 'failed']]);

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        // Best effort: the synced outcome stands, the page never fails.
        // CA reads: src/apis/Instances.js:202
        $this->assertSame('failed', $item['async_status']['installation']);
    }

    public function test_a_staging_reads_the_running_push_to_live_from_its_parent(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // The Engine writes the push status on the target: the live parent.
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['async_status' => ['push' => 'running']]]),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);

        // A reload during the push keeps the staging's buttons disabled.
        // CA: src/apis/Instances.js:17
        $stagingItem = $this->actingAs($user)->getJson('/api/projects/'.$staging->id)->json('data');
        $this->assertSame('in_progress', $stagingItem['async_status']['push_to_live']);
        $this->assertNull($stagingItem['async_status']['pull_from_staging']);
        $this->assertNull($stagingItem['async_status']['push_to_staging']);

        // The list nests the same staging under its parent.
        // CA: src/apis/Instances.js:76
        $list = $this->actingAs($user)->getJson('/api/projects')->json('data');
        $this->assertSame('in_progress', $list[0]['staging_apps'][0]['async_status']['push_to_live']);

        // The live target reads its own status as pull_from_staging.
        // CA: src/apis/Instances.js:17
        $parentItem = $this->actingAs($user)->getJson('/api/projects/'.$parent->id)->json('data');
        $this->assertSame('in_progress', $parentItem['async_status']['pull_from_staging']);
        $this->assertNull($parentItem['async_status']['push_to_live']);
    }

    public function test_a_live_reads_the_running_push_to_staging_from_its_staging(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // The Engine wrote the status on the target: the staging.
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['async_status' => ['push' => 'running']]],
        ]);

        // A reload of the live source keeps its push-to-staging disabled.
        // CA: src/apis/Instances.js:17
        $parentItem = $this->actingAs($user)->getJson('/api/projects/'.$parent->id)->json('data');
        $this->assertSame('in_progress', $parentItem['async_status']['push_to_staging']);
        $this->assertNull($parentItem['async_status']['pull_from_staging']);
        $this->assertNull($parentItem['async_status']['push_to_live']);

        // The staging target's own status is not a push-to-live.
        $staging = Application::query()->where('engine_username', 'site1-staging')->firstOrFail();
        // CA: src/apis/Instances.js:17
        $stagingItem = $this->actingAs($user)->getJson('/api/projects/'.$staging->id)->json('data');
        $this->assertNull($stagingItem['async_status']['push_to_live']);
        $this->assertNull($stagingItem['async_status']['push_to_staging']);
    }

    public function test_the_project_list_query_count_does_not_grow_with_the_number_of_rows(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $this->stagingRow($parent, 'site1-staging');

        // Warm the sync TTL so the measured requests do not sync the mirror.
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: src/apis/Instances.js:76
        $one = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects')->assertOk());

        // A second project with its own staging appears straight in the mirror.
        $second = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site2',
            'domain' => 'site2.example.com',
            'status' => 'active',
        ]);
        $this->stagingRow($second, 'site2-staging');

        // CA: src/apis/Instances.js:76
        $two = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects')->assertOk());

        // The list eager-loads every relation it presents.
        $this->assertSame($one, $two);
    }

    public function test_the_project_detail_query_count_does_not_grow_with_the_number_of_stagings(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $parent = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $this->stagingRow($parent, 'site1-staging');
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$parent->id)->assertOk();

        // CA: src/apis/Instances.js:17
        $one = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects/'.$parent->id)->assertOk());

        $this->stagingRow($parent, 'site1-staging-2');

        // CA: src/apis/Instances.js:17
        $two = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects/'.$parent->id)->assertOk());

        // The detail page presents every staging from eager-loaded state.
        $this->assertSame($one, $two);
    }

    /**
     * Run one callback and count the database queries it issues.
     */
    private function queryCount(callable $callback): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $callback();

        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    private static function stagingRow(Application $parent, string $username): Application
    {
        return Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => $username,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);
    }

    public function test_wordpress_detected_projects_have_no_source_card(): void
    {
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'wpsite'),
            ]]),
        ]);

        $user = User::factory()->create();
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'wpsite')->firstOrFail();
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        // CA: src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->json('data');

        $this->assertSame('wordpress', $item['type']);
        $this->assertNull($item['source']);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function projectApplication(string $username, array $payload): Application
    {
        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => $username,
            'name' => $username,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'engine_payload' => $payload,
        ]);
    }

    public function test_server_account_details_carry_the_derived_account_keys_from_config(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->projectApplication('site1', [
            'details' => ['home_dir' => '/details/home', 'mysql_prefix' => 'details_', 'ip_address' => TestNetwork::public2(1)],
            'config' => [
                'home_dir' => '/home/site1',
                'mysql_prefix' => 'site1_',
                'ip_addresses' => ['ipv4' => [TestNetwork::public(10)]],
            ],
        ]);

        // CA: src/apis/Instances.js:20
        $response = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: src/mixins/InstanceHostingContextMixin.js:15-28 (`hostingAccountDetails` = `server_account_details`, Instances.js:169: homedir, username, mysql_db_prefix, ip_address)
        $response->assertJsonPath('data.server_account_details.homedir', '/home/site1')
            ->assertJsonPath('data.server_account_details.mysql_db_prefix', 'site1_')
            ->assertJsonPath('data.server_account_details.ip_address', TestNetwork::public(10))
            ->assertJsonPath('data.server_account_details.username', 'site1')
            ->assertJsonMissingPath('data.details.homedir');
    }

    public function test_server_account_details_name_the_project_domain_for_the_phpmyadmin_dns_check(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->projectApplication('site4', ['details' => []]);
        $application->forceFill(['domain' => 'www.site4.example.com'])->save();

        // CA: src/apis/Instances.js:20
        $response = $this->actingAs($user)->getJson('/api/projects/'.$application->id);
        $response->assertOk();
        // CA reads: src/views/instance/advanced/DeveloperSettings.vue:155 (the SSO host the DNS check uses)
        $response->assertJsonPath('data.server_account_details.mysql_php_my_admin_sso_host', 'site4.example.com');
    }

    public function test_server_account_details_keep_an_engine_supplied_phpmyadmin_sso_host(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->projectApplication('site5', [
            'details' => ['mysql_php_my_admin_sso_host' => 'sso.example.net'],
        ]);

        // CA: src/apis/Instances.js:20
        $response = $this->actingAs($user)->getJson('/api/projects/'.$application->id);
        $response->assertOk();
        // CA reads: src/views/instance/advanced/DeveloperSettings.vue:155 (the SSO host the DNS check uses)
        $response->assertJsonPath('data.server_account_details.mysql_php_my_admin_sso_host', 'sso.example.net');
    }

    public function test_server_account_details_fall_back_to_details_then_defaults(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $fromDetails = $this->projectApplication('site2', [
            'details' => ['home_dir' => '/srv/site2', 'mysql_prefix' => 'd2_', 'ip_address' => TestNetwork::public2(2)],
        ]);
        $bare = $this->projectApplication('site3', ['details' => []]);

        // CA: src/apis/Instances.js:20
        // CA reads: src/mixins/InstanceHostingContextMixin.js:15-28 (`hostingAccountDetails` = `server_account_details`, Instances.js:169: homedir, mysql_db_prefix, ip_address)
        $this->actingAs($user)->getJson('/api/projects/'.$fromDetails->id)->assertOk()
            ->assertJsonPath('data.server_account_details.homedir', '/srv/site2')
            ->assertJsonPath('data.server_account_details.mysql_db_prefix', 'd2_')
            ->assertJsonPath('data.server_account_details.ip_address', TestNetwork::public2(2));

        // CA: src/apis/Instances.js:20
        // CA reads: src/mixins/InstanceHostingContextMixin.js:15-28 (`hostingAccountDetails` = `server_account_details`, Instances.js:169: homedir, mysql_db_prefix, ip_address, username)
        $this->actingAs($user)->getJson('/api/projects/'.$bare->id)->assertOk()
            ->assertJsonPath('data.server_account_details.homedir', '/home/site3')
            ->assertJsonPath('data.server_account_details.mysql_db_prefix', '')
            ->assertJsonPath('data.server_account_details.ip_address', '')
            ->assertJsonPath('data.server_account_details.username', 'site3');
    }

    public function test_is_container_follows_the_engine_template_and_git_repo(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $dind = $this->projectApplication('dind1', ['details' => ['template' => 'dind']]);
        $git = $this->projectApplication('git1', ['details' => ['git_repo' => 'https://github.com/acme/git1.git']]);
        $classic = $this->projectApplication('classic1', ['details' => ['template' => 'classic']]);

        // CA: src/apis/Instances.js:20
        // CA reads: src/apis/Instances.js:170 (`isContainer: !!app.is_container`, which gates the Containers page, utils/advancedHostingSections.js:56)
        $this->actingAs($user)->getJson('/api/projects/'.$dind->id)->assertOk()->assertJsonPath('data.is_container', true);
        // CA: src/apis/Instances.js:20
        // CA reads: src/apis/Instances.js:170 (`isContainer: !!app.is_container`)
        $this->actingAs($user)->getJson('/api/projects/'.$git->id)->assertOk()->assertJsonPath('data.is_container', true);
        // CA: src/apis/Instances.js:20
        // CA reads: src/apis/Instances.js:170 (`isContainer: !!app.is_container`)
        $this->actingAs($user)->getJson('/api/projects/'.$classic->id)->assertOk()->assertJsonPath('data.is_container', false);
    }

    public function test_git_repository_is_connected_from_the_panel_git_source_when_the_engine_has_no_repo(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $engine = $this->projectApplication('git2', ['details' => ['git_repo' => 'https://github.com/acme/git2.git', 'git_branch' => 'main']]);
        // SSH-connected: the Engine mirror has git_repo = null, the URL is panel-owned.
        $ssh = $this->projectApplication('ssh1', ['details' => ['git_repo' => null]]);
        $ssh->forceFill(['git_source' => 'git@github.com:acme/ssh1.git'])->save();
        $files = $this->projectApplication('files1', ['details' => []]);

        // CA: src/apis/Instances.js:17
        // CA reads: src/components/cards/GitSourceInfoCard.vue:160-161
        $this->actingAs($user)->getJson('/api/projects/'.$engine->id)->assertOk()
            ->assertJsonPath('data.git_repository.connected', true)
            ->assertJsonPath('data.git_repository.repo_url', 'https://github.com/acme/git2.git')
            ->assertJsonPath('data.git_repository.branch', 'main');
        // CA: src/apis/Instances.js:17
        // CA reads: src/components/cards/GitSourceInfoCard.vue:160-161
        $this->actingAs($user)->getJson('/api/projects/'.$ssh->id)->assertOk()
            ->assertJsonPath('data.git_repository.connected', true)
            ->assertJsonPath('data.git_repository.repo_url', 'git@github.com:acme/ssh1.git')
            ->assertJsonPath('data.git_repository.branch', null);
        // CA: src/apis/Instances.js:17
        // CA reads: src/components/cards/GitSourceInfoCard.vue:160-161
        $this->actingAs($user)->getJson('/api/projects/'.$files->id)->assertOk()
            ->assertJsonPath('data.git_repository.connected', false)
            ->assertJsonPath('data.git_repository.repo_url', null);
    }

    /**
     * The project payload carries the DNS help the domain dialogs render – the A
     * record of the server's IPv4 and the `www` CNAME of the domain, verified by
     * the A record – so Change Domain, Fix it now and the Add Domain
     * instructions show the records and a domain that does not point at the
     * server is warned about (`SimpleServiceOnboarding`).
     */
    public function test_the_project_payload_carries_the_dns_records_the_domain_dialogs_show(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->projectApplication('site1', [
            'config' => ['ip_addresses' => ['ipv4' => [TestNetwork::public(10)]]],
        ]);

        // CA: src/apis/Instances.js:17
        $response = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140 (the A record and the `www` CNAME of `display_options`), packages/client-area/src/apis/Dns.js:303-466 (verification_methods, verification_mode)
        $response->assertJsonPath('data.dns_settings', [
            'domain_verification' => 'none',
            'valid_cname_addresses' => [],
            'verification_methods' => ['resolve_a_record'],
            'verification_mode' => 'any',
            'display_options' => ['a_records'],
        ])
            // The A record's address is the one the change-domain options return.
            // CA reads: packages/client-area/src/components/DnsOptions.vue:100-140
            ->assertJsonPath('data.host_ipv4_addresses', [TestNetwork::public(10)]);
    }

    public function test_slim_payload_keeps_account_keys_and_is_container_but_empty_details(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $application = $this->projectApplication('dind2', [
            'details' => ['template' => 'dind', 'home_dir' => '/home/dind2'],
            'config' => ['mysql_prefix' => 'dind2_', 'ip_addresses' => ['ipv4' => [TestNetwork::public(20)]]],
        ]);

        $slim = app(\PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter::class)
            ->presentSlim($application, $user);

        $this->assertSame([], $slim['details']);
        $this->assertTrue($slim['is_container']);
        $this->assertSame([
            'homedir' => '/home/dind2',
            'mysql_db_prefix' => 'dind2_',
            'ip_address' => TestNetwork::public(20),
            'username' => 'dind2',
        ], $slim['server_account_details']);
    }
}
