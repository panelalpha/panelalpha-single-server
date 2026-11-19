<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * BackupService branches the route tests in `Hosting/BackupTest` do not reach:
 * refusals before an Engine call, restore scope, schedule frequencies and the
 * schedule read for a cron the panel cannot parse.
 */
class BackupServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function service(): BackupService
    {
        return app(BackupService::class);
    }

    private function application(): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1', ['details' => ['template' => 'dind']]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function engineBackup(array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/BackupResource.php:12 -> BackupResource::toArray
        return array_merge([
            'id' => 5,
            'username' => 'site1',
            'container_id' => 3,
            'kind' => 'manual',
            'note' => null,
            'contents' => ['files' => true, 'databases' => true],
            'async_status' => ['backup' => 'completed', 'source' => 'api'],
            'error' => null,
            'size_bytes' => 10,
            'created_at' => '2026-10-10T12:00:00.000000Z',
            'items' => [],
        ], $overrides);
    }

    public function test_create_is_refused_for_a_project_that_is_not_ready(): void
    {
        $application = $this->application();
        $application->status = 'failed';

        try {
            $this->service()->create($application, ['backupDirectory' => true]);
            $this->fail('A failed project must not start a backup.');
        } catch (ValidationException $e) {
            $this->assertSame([BackupService::INVALID_ACTION], $e->errors()[0]);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'backup'));
    }

    public function test_create_is_refused_when_neither_files_nor_databases_are_chosen(): void
    {
        $application = $this->application();

        try {
            $this->service()->create($application, ['backupDirectory' => false, 'backupDatabase' => false]);
            $this->fail('A backup of nothing must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Choose files or databases to back up.'], $e->errors()['backupDirectory']);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'backup'));
    }

    public function test_create_without_a_task_id_dispatches_no_watcher(): void
    {
        $application = $this->application();
        Queue::fake();

        // Engine: core/app/Http/Controllers/BackupContainerController.php:31 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupController.php:87 -> BackupController::store (202 + BackupResource)
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backups' => Http::response(['data' => $this->engineBackup()], 202),
        ]);

        $result = $this->service()->create($application, ['backupDatabase' => true]);

        $this->assertSame(5, $result['data']['id']);
        Queue::assertNotPushed(WatchBackupTaskJob::class);
    }

    public function test_present_reports_no_date_for_a_backup_without_created_at(): void
    {
        $this->assertNull($this->service()->present($this->engineBackup(['created_at' => null]))['date']);
    }

    /**
     * @return array<string, array{array<string, mixed>, array<string, mixed>}>
     */
    public static function restoreScopeProvider(): array
    {
        return [
            'files only' => [
                ['restoreDirectory' => true, 'restoreDatabase' => false],
                ['confirm' => true, 'only' => ['files' => true], 'delete_existing_files' => true],
            ],
            'databases only' => [
                ['restoreDirectory' => false, 'restoreDatabase' => true],
                ['confirm' => true, 'exclude' => ['files' => true]],
            ],
            'both, keep existing files' => [
                ['restoreDirectory' => true, 'restoreDatabase' => true, 'deleteExistingFiles' => false],
                ['confirm' => true, 'delete_existing_files' => false],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  array<string, mixed>  $expected
     */
    #[DataProvider('restoreScopeProvider')]
    public function test_restore_sends_the_scope_the_user_chose(array $params, array $expected): void
    {
        $application = $this->application();
        Queue::fake();

        // Engine: core/app/Http/Controllers/User/BackupController.php:170 -> BackupController::restore (202 + BackupResource)
        Http::fake(['engine.example.com/api/projects/site1/backups/5/restore' => Http::response(['data' => $this->engineBackup()], 202)]);

        $this->service()->restore($application, 5, $params);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/backups/5/restore') && $request->data() === $expected);
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function invalidScheduleProvider(): array
    {
        return [
            'custom without a cron' => [['frequency' => 'custom']],
            'custom with a bad cron' => [['frequency' => 'custom', 'cron_frequency' => 'every day']],
            'unknown frequency' => [['frequency' => 'hourly']],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     */
    #[DataProvider('invalidScheduleProvider')]
    public function test_automatic_backup_refuses_an_invalid_frequency(array $params): void
    {
        $application = $this->application();

        try {
            $this->service()->updateAutomaticBackup($application, $params);
            $this->fail('An invalid frequency must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame([BackupService::INVALID_FREQUENCY], $e->errors()[0]);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'backup'));
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function scheduleCronProvider(): array
    {
        return [
            'daily' => [['frequency' => 'daily', 'cron_minute' => 5, 'cron_hour' => 4], '5 4 * * *'],
            'weekly' => [['frequency' => 'weekly', 'cron_minute' => 5, 'cron_hour' => 4, 'cron_day_of_week' => 2], '5 4 * * 2'],
            'weekly default day' => [['frequency' => 'weekly'], '0 0 * * 0'],
            'monthly' => [['frequency' => 'monthly', 'cron_minute' => 5, 'cron_hour' => 4, 'cron_day_of_month' => 9], '5 4 9 * *'],
            'monthly default day' => [['frequency' => 'monthly'], '0 0 1 * *'],
            'custom' => [['frequency' => 'custom', 'cron_frequency' => '*/15 * * * *'], '*/15 * * * *'],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     */
    #[DataProvider('scheduleCronProvider')]
    public function test_automatic_backup_sends_the_utc_cron_of_the_chosen_frequency(array $params, string $cron): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/BackupContainerController.php:31 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show; :67 -> update
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        $this->service()->updateAutomaticBackup($application, $params);

        Http::assertSent(fn ($request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/backup-schedule')
            && $request['cron'] === $cron
            && $request['container'] === '3');
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function scheduleReadProvider(): array
    {
        return [
            'daily' => ['0 3 * * *', 'daily', '3'],
            'monthly' => ['0 3 9 * *', 'monthly', '3'],
            'both day fields set' => ['0 3 9 * 2', 'custom', '3'],
            'a cron the panel cannot parse' => ['not a cron', 'custom', '0'],
        ];
    }

    #[DataProvider('scheduleReadProvider')]
    public function test_automatic_backup_reads_the_frequency_from_the_engine_cron(string $cron, string $frequency, string $hour): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/BackupContainerController.php:31 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        // Engine: core/app/Http/Resources/BackupScheduleResource.php:10 -> BackupScheduleResource::toArray
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => [
                'container_id' => 3,
                'cron' => $cron,
                'keep_last' => 7,
                'enabled' => true,
            ]]),
        ]);

        $schedule = $this->service()->automaticBackup($application);

        $this->assertSame($frequency, $schedule['frequency']);
        $this->assertSame($hour, $schedule['cron_hour']);
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function refusedDownloadProvider(): array
    {
        return [
            'with the Engine message' => [['message' => 'Backup not completed.'], 'Backup not completed.'],
            'without a message' => [['errors' => []], 'Engine API request failed with HTTP 409.'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('refusedDownloadProvider')]
    public function test_a_refused_backup_download_keeps_the_engine_status_and_message(array $body, string $message): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        // Engine: core/app/Http/Controllers/User/BackupController.php:267 -> BackupController::download (a refusal)
        Http::fake(['engine.example.com/api/projects/site1/backups/5/items/9/download' => Http::response($body, 409)]);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/mixins/BackupActionsMixin.js:439
            ->get("/api/projects/{$application->id}/wordpress/backups/5/item/9/download", ['Accept' => 'application/json']);

        $response->assertStatus(409);
        $this->assertSame($message, $response->json('message'));
    }
}
