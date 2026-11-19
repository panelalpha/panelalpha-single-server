<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\Community\Jobs\ApplyNewProjectBackupSchedules;
use PanelAlpha\Community\Backups\BackupDefaults;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The per-minute sweep that gives each new project the default automatic-backup
 * schedule (decision table: skip, schedule, wait or fail).
 */
class NewProjectBackupScheduleTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Carbon::setTestNow('2026-10-16 12:00:00');
        // The panel was "installed" before the fixture project's Engine creation date.
        $this->settings()->set(BackupDefaults::AUTO_ENABLE_SINCE, '2025-12-31T00:00:00+00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function settings(): PanelSettings
    {
        return app(PanelSettings::class);
    }

    /**
     * A project this panel created: the row the provisioner records
     * (`status` pending, `panel_created_at`), here active already.
     *
     * @param  array<string, mixed>  $project
     */
    private function newProject(string $username = 'site1', array $project = []): Application
    {
        $application = $this->syncedApplication(User::factory()->create(), $username, $project);
        DB::table('applications')->where('id', $application->id)->update([
            'panel_created_at' => '2026-01-01 00:00:00',
        ]);

        return $application->fresh();
    }

    /**
     * A project this panel did not create: the sync mirrored it from the
     * Engine's list (another panel's project, or the operator's `pae` one).
     *
     * @param  array<string, mixed>  $project
     */
    private function foreignProject(string $username = 'site1', array $project = []): Application
    {
        return $this->syncedApplication(User::factory()->create(), $username, $project);
    }

    private function sweep(): void
    {
        (new ApplyNewProjectBackupSchedules)->handle(
            app(\Illuminate\Contracts\Container\Container::class),
            app(\PanelAlpha\EngineClient\Contracts\EngineResolver::class),
            app(\PanelAlpha\EngineClient\EngineHealth::class),
            $this->settings(),
            app(BackupDefaults::class),
            app(\PanelAlpha\Community\Backups\SettingsBackupDestination::class),
        );
    }

    /**
     * @param  array<string, mixed>|null  $schedule  the project's current Engine schedule
     */
    private function fakeEngine(?array $schedule = null, int $scheduleStatus = 200, bool $store = true): void
    {
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:67 -> BackupScheduleController::update
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => $store ? [['id' => 3, 'name' => 'local']] : []]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => $schedule], $scheduleStatus),
        ]);
    }

    private function puts(): int
    {
        return collect(Http::recorded())->filter(fn ($pair) => $pair[0]->method() === 'PUT')->count();
    }

    public function test_the_migration_marks_existing_rows_skipped(): void
    {
        $this->newProject();
        DB::table('applications')->update(['auto_backup_state' => null]);

        $migration = require base_path('../packages/client-area/database/migrations/2026_10_16_100000_add_auto_backup_state_to_applications_table.php');
        $migration->down();
        $migration->up();

        $this->assertSame('skipped', Application::query()->firstOrFail()->auto_backup_state);
    }

    public function test_the_panel_created_column_back_fills_the_project_the_panel_was_creating(): void
    {
        $application = $this->foreignProject();
        DB::table('applications')->update(['panel_created_at' => null, 'status' => 'pending']);

        $migration = require base_path('../packages/client-area/database/migrations/2026_11_14_000000_add_panel_created_at_to_applications_table.php');
        $migration->down();
        $migration->up();

        $fresh = Application::query()->findOrFail($application->id);
        $this->assertNotNull($fresh->panel_created_at);
        $this->assertSame($fresh->created_at->toDateTimeString(), $fresh->panel_created_at->toDateTimeString());
    }

    public function test_a_project_another_panel_created_on_the_engine_is_not_swept(): void
    {
        $application = $this->foreignProject();
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertSame(0, $this->puts(), 'no Engine schedule may be created for a project this panel did not create');
        $this->assertNull($application->fresh()->auto_backup_state);
        $this->assertNull($application->fresh()->panel_created_at);
    }

    public function test_a_project_the_panel_adopts_later_is_not_swept(): void
    {
        $application = $this->foreignProject();
        // The panel takes the project over afterwards (a git connect mirrors it again).
        app(ApplicationSynchronizer::class)->mirror($application->engine_id, $this->engineProject(10, 'site1'));
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertSame(0, $this->puts());
        $this->assertNull($application->fresh()->auto_backup_state);
    }

    public function test_a_new_active_project_gets_the_settings_schedule(): void
    {
        $application = $this->newProject();
        $this->settings()->set(BackupDefaults::FREQUENCY, 'weekly');
        $this->settings()->set(BackupDefaults::HOUR, '1');
        $this->settings()->set(BackupDefaults::DAY_OF_WEEK, '5');
        $this->settings()->set(BackupDefaults::KEEP_LAST, '14');
        $this->fakeEngine(null);

        $this->sweep();

        $minute = crc32('site1') % 60;
        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/projects/site1/backup-schedule')
            && $r['container'] === '3'
            && $r['cron'] === "{$minute} 1 * * 5"
            && $r['keep_last'] === 14
            && $r['files'] === true
            && $r['databases'] === true
            && $r['enabled'] === true);
        $this->assertSame('scheduled', $application->fresh()->auto_backup_state);
    }

    public function test_the_default_schedule_uses_the_engines_default_store_when_the_panel_has_none(): void
    {
        $application = $this->newProject();
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [
                ['id' => 2, 'name' => 'a-local', 'default' => false],
                ['id' => 3, 'name' => 'z-remote', 'default' => true],
            ]]),
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => null]),
        ]);

        $this->sweep();

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/projects/site1/backup-schedule')
            && $r['container'] === '3');
        $this->assertSame('scheduled', $application->fresh()->auto_backup_state);
    }

    public function test_an_existing_schedule_is_not_overwritten(): void
    {
        $application = $this->newProject();
        $this->fakeEngine(['container_id' => 3, 'cron' => '0 5 * * *', 'keep_last' => 30]);

        $this->sweep();

        $this->assertSame(0, $this->puts());
        $this->assertSame('scheduled', $application->fresh()->auto_backup_state);
    }

    public function test_the_switch_off_skips_the_project(): void
    {
        $application = $this->newProject();
        $this->settings()->set(BackupDefaults::AUTO_ENABLE, '0');
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertSame(0, $this->puts());
        $this->assertSame('skipped', $application->fresh()->auto_backup_state);

        // Turning the switch back on does not revive a decided project.
        $this->settings()->set(BackupDefaults::AUTO_ENABLE, '1');
        $this->sweep();
        $this->assertSame(0, $this->puts());
        $this->assertSame('skipped', $application->fresh()->auto_backup_state);
    }

    public function test_no_store_skips_the_project(): void
    {
        $application = $this->newProject();
        $this->fakeEngine(null, store: false);

        $this->sweep();

        $this->assertSame(0, $this->puts());
        $this->assertSame('skipped', $application->fresh()->auto_backup_state);
    }

    public function test_a_pending_project_is_left_for_the_next_run(): void
    {
        $application = $this->newProject();
        DB::table('applications')->update(['status' => 'pending']);
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertNull($application->fresh()->auto_backup_state);
        $this->assertSame(0, $this->puts());
    }

    public function test_a_failed_project_is_skipped(): void
    {
        $application = $this->newProject();
        $application->forceFill(['status' => 'failed'])->save();
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertSame('skipped', $application->fresh()->auto_backup_state);
    }

    public function test_the_first_run_writes_the_enable_since_marker_once(): void
    {
        $this->settings()->forget(BackupDefaults::AUTO_ENABLE_SINCE);
        $this->fakeEngine(null);

        $this->sweep();
        $first = $this->settings()->get(BackupDefaults::AUTO_ENABLE_SINCE);
        $this->assertNotNull($first);

        Carbon::setTestNow('2026-10-16 13:00:00');
        $this->sweep();
        $this->assertSame($first, $this->settings()->get(BackupDefaults::AUTO_ENABLE_SINCE));
    }

    public function test_a_row_synced_for_a_project_older_than_the_marker_is_skipped_and_one_without_a_date_waits(): void
    {
        $old = $this->newProject();
        $this->settings()->set(BackupDefaults::AUTO_ENABLE_SINCE, '2026-06-01T00:00:00+00:00');
        $this->fakeEngine(null);

        $this->sweep();
        $this->assertSame('skipped', $old->fresh()->auto_backup_state);
        $this->assertSame(0, $this->puts());

        DB::table('applications')->update(['auto_backup_state' => null, 'engine_created_at' => null]);
        $this->sweep();
        $this->assertNull($old->fresh()->auto_backup_state);
    }

    public function test_staging_and_the_panel_project_are_never_selected(): void
    {
        $parent = $this->newProject();
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'stage1',
            'status' => 'active',
            'staging_of_id' => $parent->id,
            'engine_created_at' => '2026-02-01 00:00:00',
        ]);
        DB::table('applications')->where('id', $parent->id)->update(['auto_backup_state' => 'skipped']);
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertNull($staging->fresh()->auto_backup_state);
        $this->assertSame(0, $this->puts());
    }

    public function test_an_engine_error_keeps_the_project_undecided_then_fails_it_after_an_hour(): void
    {
        $application = $this->newProject();
        $this->fakeEngine(null, 500);
        Log::spy();

        $this->sweep();
        $fresh = $application->fresh();
        $this->assertNull($fresh->auto_backup_state);
        $this->assertNotNull($fresh->auto_backup_attempted_at);

        Carbon::setTestNow('2026-10-16 12:30:00');
        $this->sweep();
        $this->assertNull($application->fresh()->auto_backup_state, 'still inside the hour');

        Carbon::setTestNow('2026-10-16 13:01:00');
        $this->sweep();
        $this->assertSame('failed', $application->fresh()->auto_backup_state);
        Log::shouldHaveReceived('warning')->once();
    }

    public function test_a_not_found_project_is_retried_like_any_engine_error(): void
    {
        $application = $this->newProject();
        $this->fakeEngine(null, 404);

        $this->sweep();

        $this->assertNull($application->fresh()->auto_backup_state);
    }

    public function test_the_store_is_looked_up_once_per_sweep(): void
    {
        $first = $this->newProject('site1');
        $second = Application::query()->create([
            'engine_id' => $first->engine_id,
            'engine_username' => 'site2',
            'status' => 'active',
            'engine_created_at' => '2026-02-01 00:00:00',
            'panel_created_at' => '2026-02-01 00:00:00',
        ]);
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
        // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:67 -> BackupScheduleController::update
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
            'engine.example.com/api/projects/*/backup-schedule' => Http::response(['data' => null]),
        ]);

        $this->sweep();

        $lists = collect(Http::recorded())->filter(fn ($pair) => $pair[0]->method() === 'GET' && str_ends_with($pair[0]->url(), '/backup-containers'));
        $this->assertCount(1, $lists);
        $this->assertSame(2, $this->puts());
        $this->assertSame('scheduled', $first->fresh()->auto_backup_state);
        $this->assertSame('scheduled', $second->fresh()->auto_backup_state);
    }

    public function test_the_sweep_does_nothing_outside_single_user_mode(): void
    {
        $application = $this->newProject();
        $this->bindMultiUserEdition([]);
        $this->fakeEngine(null);

        $this->sweep();

        $this->assertNull($application->fresh()->auto_backup_state);
        $this->assertSame(0, $this->puts());
    }
}
