<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectBackupsJob;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

final class ProjectBackupDetailsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user, 'site1');
    }

    /**
     * @param  list<array<string, mixed>>  $backups
     * @param  array<string, mixed>|null  $schedule
     */
    private function fakeEngine(array $backups = [], ?array $schedule = null): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/BackupController.php:53 -> BackupController::index
            'engine.example.com/api/projects/site1/backups' => Http::response(['data' => $backups]),
            // Engine: core/app/Http/Controllers/User/BackupScheduleController.php:32 -> BackupScheduleController::show
            'engine.example.com/api/projects/site1/backup-schedule' => Http::response(['data' => $schedule]),
            'engine.example.com/api/backup-containers' => Http::response(['data' => [['id' => 3, 'name' => 'local']]]),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function engineBackup(string $createdAt, string $status = 'completed', string $kind = 'manual'): array
    {
        // Engine: core/app/Http/Resources/BackupResource.php:12 -> BackupResource::toArray
        return [
            'id' => 5,
            'username' => 'site1',
            'container_id' => 3,
            'kind' => $kind,
            'note' => null,
            'contents' => ['files' => true, 'databases' => true],
            'async_status' => ['backup' => $status],
            'size_bytes' => 2048,
            'created_at' => $createdAt,
            'items' => [],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function engineSchedule(): array
    {
        // Engine: core/app/Http/Resources/BackupScheduleResource.php:10 -> BackupScheduleResource::toArray
        return ['container_id' => 3, 'cron' => '30 3 * * 2', 'keep_last' => 7, 'enabled' => true];
    }

    private function queuedRefreshes(): int
    {
        return DB::table('jobs')->where('payload', 'like', '%RefreshProjectBackupsJob%')->count();
    }

    public function test_a_first_view_queues_the_refresh_and_calls_no_engine_endpoint(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup, unknown until the refresh ran)
            ->assertJsonPath('data.needs_recent_backup_warning', false)
            ->assertJsonPath('data.has_automatic_backup', null);

        Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), 'backup'));
        $this->assertSame(1, $this->queuedRefreshes());
    }

    public function test_a_project_without_any_backup_or_schedule_is_warned(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine();

        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', true)
            ->assertJsonPath('data.has_automatic_backup', false);
        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_a_backup_finished_within_a_day_clears_the_warning(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine([
            $this->engineBackup(now()->subHours(30)->toIso8601String()),
            $this->engineBackup(now()->subHours(2)->toIso8601String()),
        ]);

        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', false);
    }

    public function test_a_failed_or_old_backup_does_not_clear_the_warning(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine([
            $this->engineBackup(now()->subHours(2)->toIso8601String(), 'failed'),
            $this->engineBackup(now()->subHours(30)->toIso8601String()),
        ]);

        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', true);
    }

    public function test_a_schedule_counts_as_covered(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine([], $this->engineSchedule());

        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', false)
            ->assertJsonPath('data.has_automatic_backup', true);
    }

    public function test_a_project_younger_than_a_day_is_not_warned(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['engine_created_at' => now()->subHours(2)])->save();
        $this->fakeEngine();

        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', false)
            ->assertJsonPath('data.has_automatic_backup', false);
    }

    public function test_the_backups_list_and_the_schedule_the_ca_reads_fill_the_facts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine();

        // CA: packages/client-area/src/views/instance/Backups.vue:263
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/backups")->assertOk();
        // CA: packages/client-area/src/router/fetchData.js:94
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/automatic-backup")->assertOk();

        // CA: src/apis/Instances.js:17
        $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()
            // CA reads: src/components/topbar/InstanceTopBarTabs.vue:80 (shouldHaveRecentBackup; has_automatic_backup at src/apis/Instances.js:228)
            ->assertJsonPath('data.needs_recent_backup_warning', true);
        $this->assertSame(0, $this->queuedRefreshes());
    }

    public function test_the_list_never_carries_the_facts_nor_queues_the_refresh(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeEngine();
        RefreshProjectBackupsJob::dispatchSync($application->id);

        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk()
            // CA reads: src/apis/Instances.js:388 (shouldHaveRecentBackup of a listed project)
            ->assertJsonPath('data.0.needs_recent_backup_warning', false);
        $this->assertSame(0, $this->queuedRefreshes());
    }
}
