<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * The scheduler keeps the local mirror fresh without a
 * user request, and the job survives an unconfigured/down Engine.
 * @see Engine core/routes/api.php:141 (GET /projects/all)
 */
class SyncEnginesJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_sync_engines_job_mirrors_the_engine_projects(): void
    {
        $this->configureEngine();
        Http::preventStrayRequests();
        Http::fake([
// Engine: core/app/Http/Controllers/UserController.php:122
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
// Engine: core/app/Http/Controllers/User/UsageController.php:33 -> UsageController::getUsage, core/app/Lib/Usage/ProjectUsage.php:23 -> summary
            'engine.example.com/api/projects/site1/usage*' => Http::response($this->engineUsage()),
            // The job also queues WordPress detection.
// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/site1/wp/core*' => Http::response(['data' => ['installed' => false, 'version' => null, 'state' => 'no_core']]),
        ]);

        (new SyncEnginesJob)->handle(
            app(\PanelAlpha\EngineClient\Contracts\EngineResolver::class),
            app(\PanelAlpha\ClientArea\Sync\ApplicationSynchronizer::class),
            app(\PanelAlpha\EngineClient\EngineHealth::class),
        );

        $this->assertDatabaseHas('applications', [
            'engine_username' => 'site1',
            'engine_project_id' => 10,
        ]);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/projects/all'));
    }

    /**
     * The panel keeps no usage cache, so a real sync reads no
     * `E:/usage` (the usage stub is here to catch a read that would otherwise
     * fail as a stray request) and the mirror has no usage column; storage
     * comes from the synced project's `disk` (`ProjectStatsTest`).
     */
    public function test_the_sync_job_reads_no_usage(): void
    {
        $this->configureEngine();
        Http::fake([
// Engine: core/app/Http/Controllers/UserController.php:122
            'engine.example.com/api/projects/all*' => Http::response(['data' => [
                $this->engineProject(10, 'site1'),
            ]]),
// Engine: core/app/Http/Controllers/User/UsageController.php:33 -> UsageController::getUsage, core/app/Lib/Usage/ProjectUsage.php:23 -> summary
            'engine.example.com/api/projects/site1/usage*' => Http::response($this->engineUsage()),
        ]);

        (new SyncEnginesJob)->handle(
            app(EngineResolver::class),
            app(ApplicationSynchronizer::class),
            app(EngineHealth::class),
        );

        Http::assertSent(fn ($request) => str_contains($request->url(), '/projects/all'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/usage'));
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1']);
        $this->assertFalse(Schema::hasColumn('applications', 'engine_usage'));
    }

    public function test_the_sync_job_announces_engine_projects_synced(): void
    {
        // A real sync used to call
        // ApplicationSynchronizer::syncUsage() directly; it now fires
        // EngineProjectsSynced, which the controller provider delivers.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);

        Event::fake([EngineProjectsSynced::class]);

        (new SyncEnginesJob)->handle(
            app(EngineResolver::class),
            app(ApplicationSynchronizer::class),
            app(EngineHealth::class),
        );

        Event::assertDispatched(
            EngineProjectsSynced::class,
            fn (EngineProjectsSynced $event): bool => $event->engineId === EngineConnection::DEFAULT_ID,
        );
    }

    public function test_a_down_engine_is_skipped_by_the_sync_fan_out(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        app(EngineHealth::class)->open(1);

        (new SyncEnginesJob)->handle(
            app(EngineResolver::class),
            app(ApplicationSynchronizer::class),
            app(EngineHealth::class),
        );

        // No doomed sync while the breaker is open.
        Http::assertNothingSent();
        $this->assertSame(0, Application::query()->count());
    }

    public function test_sync_engines_job_ignores_an_unconfigured_engine(): void
    {
        // No settings: the resolver throws EngineNotConfiguredException, which
        // the job must swallow (report + continue) so the scheduler is quiet.
        (new SyncEnginesJob)->handle(
            app(\PanelAlpha\EngineClient\Contracts\EngineResolver::class),
            app(\PanelAlpha\ClientArea\Sync\ApplicationSynchronizer::class),
            app(\PanelAlpha\EngineClient\EngineHealth::class),
        );

        $this->assertSame(0, Application::query()->count());
    }

    public function test_scheduler_runs_the_engine_sync_every_minute(): void
    {
        $events = collect(app(Schedule::class)->events());
        $sync = $events->first(fn ($event) => ($event->description ?? '') === 'sync-engines');

        $this->assertNotNull($sync, 'The sync-engines schedule is not registered.');
        $this->assertSame('* * * * *', $sync->expression);
    }
}
