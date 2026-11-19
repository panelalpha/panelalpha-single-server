<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The WordPress backup routes, backed by the
 * Engine's backup endpoints (classic and container projects alike).
 *
 * Contract:
 *  - CA `reloadBackups`: `Api.get('/instances/{id}/wordpress/backups')` reads
 *    `response.data.data` (rows) and `response.data.meta.usage`
 *    (`Backups.vue:263-270`); each row's `id`/`name`/`date`(s)/`size`(bytes)/
 *    `type`/`version`/`note`/`directory`/`database`/`async_status`/`items` is
 *    read (`BackupActionsMixin.js:12-14,59,114,244,328,439`).
 *  - CA `createBackup`: `Api.post('/instances/{id}/wordpress/backups', formData)`
 *    (`BackupActionsMixin.js:244`) sends `backupDirectory`/`backupDatabase`/
 *    `backupNote`.
 *  - CA `restoreBackup`: `Api.put('…/backups/{id}/restore', formData)`
 *    (`BackupActionsMixin.js:328`) sends `restoreDatabase`/`restoreDirectory`/
 *    `deleteExistingFiles`.
 *  - CA `deleteBackup`: `Api.delete('…/backups/{id}')` (`BackupActionsMixin.js:59`).
 *  - CA `downloadBackup`: opens `…/backups/{id}/item/{item}/download` by hand
 *    (`BackupActionsMixin.js:439`).
 *  - CA automatic backup: `fetchData.js:94,110` GET/PUT
 *    `/instances/{id}/wordpress/automatic-backup`.
 *  - CA reads `meta.usage.{manual_backups_number,automatic_backups_number,backups_size}.{total,max}`
 *    (`Backups.vue:429,437`).
 *
 * Engine: core/app/Http/Controllers/User/BackupController.php (see the
 * per-test `// Engine:` citations) and
 * core/app/Http/Controllers/User/BackupScheduleController.php.
 */
class BackupTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): \PanelAlpha\ClientArea\Models\Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
    }

    /**
     * One `GET backups` row (Engine `BackupResource`).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function engineBackup(int $id = 5, array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/BackupResource.php:12 -> BackupResource::toArray
        return array_merge([
            'id' => $id,
            'username' => 'site1',
            'container_id' => 1,
            'kind' => 'manual',
            'note' => 'Before update',
            'contents' => ['files' => true, 'databases' => true],
            'async_status' => ['backup' => 'completed', 'source' => 'api'],
            'error' => null,
            'size_bytes' => 2048,
            'created_at' => '2026-10-10T12:00:00.000000Z',
            'updated_at' => '2026-10-10T12:05:00.000000Z',
            'items' => [
                // Engine: core/app/Http/Resources/BackupItemResource.php:12 -> BackupItemResource::toArray
                // Engine: core/app/System/Project/Backup.php:746 -> saveItem stores details.type/name/sha256
                ['id' => 9, 'remote_path' => 'backups/site1/5/home.tar.gz', 'size_bytes' => 2048, 'details' => ['type' => 'files', 'name' => 'home', 'scope' => 'home', 'sha256' => str_repeat('a', 64)]],
                ['id' => 10, 'remote_path' => 'backups/site1/5/database-site1_wp.sql.gz', 'size_bytes' => 1024, 'details' => ['type' => 'database', 'name' => 'site1_wp', 'sha256' => str_repeat('b', 64)]],
            ],
        ], $overrides);
    }

    public function test_list_returns_the_backups_and_the_usage_in_the_old_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5),
            $this->engineBackup(6, ['kind' => 'scheduled', 'size_bytes' => 1024, 'contents' => ['files' => true, 'databases' => false]]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/views/instance/Backups.vue:269
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.id', 5)
            ->assertJsonPath('data.0.type', 'manual')
            ->assertJsonPath('data.0.size', 2048)
            ->assertJsonPath('data.0.date', 1791633600)
            ->assertJsonPath('data.0.async_status.create', 'finished')
            ->assertJsonPath('data.0.items.0.id', 9)
            ->assertJsonPath('data.1.type', 'automatic')
            ->assertJsonPath('meta.usage.manual_backups_number.total', 1)
            ->assertJsonPath('meta.usage.automatic_backups_number.total', 1)
            ->assertJsonPath('meta.usage.backups_size.total', 3072)
            ->assertJsonPath('meta.usage.backups_size.max', null);
    }

    public function test_create_starts_a_backup_with_the_one_container_and_watches_the_task(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupController.php:105 -> BackupController::store (202 + BackupResource)
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [
                ['id' => 3, 'name' => 'local', 'driver' => 'local', 'location' => '/var/backups', 'has_credentials' => false, 'created_at' => '2026-10-01T00:00:00.000000Z', 'updated_at' => '2026-10-01T00:00:00.000000Z'],
            ]]),
            'engine.example.com/api/projects/site1/backups' => Http::response(['data' => $this->engineBackup(5, [
                'async_status' => ['backup' => 'pending', 'source' => 'api', 'task_id' => 7],
            ])], 202),
        ]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:248
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/backups", [
                'backupDirectory' => true,
                'backupDatabase' => false,
                'backupNote' => 'Before update',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', 5);

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/api/projects/site1/backups')
            && $r['container'] === '3'
            && $r['files'] === true
            && $r['databases'] === false
            && $r['note'] === 'Before update');

        Queue::assertPushed(WatchBackupTaskJob::class, fn (WatchBackupTaskJob $job): bool => $job->applicationId === $application->id
            && $job->taskId === 7
            && $job->action === 'create'
            && $job->finishedType === 'user.instance.backup.create_finished'
            && $job->failedType === 'user.instance.backup.create_failed');
    }

    public function test_create_refuses_when_no_backup_container_is_configured(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        Http::fake(['engine.example.com/api/backup-containers' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:254
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/backups", ['backupDirectory' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors('0');

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/backups') && $r->method() === 'POST');
    }

    public function test_list_reports_each_items_own_contents(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The backup holds files and a database; each item reports only its own
        // contents from the Engine item `details.type`.
        // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5, ['contents' => ['files' => true, 'databases' => true]]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:12-14 (the directory/database label)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.items.0.directory', true)
            ->assertJsonPath('data.0.items.0.database', false)
            ->assertJsonPath('data.0.items.1.directory', false)
            ->assertJsonPath('data.0.items.1.database', true);
    }

    /**
     * A DinD named-volume item is the Engine's third item type; it is neither
     * the CA's files archive nor a database dump, so it reports both false
     * rather than copying the backup-level flags.
     */
    public function test_list_reports_a_volume_item_as_neither_files_nor_database(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/System/Project/Backup.php:685 -> a DinD named volume is item type 'volume'
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5, ['items' => [
                ['id' => 11, 'remote_path' => 'backups/site1/5/volume-db.tar.gz', 'size_bytes' => 512, 'details' => [
                    'type' => 'volume', 'name' => 'db', 'docker_name' => 'site1-db', 'sha256' => str_repeat('c', 64),
                ]],
            ]]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:12-14 (the directory/database label)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.items.0.directory', false)
            ->assertJsonPath('data.0.items.0.database', false);
    }

    public function test_list_reports_item_type_name_and_backup_parts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5, ['items' => [
                ['id' => 9, 'remote_path' => 'backups/site1/5/files.tar.gz', 'size_bytes' => 1, 'details' => ['type' => 'files', 'name' => 'files']],
                ['id' => 10, 'remote_path' => 'backups/site1/5/volume-db.tar.gz', 'size_bytes' => 1, 'details' => ['type' => 'volume', 'name' => 'db']],
                ['id' => 11, 'remote_path' => 'backups/site1/5/database-app.sql.gz', 'size_bytes' => 1, 'details' => ['type' => 'database', 'name' => 'app']],
            ]]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/views/instance/Backups.vue:255-258 (directory, database, items)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.items.0.type', 'files')
            ->assertJsonPath('data.0.items.0.name', 'files')
            ->assertJsonPath('data.0.items.0.directory', true)
            ->assertJsonPath('data.0.items.1.type', 'volume')
            ->assertJsonPath('data.0.items.1.name', 'db')
            ->assertJsonPath('data.0.items.1.directory', false)
            ->assertJsonPath('data.0.items.1.database', false)
            ->assertJsonPath('data.0.items.2.type', 'database')
            ->assertJsonPath('data.0.directory', true)
            ->assertJsonPath('data.0.database', true)
            ->assertJsonPath('data.0.parts.files', true)
            ->assertJsonPath('data.0.parts.volumes', ['db'])
            ->assertJsonPath('data.0.parts.databases', ['app']);
    }

    public function test_list_reports_null_parts_without_items_or_while_the_backup_is_running(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5, ['items' => []]),
            $this->engineBackup(6, ['async_status' => ['backup' => 'running']]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/views/instance/Backups.vue:258 (items)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.parts', null)
            ->assertJsonCount(2, 'data.1.items')
            ->assertJsonPath('data.1.parts', null);
    }

    public function test_list_reports_null_parts_when_no_item_has_a_known_type(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
        Http::fake(['engine.example.com/api/projects/site1/backups' => Http::response(['data' => [
            $this->engineBackup(5, ['items' => [
                ['id' => 9, 'remote_path' => 'backups/site1/5/archive.tar.gz', 'size_bytes' => 1, 'details' => []],
            ]]),
        ]])]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        // CA reads: packages/client-area/src/views/instance/Backups.vue:258 (items)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/backups")
            ->assertOk()
            ->assertJsonPath('data.0.items.0.type', null)
            ->assertJsonPath('data.0.parts', null);
    }

    public function test_restore_rejects_a_request_that_bypasses_the_ca_confirmation(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): the refusal happens before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response([], 200)]);

        // The CA's modal is the confirmation and sends no `confirm` field
        // (BackupActionsMixin.js:310-337); an explicit `confirm:false` bypasses
        // it and is refused.
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:328
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/backups/5/restore", [
                'restoreDirectory' => true,
                'restoreDatabase' => true,
                'confirm' => false,
            ])
            ->assertStatus(422)
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:334 (the modal shows the error)
            ->assertJsonValidationErrors('confirm');

        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/backups/5/restore'));
    }

    public function test_restore_maps_the_ca_booleans_to_the_engine_filter(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/BackupController.php:211 -> BackupController::restore (202)
        Http::fake(['engine.example.com/api/projects/site1/backups/5/restore' => Http::response(['data' => $this->engineBackup(5, [
            'async_status' => ['restore' => 'pending', 'task_id' => 8],
        ])], 202)]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:328
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:334
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/backups/5/restore", [
                'restoreDirectory' => false,
                'restoreDatabase' => true,
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/api/projects/site1/backups/5/restore')
            && $r['confirm'] === true
            && $r['exclude'] === ['files' => true]);

        Queue::assertPushed(WatchBackupTaskJob::class, fn (WatchBackupTaskJob $job): bool => $job->action === 'restore'
            && $job->taskId === 8
            && $job->finishedType === 'user.instance.backup.restore_finished');
    }

    public function test_delete_starts_the_engine_delete_and_watches_it(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
        // Engine: core/app/Http/Controllers/User/BackupController.php:268 -> BackupController::destroy (202)
        Http::fake([
            'engine.example.com/api/projects/site1/backups/5' => function ($request) {
                if ($request->method() === 'DELETE') {
                    return Http::response(['data' => $this->engineBackup(5, [
                        'async_status' => ['delete' => 'pending', 'task_id' => 9],
                    ])], 202);
                }

                // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
                return Http::response(['data' => $this->engineBackup(5)]);
            },
        ]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:59
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:63
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/backups/5")
            ->assertOk()
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($r) => $r->method() === 'DELETE' && str_ends_with($r->url(), '/api/projects/site1/backups/5'));

        Queue::assertPushed(WatchBackupTaskJob::class, fn (WatchBackupTaskJob $job): bool => $job->action === 'delete'
            && $job->taskId === 9
            && $job->failedType === 'user.instance.backup.delete_failed');
    }

    public function test_delete_refuses_a_backup_the_engine_is_still_writing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
        // Engine: core/app/System/Project/Backup.php:66 -> saveBackupStatus('running') while the backup is written
        Http::fake(['engine.example.com/api/projects/site1/backups/5' => Http::response(['data' => $this->engineBackup(5, [
            'async_status' => ['backup' => 'running'],
        ])])]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:59
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:65
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/backups/5")
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
    }

    public function test_download_streams_the_engine_body_with_its_headers(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupController.php:302 -> BackupController::download
        Http::fake(['engine.example.com/api/projects/site1/backups/5/items/9/download' => Http::response('GZIP-BYTES', 200, [
            'Content-Type' => 'application/gzip',
            'Content-Length' => '10',
        ])]);

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:439
        // CA reads: packages/client-area/src/mixins/BackupActionsMixin.js:439 (the browser saves the stream)
        $response = $this->actingAs($user)
            ->get("/api/projects/{$application->id}/wordpress/backups/5/item/9/download");

        $response->assertOk();
        $this->assertSame('application/gzip', $response->headers->get('Content-Type'));
        $this->assertSame('GZIP-BYTES', $response->streamedContent());
    }

    public function test_automatic_backup_defaults_a_project_without_a_schedule_to_the_panel_default(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/router/fetchData.js:94
        // The switch stays off (`never`); the time is the Settings default hour and the project's own minute, so the
        // dialog opens at the schedule the sweep would create instead of midnight.
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->assertJsonPath('data.frequency', 'never')
            ->assertJsonPath('data.cron_hour', '3')
            ->assertJsonPath('data.cron_minute', (string) (crc32('site1') % 60));
    }

    public function test_automatic_backup_maps_the_engine_schedule_to_the_old_frequency(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        // Engine: core/app/Http/Resources/BackupScheduleResource.php:10 -> BackupScheduleResource::toArray
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => [
            'container_id' => 3,
            'cron' => '30 3 * * 2',
            'keep_last' => 7,
            'files' => true,
            'databases' => true,
            'enabled' => true,
            'next_run_at' => '2026-10-11T03:30:00.000000Z',
            'last_run_at' => null,
            'last_backup_id' => null,
            'last_error' => null,
        ]]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/router/fetchData.js:94
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->assertJsonPath('data.frequency', 'weekly')
            ->assertJsonPath('data.cron_hour', '3')
            ->assertJsonPath('data.cron_minute', '30')
            ->assertJsonPath('data.cron_day_of_week', '2');
    }

    public function test_automatic_backup_reports_whether_a_store_is_configured(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);
        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/components/backups/BackupAutomaticSwitcher.vue:20 (store_configured; Phase 4)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->assertJsonPath('data.store_configured', true);
    }

    public function test_automatic_backup_reports_no_store_when_the_engine_has_no_container(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);
        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/components/backups/BackupAutomaticSwitcher.vue:20 (store_configured; Phase 4)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->assertJsonPath('data.store_configured', false);
    }

    public function test_automatic_backup_omits_store_configured_when_the_container_list_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['message' => 'boom'], 500),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/router/fetchData.js:94
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->assertJsonPath('data.frequency', 'never');
        $this->assertArrayNotHasKey('store_configured', $response->json('data'));
    }

    public function test_update_automatic_backup_builds_the_engine_cron(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:67 -> BackupScheduleController::update
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:110
        // CA reads: packages/client-area/src/router/fetchData.js:110
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/automatic-backup", [
                'frequency' => 'daily',
                'cron_hour' => 4,
                'cron_minute' => 15,
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/api/projects/site1/backup-schedule')
            && $r['container'] === '3'
            && $r['cron'] === '15 4 * * *');
    }

    public function test_update_automatic_backup_never_removes_the_schedule(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:102 -> BackupScheduleController::destroy
        Http::fake(['engine.example.com/api/projects/site1/backup-schedule' => Http::response('', 204)]);

        // CA: packages/client-area/src/router/fetchData.js:110
        // CA reads: packages/client-area/src/router/fetchData.js:110
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/automatic-backup", ['frequency' => 'never'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE' && str_ends_with($r->url(), '/api/projects/site1/backup-schedule'));
    }

    public function test_backup_routes_require_authentication(): void
    {
        // CA: packages/client-area/src/views/instance/Backups.vue:263
        $this->getJson('/api/projects/1/wordpress/backups')->assertUnauthorized();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
        $this->postJson('/api/projects/1/wordpress/backups')->assertUnauthorized();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:328
        $this->putJson('/api/projects/1/wordpress/backups/5/restore')->assertUnauthorized();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:59
        $this->deleteJson('/api/projects/1/wordpress/backups/5')->assertUnauthorized();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:439
        $this->getJson('/api/projects/1/wordpress/backups/5/item/9/download')->assertUnauthorized();
        // CA: packages/client-area/src/router/fetchData.js:94
        $this->getJson('/api/projects/1/wordpress/automatic-backup')->assertUnauthorized();
        // CA: packages/client-area/src/router/fetchData.js:110
        $this->putJson('/api/projects/1/wordpress/automatic-backup')->assertUnauthorized();
    }

    public function test_backup_writes_keep_the_old_wordpress_privileges(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->denyPrivilege('wordpress.manage_backups');

        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
        $this->actingAs($user)->postJson("/api/projects/{$application->id}/wordpress/backups", ['backupDirectory' => true])->assertForbidden();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:328
        $this->actingAs($user)->putJson("/api/projects/{$application->id}/wordpress/backups/5/restore")->assertForbidden();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:59
        $this->actingAs($user)->deleteJson("/api/projects/{$application->id}/wordpress/backups/5")->assertForbidden();
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:439
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/backups/5/item/9/download")->assertForbidden();

        $this->denyPrivilege('wordpress.manage_auto_backup');
        // CA: packages/client-area/src/router/fetchData.js:110
        $this->actingAs($user)->putJson("/api/projects/{$application->id}/wordpress/automatic-backup", ['frequency' => 'never'])->assertForbidden();
    }

    public function test_backup_routes_answer_503_when_the_engine_connection_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('Engine down')]);

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/backups")->assertStatus(503);
        // CA: packages/client-area/src/router/fetchData.js:94
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")->assertStatus(503);
    }
}
