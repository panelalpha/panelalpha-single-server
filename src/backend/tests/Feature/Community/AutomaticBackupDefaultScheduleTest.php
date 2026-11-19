<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Community\Backups\BackupDefaults;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The time the Automatic Backups dialog starts at for a project without a
 * schedule: the hour of Settings > Backups and the project's own minute, the
 * same cron `ApplyNewProjectBackupSchedules` gives a project the panel creates.
 */
class AutomaticBackupDefaultScheduleTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function settings(): PanelSettings
    {
        return app(PanelSettings::class);
    }

    /**
     * @param  array<string, mixed>  $schedule  the Engine answer (`data` of the schedule route)
     * @return array<string, mixed> the `data` of the panel's automatic-backup answer
     */
    private function automaticBackup(User $user, string $username = 'site1', array|string|null $schedule = null): array
    {
        $application = $this->syncedApplication($user, $username);

        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/*/backup-schedule' => Http::response(['data' => $schedule]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:94
        // CA reads: packages/client-area/src/router/fetchData.js:94
        return $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")
            ->assertOk()
            ->json('data');
    }

    public function test_a_project_without_a_schedule_starts_at_the_settings_hour_and_its_own_minute(): void
    {
        $this->settings()->set(BackupDefaults::HOUR, '6');

        $data = $this->automaticBackup(User::factory()->create(), 'site1');

        $this->assertSame('never', $data['frequency']);
        $this->assertSame('6', $data['cron_hour']);
        $this->assertSame((string) (crc32('site1') % 60), $data['cron_minute']);
        $this->assertNull($data['cron_frequency']);
    }

    public function test_the_start_time_follows_the_settings_after_a_change(): void
    {
        $this->settings()->set(BackupDefaults::HOUR, '21');

        $data = $this->automaticBackup(User::factory()->create(), 'site2');

        $this->assertSame('21', $data['cron_hour']);
        $this->assertSame((string) (crc32('site2') % 60), $data['cron_minute']);
    }

    public function test_a_schedule_the_project_already_has_is_presented_as_it_is(): void
    {
        $this->settings()->set(BackupDefaults::HOUR, '6');

        // Engine: core/app/Http/Resources/BackupScheduleResource.php:10 -> BackupScheduleResource::toArray
        $data = $this->automaticBackup(User::factory()->create(), 'site1', [
            'container_id' => 3,
            'cron' => '42 3 * * *',
            'keep_last' => 7,
            'files' => true,
            'databases' => true,
            'enabled' => true,
        ]);

        $this->assertSame('daily', $data['frequency']);
        $this->assertSame('42 3 * * *', $data['cron_frequency']);
        $this->assertSame('3', $data['cron_hour']);
        $this->assertSame('42', $data['cron_minute']);
    }
}
