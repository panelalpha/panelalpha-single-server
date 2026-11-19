<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Jobs\Application\WatchPushJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * POST /projects/{id}/staging and the disk pre-check
 * (old InstanceController::createStaging/preCheckDiskUsage; the Engine copies
 * files async on POST /projects/{u}/staging).
 *
 * @see packages/client-area/src/components/modal/CreateStagingModal.vue:289
 * @see Engine core/routes/api.php:147 (POST /projects/{username}/staging)
 */
class ProjectStagingTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  array<string, mixed>  $details  the synced Engine `details` (a container
     *                                         project's install outcome is `deployment_status`)
     */
    private function parent(User $user, bool $custom = true, array $details = [], ?string $domain = null): Application
    {
        $this->configureEngine();
        $project = $this->engineProject(10, 'site1', ['details' => $details]);
        if ($domain !== null) {
            $project['domain'] = $domain;
            $project['domain_names'] = [$domain];
        }
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$project]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        if ($custom) {
            $application->update(['type' => Application::TYPE_CUSTOM]);
        }

        return $application;
    }

    public function test_staging_works_right_after_a_classic_creation(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202)]);

        $parent = $this->app->make(ApplicationProvisioner::class)
            ->provision($user, new ProvisionRequest(domain: 'shop.example.com'))
            ->application;
        // The Engine create task finished; no hourly type probe has run yet.
        $parent->forceFill(['status' => 'active'])->save();

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/shop/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'shop-staging',
            'name' => '(staging) Shop',
            'domain' => 'staging.shop.example.com',
            'status' => 'pending',
            'staging_of' => 'shop',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        // The type the provisioner wrote is enough: the staging guard accepts the
        // project without waiting for the probe.
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.shop.example.com'])
            ->assertCreated();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/shop/staging'));
    }

    public function test_staging_creates_the_mirror_and_links_the_parent(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        Queue::fake();

        $data = $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated()
            ->json('data');

        $staging = Application::query()->where('engine_username', 'site1-staging')->firstOrFail();
        $this->assertSame($staging->id, $data['id']);
        $this->assertSame($parent->id, $data['staging']);
        $this->assertSame($parent->id, $data['parent_app']['id']);
        $this->assertSame('in_progress', $data['async_status']['installation']);
        $this->assertSame($parent->id, $staging->staging_of_id);
        // The row is marked creating so a sync before the watcher sees a failed
        // copy keeps it.
        $this->assertNotNull($staging->staging_creating_at);

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && $r['domain'] === 'staging.example.com'
            && $r['copy_databases'] === true);

        // The Engine copies asynchronously; the CA is told when it ends.
        // The copy task id is kept for a failure whose destination is deleted.
        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->id
            && $job->taskId === 7
            // The re-dispatch must carry the parent so a later lost row can
            // still end its spinner.
            && $job->parentId === $parent->id
            // The staging's Engine username is carried so a row the user deletes
            // mid-copy still names the staging in the notification.
            && $job->stagingUsername === 'site1-staging'
            // The whole staleness window counts from the creating marker, not
            // from the first poll.
            && $job->startedAt === (int) $staging->staging_creating_at?->getTimestamp());
    }

    public function test_a_staging_of_a_panelalpha_online_site_lets_the_engine_allocate_the_domain(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user, domain: 'site1.panelalpha.online');

        // An online-zone source makes CopyDomain leave the name to DomainAllocator,
        // which buys and registers it; a name the panel sent would stay unregistered.
        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'site1-9c1f.panelalpha.online',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        Queue::fake();

        // The dialog sends the body (legacy call site; the CA now leaves the domain out for this zone).
        // CA: src/components/modal/CreateStagingModal.vue:307
        $this->actingAs($user)
            ->postJson("/api/projects/{$parent->id}/staging", ['skip_uploads_dir' => false])
            ->assertCreated()
            // CA reads: src/components/modal/CreateStagingModal.vue:315 (the created staging the dialog emits)
            ->assertJsonPath('data.domain', 'site1-9c1f.panelalpha.online');

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && ! array_key_exists('domain', $r->data()));
        $this->assertSame(
            'site1-9c1f.panelalpha.online',
            Application::query()->where('engine_username', 'site1-staging')->value('domain'),
        );
    }

    public function test_a_panelalpha_online_domain_is_refused_for_a_staging(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user, domain: 'site1.panelalpha.online');
        Http::fake();

        // CA: src/components/modal/CreateStagingModal.vue:307
        $this->actingAs($user)
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.site1.panelalpha.online'])
            ->assertUnprocessable()
            // CA reads: src/components/modal/CreateStagingModal.vue:319 (`getErrorMessage(error)`, the alert)
            ->assertJsonPath('errors.domain.0', StagingService::ONLINE_DOMAIN_REFUSED);

        Http::assertNothingSent();
    }

    public function test_a_panelalpha_online_domain_is_refused_for_a_staging_retry_before_the_delete(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user, domain: 'site1.panelalpha.online');
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'site1-9c1f.panelalpha.online',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);
        Http::fake();

        // CA: src/components/modal/CreateStagingModal.vue:313
        $this->actingAs($user)
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.panelalpha.online'])
            ->assertUnprocessable()
            // CA reads: src/components/modal/CreateStagingModal.vue:319 (`getErrorMessage(error)`, the alert)
            ->assertJsonPath('errors.domain.0', StagingService::ONLINE_DOMAIN_REFUSED);

        Http::assertNothingSent();
    }

    public function test_a_retried_staging_of_an_online_site_lets_the_engine_allocate_a_new_domain(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user, domain: 'site1.panelalpha.online');
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'site1-9c1f.panelalpha.online',
            'status' => 'failed',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'site1-ab12.panelalpha.online',
                'status' => 'pending',
                'staging_of' => 'site1',
                'staging' => null,
                'details' => ['async_status' => ['staging' => 'in_progress']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        // CA: src/components/modal/CreateStagingModal.vue:313
        $this->actingAs($user)
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}")
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && ! array_key_exists('domain', $r->data()));
    }

    public function test_a_staging_the_engine_sends_without_a_name_is_named_after_its_parent(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => null,
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);
        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated()
            // CA reads: src/apis/Instances.js:78 (`title: app.name`, the shown project name)
            ->assertJsonPath('data.name', '(staging) Site1');

        $this->assertSame('(staging) Site1', Application::query()->where('engine_username', 'site1-staging')->value('name'));
    }

    public function test_a_staging_stored_without_a_name_is_shown_under_its_parents_name(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'twp18669',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);
        Http::fake();

        $this->actingAs($user)
        // CA: src/apis/Instances.js:17
            ->getJson("/api/projects/{$staging->id}")
            ->assertOk()
            // CA reads: src/apis/Instances.js:78 (`title: app.name`, the shown project name)
            ->assertJsonPath('data.name', '(staging) Site1');
    }

    public function test_a_retried_staging_keeps_its_name(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'name' => '(staging) My shop',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);
        $parent->update(['name' => 'Renamed']);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => null,
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'staging' => null,
                'details' => ['async_status' => ['staging' => 'in_progress']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        $this->assertSame('(staging) My shop', Application::query()->where('engine_username', 'site1-staging')->value('name'));
    }

    public function test_staging_create_logs_the_parent_and_the_staging(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'details' => ['async_status' => ['staging' => 'running']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.site1.example.com'])
            ->assertCreated();

        $staging = Application::query()->where('engine_username', 'site1-staging')->firstOrFail();
        $log = ActivityLog::query()->where('action', 'user.instance.staging.create')->firstOrFail();

        // CA LogItem.vue:99-101 -> InstanceLogMixin::getCreatedStagingInfo reads
        // the second Application payload entry, so the parent comes first.
        $this->assertSame($parent->id, $log->application_id);
        $this->assertSame(
            ['App\\Models\\Application:'.$parent->id, 'App\\Models\\Application:'.$staging->id],
            array_keys($log->payload),
        );
        $this->assertSame('staging.site1.example.com', $log->payload['App\\Models\\Application:'.$staging->id]['domain']);
    }

    public function test_staging_is_refused_when_one_already_exists(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertStatus(422)
            // Old custom_validation.instance_has_already_has_staging text (key 0).
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'This instance already has staging environment.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/staging'));
    }

    public function test_staging_cannot_be_created_from_a_staging(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Http::fake();

        // Old api/messages.cannot_create_staging_from_staging text (key 0).
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$staging->id}/staging", ['domain' => 'staging2.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot create staging instance from staging instance.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/staging'));
    }

    public function test_staging_is_refused_for_a_pending_project(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['status' => 'pending']);

        Http::fake();

        // The pending parent says it is still being
        // prepared instead of the old, unexplained "Invalid action" (key 0).
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'The project is still being prepared. Please try again in a moment.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/staging'));
    }

    /**
     * The Engine fakes of the pre-check: `GET usage` is bare JSON (storage MB,
     * -1 = unlimited), `GET wp/config` lists DB_NAME, `GET mysql/databases`
     * measures each database (`size_bytes`).
     *
     * @param  int|null  $configStatus  the `wp/config` status (422: WordPress fails to load)
     */
    private function fakePreCheck(string $dbName = 'site1_wp', int $configStatus = 200): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/UsageController.php:33 -> UsageController::getUsage
            'engine.example.com/api/projects/site1/usage' => Http::response([
                'storage' => ['usage' => 1024, 'maximum' => -1],
            ]),
            'engine.example.com/api/projects/site1/wp/config?*' => $configStatus === 200
                // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> index (`wp config list --format=json`)
                ? Http::response(['data' => [['name' => 'DB_NAME', 'value' => $dbName, 'type' => 'constant']]])
                // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:39 -> respond (WordPress fails to load)
                : Http::response(['message' => 'PHP Fatal error'], $configStatus),
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:55 -> index (size_bytes per database)
            'engine.example.com/api/projects/site1/mysql/databases' => Http::response(['data' => [
                ['database' => 'site1_other', 'size_bytes' => 9],
                ['database' => 'site1_wp', 'size_bytes' => 4096],
            ]]),
        ]);
    }

    /**
     * Since Engine 2.2.0 the sizes are Engine measurements: the files from the
     * synced `disk.files_bytes`, the database from `size_bytes` of DB_NAME –
     * no `wp eval du` / `wp db query` (the removed `WpCliStagingSizeProbe`).
     * The Engine measures no single directory, so uploads is null.
     */
    public function test_pre_check_reports_the_account_usage(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        // Engine: core/app/Http/Resources/UserResource.php:75-90 -> disk() (mirrored by the sync)
        $parent->update(['type' => Application::TYPE_WORDPRESS, 'engine_payload' => ['disk' => ['files_bytes' => 2048, 'docker_bytes' => 0, 'total_bytes' => 2048, 'limit_bytes' => -1, 'measured_at' => '2026-10-15T03:00:00Z']]]);
        $this->fakePreCheck();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:289
            ->getJson("/api/projects/{$parent->id}/staging/pre-check-disk-usage")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.account_usage', 1073741824)
            ->assertJsonPath('data.account_limit', null)
            ->assertJsonPath('data.wordpress_dir_usage', 2048)
            ->assertJsonPath('data.uploads_dir_usage', null)
            ->assertJsonPath('data.wordpress_db_usage', 4096);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp-cli/command') || str_contains($r->url(), '/wp/command'));
    }

    public function test_pre_check_answers_null_for_a_database_that_is_not_the_projects(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        // A container WordPress's database lives in its own server, not in `mysql/databases`.
        $parent->update(['type' => Application::TYPE_WORDPRESS, 'engine_payload' => ['details' => ['template' => 'dind']]]);
        $this->fakePreCheck('wordpress');

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:289
            ->getJson("/api/projects/{$parent->id}/staging/pre-check-disk-usage")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.wordpress_dir_usage', null)
            ->assertJsonPath('data.uploads_dir_usage', null)
            ->assertJsonPath('data.wordpress_db_usage', null);
    }

    public function test_pre_check_answers_null_when_wordpress_fails_to_load(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => Application::TYPE_WORDPRESS]);
        $this->fakePreCheck('site1_wp', 422);

        // The pre-check degrades to nulls; a broken install is not a 422.
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:289
            ->getJson("/api/projects/{$parent->id}/staging/pre-check-disk-usage")
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('data.account_usage', 1073741824)
            ->assertJsonPath('data.wordpress_db_usage', null);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/mysql/databases'));
    }

    public function test_staging_requires_authentication(): void
    {
        // CA: src/components/modal/CreateStagingModal.vue:307
        $this->postJson('/api/projects/1/staging', ['domain' => 'x.example.com'])->assertUnauthorized();
    }

    /**
     * The project kinds the panel used to refuse: since Engine 2.2.0 the
     * Engine points a copied WordPress at its own database and host and rolls a
     * failed push back, and it
     * reads `wp-config.php` itself, so an undetected project is copied too.
     *
     * @return array<string, array{?string}>
     */
    public static function kindsTheEngineNowCopies(): array
    {
        return [
            'classic WordPress' => [Application::TYPE_WORDPRESS],
            'undetected' => [null],
        ];
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_staging_reaches_the_engine_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => $type]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && $r['copy_databases'] === true);
        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->taskId === 7);
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_retry_staging_reaches_the_engine_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => $type]);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'type' => $type,
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);

        Queue::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'staging' => null,
                'details' => ['async_status' => ['staging' => 'in_progress']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/projects/site1-staging'));
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging'));
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_push_to_live_reaches_the_engine_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => $type]);
        $staging = $this->staging($parent);
        $staging->update(['type' => $type]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1-staging/push' => Http::response(['data' => $this->engineProject(
            10, 'site1', ['details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 42], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:563
            ->putJson("/api/projects/{$staging->id}/push-to-live", ['overwrite_files' => true, 'push_db' => true])
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1-staging/push')
            && $r['target'] === 'site1'
            && $r['files'] === true
            && $r['databases'] === true);
        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->taskId === 42);
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_push_to_staging_reaches_the_engine_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => $type]);
        $this->staging($parent)->update(['type' => $type]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1', 'details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 43], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", ['overwrite_files' => true, 'push_db' => true])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push')
            && $r['target'] === 'site1-staging');
        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->taskId === 43);
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_push_to_live_show_reads_the_engine_diff_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => $type]);
        $staging = $this->staging($parent);
        $staging->update(['type' => $type]);

        // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff (PushDiffResource)
        Http::fake(['engine.example.com/api/projects/site1-staging/push/diff*' => Http::response(['data' => [
            'tables_structure_diff' => [['database' => 'site1_wp', 'name' => 'wp_options']],
            'tables_data_diff' => [],
        ]])]);

        // CA: src/mixins/OpenModalAction.js:143
        // CA reads: src/mixins/InstanceActionsMixin.js:459-470 (entry is the option label and value)
        $this->actingAs($user)
            ->getJson("/api/projects/{$staging->id}/push-to-live")
            ->assertOk()
            ->assertJsonPath('data.tables_structure_diff.0', 'site1_wp.wp_options');

        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_ends_with($r->url(), '/api/projects/site1-staging/push/diff?target=site1'));
    }

    public function test_container_wordpress_staging_still_creates_the_mirror(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        // DinD (details.template = dind) copies the database too, so staging works.
        $parent->update(['type' => Application::TYPE_WORDPRESS, 'engine_payload' => ['details' => ['template' => 'dind']]]);

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['template' => 'dind', 'async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging'));
    }

    public function test_custom_project_staging_still_creates_the_mirror(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $parent->update(['type' => Application::TYPE_CUSTOM]);

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging'));
    }

    public function test_push_to_live_pushes_the_staging_onto_its_parent(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Queue::fake();
        // The Engine 202 body is the **target** UserResource with push=running,
        // plus the copy Task's top-level `task_id`, not `{data: [], task_id}`.
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1-staging/push' => Http::response(['data' => $this->engineProject(
            10, 'site1', ['details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 42], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:563
            ->putJson("/api/projects/{$staging->id}/push-to-live", [
                'overwrite_files' => true,
                'push_db' => true,
            ])
            ->assertOk()
        // CA reads: src/apis/Instances.js:17
            ->assertJson(['success' => true]);

        // Source is the staging project, target its live parent; the CA flags map
        // one to one to the Engine body.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1-staging/push')
            && $r['target'] === 'site1'
            && $r['files'] === true
            && $r['databases'] === true);

        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->sourceId === $staging->id
            && $job->targetId === $parent->id
            && $job->taskId === 42
            && $job->finishedType === 'user.instance.push_to_live_finished');

        // An immediate reload already shows the running push on both sides: the
        // staging source reads its live parent's status and the live target its
        // own.
        // CA: src/apis/Instances.js:17
        $live = $this->actingAs($user)->getJson("/api/projects/{$parent->id}")->assertOk()->json('data');
        $this->assertSame('in_progress', $live['async_status']['pull_from_staging']);
        // CA: src/apis/Instances.js:17
        $stagingView = $this->actingAs($user)->getJson("/api/projects/{$staging->id}")->assertOk()->json('data');
        $this->assertSame('in_progress', $stagingView['async_status']['push_to_live']);
    }

    /**
     * Push To Live while the staging copy is still being created: the Engine's
     * 422 (`project_pending`) reads the preparing sentence, not the Engine's
     * "Project '<user>' is pending.".
     */
    public function test_push_to_live_of_a_pending_staging_reads_the_preparing_sentence(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        // Engine: core/app/System/Projects.php:1440,1583 (422, problems[].code project_pending; "Project '<user>' is pending.")
        Http::fake(['engine.example.com/api/projects/site1-staging/push' => Http::response([
            'message' => "Project 'site1' is pending.",
            'errors' => ['target' => ["Project 'site1' is pending."]],
            'problems' => [['field' => 'target', 'code' => 'project_pending', 'message' => "Project 'site1' is pending."]],
        ], 422)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:563
            ->putJson("/api/projects/{$staging->id}/push-to-live", [
                'overwrite_files' => true,
                'push_db' => true,
            ])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:576 (the modal shows the error)
            ->assertJsonPath('message', EngineText::STILL_PREPARING);
    }

    public function test_push_to_staging_pushes_the_live_onto_its_staging(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Queue::fake();
        // The target is the staging project (id 50), returned by the 202 with the
        // push Task id.
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1', 'details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 43], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => true,
                'push_db' => false,
            ])
            ->assertOk();

        // `databases` is always sent, so the Engine's default (true) cannot push
        // a database the user did not tick.
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push')
            && $r['target'] === 'site1-staging'
            && $r['files'] === true
            && $r['databases'] === false);

        Queue::assertPushed(WatchPushJob::class, fn (WatchPushJob $job) => $job->sourceId === $parent->id
            && $job->targetId !== $parent->id
            && $job->taskId === 43
            && $job->finishedType === 'user.instance.push_to_staging_finished');

        // The live source reads its newest staging's running push right away; the
        // staging target has no push_to_live of its own.
        // CA: src/apis/Instances.js:17
        $live = $this->actingAs($user)->getJson("/api/projects/{$parent->id}")->assertOk()->json('data');
        $this->assertSame('in_progress', $live['async_status']['push_to_staging']);
        // CA: src/apis/Instances.js:17
        $stagingView = $this->actingAs($user)->getJson("/api/projects/{$staging->id}")->assertOk()->json('data');
        $this->assertNull($stagingView['async_status']['push_to_live']);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function markedStagingProvider(): array
    {
        return [
            'copy still running' => ['staging_creating_at'],
            'copy failed' => ['staging_create_failed_at'],
        ];
    }

    #[DataProvider('markedStagingProvider')]
    public function test_push_to_staging_is_refused_for_a_marked_staging(string $marker): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
            $marker => now(),
        ]);

        Http::fake();

        // The old `Invalid action` refusal, before any Engine call.
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", ['overwrite_files' => true, 'push_db' => true])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Invalid action');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/push'));
    }

    public function test_push_to_staging_allows_a_stale_creating_marker(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
            // The watcher was lost: the copy cannot still be running after the
            // cap plus its maximum backoff, so the marker must not block the
            // push.
            'staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS),
        ]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1', 'details' => ['async_status' => ['push' => 'running']]],
        ), 'task_id' => 44], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", ['overwrite_files' => true, 'push_db' => false])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/push')
            && $r['databases'] === false);
    }

    /**
     * The CA's push flags map one to one to the Engine
     * body (`overwrite_files` → `files`, `push_db` → `databases`), and
     * `databases` is present even when false so the Engine's new default (`true`)
     * cannot push a database the user did not tick.
     *
     * @return array<string, array{bool, bool}>
     */
    public static function pushFlagProvider(): array
    {
        return [
            'both on' => [true, true],
            'files only' => [true, false],
            'db only' => [false, true],
        ];
    }

    #[DataProvider('pushFlagProvider')]
    public function test_push_forwards_the_ca_flags(bool $overwriteFiles, bool $pushDb): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1'],
        ), 'task_id' => 45], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => $overwriteFiles,
                'push_db' => $pushDb,
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push')
            && $r['files'] === $overwriteFiles
            && $r['databases'] === $pushDb);
    }

    /**
     * The Engine's 422 `nothing_to_push` (both flags off) reaches the CA as a
     * clean field validation error.
     */
    public function test_push_with_both_flags_off_reaches_the_ca_as_a_clean_422(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Queue::fake();
        // Engine: core/app/Http/Requests/ProjectPushRequest.php:37 -> nothing_to_push (both false)
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response([
            'message' => 'Nothing to push: both files and databases are disabled.',
            'errors' => ['files' => ['Nothing to push: both files and databases are disabled.']],
            'problems' => [[
                'field' => 'files',
                'code' => 'nothing_to_push',
                'message' => 'Nothing to push: both files and databases are disabled.',
            ]],
        ], 422)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => false,
                'push_db' => false,
            ])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:576 (the modal shows the error)
            ->assertJsonValidationErrors('files');

        // Both false are forwarded as-is, so the Engine's default (true) never
        // turns a both-off push into a database overwrite.
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push')
            && $r['files'] === false
            && $r['databases'] === false);

        Queue::assertNotPushed(WatchPushJob::class);
    }

    /**
     * The CA's
     * `structural_change_tables` and `datachange_tables` selections (the
     * `database.name` strings from `GET push/diff`) become the Engine's
     * `tables`, deduplicated.
     */
    public function test_push_forwards_the_selected_tables(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push answers 202 with the target UserResource and a task_id
        Http::fake(['engine.example.com/api/projects/site1/push' => Http::response(['data' => $this->engineProject(
            50, 'site1-staging', ['staging_of' => 'site1'],
        ), 'task_id' => 46], 202)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:563-565 (value = the push/diff entry; :459-470 renders it as a string)
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => false,
                'push_db' => true,
                'structural_change_tables' => ['site1_app.wp_options'],
                'datachange_tables' => [
                    'site1_app.wp_options',
                    'site1_app.wp_posts',
                ],
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push')
            && ($r['tables'] ?? null) === [
                ['database' => 'site1_app', 'name' => 'wp_options'],
                ['database' => 'site1_app', 'name' => 'wp_posts'],
            ]);
    }

    /**
     * A selection that is not `database.table` is
     * a 422 on `tables`, never dropped. Dropping the one invalid entry would
     * silently push only the valid tables, and dropping all of them would push
     * the whole database.
     */
    public function test_push_rejects_a_mixed_valid_and_invalid_table_selection(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $this->staging($parent);

        // Defensive (not an Engine shape): the refusal must happen before any
        // Engine call, so the push stub is never reached.
        Http::fake(['engine.example.com/*' => Http::response([], 500)]);

        // CA: src/mixins/InstanceActionsMixin.js:563-565 (value = a push/diff entry or a typed value)
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => false,
                'push_db' => true,
                'structural_change_tables' => ['site1_app.wp_options'],
                'datachange_tables' => ['nodot'],
            ])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:576 (the modal shows the error)
            ->assertJsonValidationErrors('tables');

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push'));
    }

    public function test_push_rejects_an_all_invalid_table_selection(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $this->staging($parent);

        // Defensive (not an Engine shape): the refusal must happen before any
        // Engine call, so the push stub is never reached.
        Http::fake(['engine.example.com/*' => Http::response([], 500)]);

        // CA: src/mixins/InstanceActionsMixin.js:563-565 (value = a push/diff entry or a typed value)
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => false,
                'push_db' => true,
                'structural_change_tables' => ['.leading'],
                'datachange_tables' => ['nodot', 'trailing.'],
            ])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:576 (the modal shows the error)
            ->assertJsonValidationErrors('tables');

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push'));
    }

    /**
     * An entry that is not exactly the
     * `database.table` string the diff returned (a missing side or an extra
     * dot) is refused, never parsed into a bogus `{database, name}` pair.
     */
    #[DataProvider('malformedTableSelections')]
    public function test_push_rejects_a_malformed_table_selection(string $selection): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $this->staging($parent);

        // Defensive (not an Engine shape): the refusal must happen before any
        // Engine call, so the push stub is never reached.
        Http::fake(['engine.example.com/*' => Http::response([], 500)]);

        // CA: src/mixins/InstanceActionsMixin.js:563-565 (value = a push/diff entry or a typed value)
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:793
            ->putJson("/api/projects/{$parent->id}/push-to-staging", [
                'overwrite_files' => false,
                'push_db' => true,
                'datachange_tables' => [$selection],
            ])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:576 (the modal shows the error)
            ->assertJsonValidationErrors('tables');

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/push'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function malformedTableSelections(): array
    {
        return [
            'missing database' => ['.leading'],
            'missing table' => ['trailing.'],
            'extra dot' => ['site1_app.wp_posts.extra'],
        ];
    }

    /**
     * A staging linked to a live parent, so the push diff has both sides.
     */
    private function staging(Application $parent): Application
    {
        return Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
        ]);
    }

    public function test_push_to_live_show_returns_the_engine_table_diff(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = $this->staging($parent);

        // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff (PushDiffResource)
        Http::fake(['engine.example.com/api/projects/site1-staging/push/diff*' => Http::response(['data' => [
            'tables_structure_diff' => [['database' => 'site1_app', 'name' => 'wp_options']],
            'tables_data_diff' => [['database' => 'site1_app', 'name' => 'wp_posts']],
        ]])]);

        // CA: src/mixins/OpenModalAction.js:143
        // CA reads: src/mixins/InstanceActionsMixin.js:459-470 (entry is the option label and value)
        $this->actingAs($user)
            ->getJson("/api/projects/{$staging->id}/push-to-live")
            ->assertOk()
            ->assertJsonPath('data.tables_structure_diff.0', 'site1_app.wp_options')
            ->assertJsonPath('data.tables_data_diff.0', 'site1_app.wp_posts');

        // The source is the staging, the target its live parent; each entry is
        // the `database.name` string the push turns back into a `{database,
        // name}` pair.
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_ends_with($r->url(), '/api/projects/site1-staging/push/diff?target=site1'));
    }

    public function test_push_to_staging_show_returns_the_engine_table_diff(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $this->staging($parent);

        // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff (PushDiffResource)
        Http::fake(['engine.example.com/api/projects/site1/push/diff*' => Http::response(['data' => [
            'tables_structure_diff' => [],
            'tables_data_diff' => [['database' => 'site1_app', 'name' => 'wp_posts']],
        ]])]);

        // CA: src/mixins/OpenModalAction.js:188
        // CA reads: src/mixins/InstanceActionsMixin.js:459-470 (entry is the option label and value)
        $this->actingAs($user)
            ->getJson("/api/projects/{$parent->id}/push-to-staging")
            ->assertOk()
            ->assertJsonPath('data.tables_structure_diff', [])
            ->assertJsonPath('data.tables_data_diff.0', 'site1_app.wp_posts');

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/api/projects/site1/push/diff?target=site1-staging'));
    }

    public function test_push_to_live_show_is_422_without_a_live_parent(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        // The old ApplicationController::pushToLiveShow answered 422 when the
        // bound project had no live parent, before any Engine call.
        // CA: src/mixins/OpenModalAction.js:143
        // CA reads: src/mixins/OpenModalAction.js:150
        $this->actingAs($user)
            ->getJson("/api/projects/{$parent->id}/push-to-live")
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/push/diff'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function markedStagingShowProvider(): array
    {
        return [
            'copy still running' => ['staging_creating_at'],
            'copy failed' => ['staging_create_failed_at'],
        ];
    }

    #[DataProvider('markedStagingShowProvider')]
    public function test_push_to_staging_show_is_refused_for_a_marked_staging(string $marker): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $parent->id,
            $marker => now(),
        ]);

        // CA: src/mixins/OpenModalAction.js:188
        // CA reads: src/mixins/OpenModalAction.js:195
        $this->actingAs($user)
            ->getJson("/api/projects/{$parent->id}/push-to-staging")
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/push/diff'));
    }

    public function test_push_diff_engine_refusal_reaches_the_ca(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = $this->staging($parent);

        // Engine: core/app/Http/Requests/ProjectPushDiffRequest.php:39 -> tables_not_applicable
        Http::fake(['engine.example.com/api/projects/site1-staging/push/diff*' => Http::response([
            'message' => 'Comparing database tables is only available for classic projects.',
            'errors' => ['target' => ['Comparing database tables is only available for classic projects.']],
        ], 422)]);

        // CA: src/mixins/OpenModalAction.js:143
        // CA reads: src/mixins/OpenModalAction.js:150
        $this->actingAs($user)
            ->getJson("/api/projects/{$staging->id}/push-to-live")
            ->assertStatus(422)
            ->assertJsonValidationErrors('target');
    }

    public function test_staging_is_refused_for_a_failed_project(): void
    {
        $user = User::factory()->create();
        // The Engine kept the project after its install failed
        // (FailureRetention.php:31-39); nothing is retrying it.
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'failed', 'kind' => 'install'])]);
        $parent = $this->parent($user, true, ['template' => 'dind', 'deployment_status' => 'failed']);

        Http::fake();

        // Old Application::isFailed() -> custom_validation.invalid_action.
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Invalid action');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/staging'));
    }

    public function test_a_failed_redeploy_does_not_block_staging(): void
    {
        $user = User::factory()->create();
        // The install succeeded, then a redeploy failed: the Engine keeps
        // `deployed_before` (FailureRetention.php:31-39).
        $parent = $this->parent($user, true, ['template' => 'dind', 'deployment_status' => 'failed', 'deployed_before' => true]);

        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of' => 'site1',
            'details' => ['async_status' => ['staging' => 'running']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        // A failed redeploy never undoes the install.
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertCreated();
    }

    public function test_a_cancelled_install_blocks_staging(): void
    {
        $user = User::factory()->create();
        // A cancelled install keeps the project as a failed one
        // (FailureRetention::retainAfterDeployCancelled, FailureRetention.php:41-51).
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'cancelled', 'kind' => 'install'])]);
        $parent = $this->parent($user, true, ['template' => 'dind', 'deployment_status' => 'failed']);

        Http::fake();

        // Cancelled counts as failed, like the presenter and retryInstall.
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:307
            ->postJson("/api/projects/{$parent->id}/staging", ['domain' => 'staging.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Invalid action');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/staging'));
    }

    public function test_retry_staging_answers_404_for_an_unknown_staging_id(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);

        Http::fake();

        // Old retryStaging: instanceQuery()->where('staging', $id)->findOrFail().
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/999999", ['domain' => 'staging.example.com'])
            ->assertNotFound();

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/projects/site1'));
    }

    public function test_retry_staging_is_refused_while_the_copy_is_creating(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);

        Http::fake();

        // A copy that is still running has a live destination the retry would
        // destroy, and a second watcher would race the first: refuse before any
        // Engine call (the old
        // custom_validation.cannot_retry_installation text).
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        Http::assertNotSent(fn ($r) => in_array($r->method(), ['GET', 'POST', 'PUT', 'DELETE'], true));
    }

    public function test_retry_staging_ignores_a_stale_creating_marker(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            // The watcher was lost, so its cap plus maximum backoff has passed:
            // the marker is stale and the retry must not be refused forever.
            'staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS),
        ]);

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'details' => ['async_status' => ['staging' => 'in_progress']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/projects/site1-staging'));
    }

    public function test_retry_staging_is_refused_when_the_staging_is_healthy(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'completed']]],
        ]);

        // The Engine still has the (working) destination.
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
            'username' => 'site1-staging',
            'details' => ['async_status' => ['staging' => 'completed']],
        ]])]);

        // Old custom_validation.cannot_retry_installation text (key 0).
        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        // Nothing may be deleted or re-created.
        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE' || $r->method() === 'POST');
    }

    public function test_retry_staging_is_allowed_when_the_engine_project_is_gone(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
        ]);

        // The Engine deleted the failed destination (Jobs/CreateStaging::failed).
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 404),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'details' => ['async_status' => ['staging' => 'running']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        // A retry re-copies the databases too.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && $r['copy_databases'] === true);
    }

    public function test_retry_staging_is_allowed_when_the_engine_reports_a_failed_copy(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            // The mirror payload still says running; the Engine already marked
            // the copy failed (the payload can lag by one sync).
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'running']]],
        ]);

        Http::fake([
            'engine.example.com/api/projects/site1-staging' => function ($request) {
                if ($request->method() === 'DELETE') {
                    // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
                    return Http::response(null, 204);
                }

                // Engine markStagingFailed(): failed + details.error, destination
                // not cleaned up yet (Jobs/CreateStaging::failed).
                // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
                return Http::response(['data' => [
                    'username' => 'site1-staging',
                    'status' => 'pending',
                    'details' => ['async_status' => ['staging' => 'failed'], 'error' => 'rsync failed'],
                ]]);
            },
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'details' => ['async_status' => ['staging' => 'running']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging'));
    }

    public function test_retry_staging_refuses_a_non_engine_error_status(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'error']]],
        ]);

        // The Engine writes only running/completed/failed, so a mirror `error`
        // is not a failure and the live project decides; it is still there, so
        // the retry is refused.
        Http::fake([
            // Defensive (not an Engine shape): the Engine writes only running/completed/failed (`Models/User.php:makePendingStaging`, `System/Projects.php:249,272`).
            'engine.example.com/api/projects/site1-staging' => Http::response(['data' => [
                'username' => 'site1-staging',
                'details' => ['async_status' => ['staging' => 'error']],
            ]]),
        ]);

        // Old custom_validation.cannot_retry_installation text (key 0).
        // CA: src/components/modal/CreateStagingModal.vue:313
        $this->actingAs($user)
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');

        Http::assertNotSent(fn ($r) => in_array($r->method(), ['DELETE', 'POST'], true));
    }

    public function test_retry_staging_logs_the_parent_and_the_staging(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'details' => ['async_status' => ['staging' => 'running']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        $log = ActivityLog::query()->where('action', 'user.instance.staging.retry_install')->firstOrFail();
        $this->assertSame(
            ['App\\Models\\Application:'.$parent->id, 'App\\Models\\Application:'.$staging->id],
            array_keys($log->payload),
        );
        $this->assertSame('staging.site1.example.com', $log->payload['App\\Models\\Application:'.$staging->id]['domain']);
    }

    public function test_retry_staging_recreates_the_same_project(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'name' => '(staging) Site1',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'staging' => null,
                'details' => ['async_status' => ['staging' => 'in_progress']],
                'config' => [],
                'created_at' => '2026-10-10T00:00:00.000000Z',
            ], 'task_id' => 7], 202),
        ]);

        Queue::fake();

        $data = $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk()
            ->json('data');

        // The retry re-links the same local row and clears the failure marker;
        // it starts a new copy, so the creating marker is set again.
        $this->assertSame($staging->id, $data['id']);
        $this->assertNull($staging->fresh()->staging_create_failed_at);
        $this->assertNotNull($staging->fresh()->staging_creating_at);

        // No restage endpoint: the failed project goes and the same
        // username/domain are created again.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/projects/site1-staging'));
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/projects/site1/staging')
            && $r['new_username'] === 'site1-staging'
            && $r['domain'] === 'staging.site1.example.com');

        // A retry notifies through the same watcher and keeps the copy
        // task id for the failure path.
        Queue::assertPushed(WatchStagingJob::class, fn (WatchStagingJob $job) => $job->stagingId === $staging->fresh()->id
            && $job->taskId === 7
            && $job->parentId === $parent->id
            // A retry carries the staging's username for the same lost-row text.
            && $job->stagingUsername === 'site1-staging'
            // Retry starts a new clock at its own creating marker.
            && $job->startedAt === (int) $staging->fresh()->staging_creating_at?->getTimestamp());

        $this->assertSame($parent->id, $staging->fresh()->staging_of_id);
    }

    public function test_retry_staging_deletes_through_the_long_engine_timeout(): void
    {
        $user = User::factory()->create();
        $parent = $this->parent($user);
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
        ]);

        // The retry destroys the destination account synchronously, like the
        // project delete, so the client must get the long per-call timeout.
        $spy = $this->spyEngineTimeout($parent);
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
                'id' => 51,
                'username' => 'site1-staging',
                'domain' => 'staging.site1.example.com',
                'status' => 'pending',
                'staging_of' => 'site1',
                'details' => ['async_status' => ['staging' => 'running']],
            ], 'task_id' => 7], 202),
        ]);
        Queue::fake();

        $this->actingAs($user)
        // CA: src/components/modal/CreateStagingModal.vue:313
            ->putJson("/api/projects/{$parent->id}/retry-staging/{$staging->id}", ['domain' => 'staging.site1.example.com'])
            ->assertOk();

        $this->assertSame(EngineClient::LONG_TIMEOUT_SECONDS, $spy->requestedTimeout);
    }
}
