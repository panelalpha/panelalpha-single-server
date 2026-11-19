<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * @see Engine core/routes/api.php:141 (GET /projects/all), core/app/Http/Resources/UserResource.php
 */
class ApplicationSynchronizerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function synchronizer(): ApplicationSynchronizer
    {
        return $this->app->make(ApplicationSynchronizer::class);
    }

    public function test_sync_mirrors_projects_and_links_stagings(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['staging' => 'site1stg']),
            $this->engineProject(11, 'site1stg', ['staging_of' => 'site1']),
        ]])]);

        $result = $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(['upserted' => 2, 'deleted' => 0, 'inserted' => ['site1', 'site1stg']], $result);
        $live = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $staging = Application::query()->where('engine_username', 'site1stg')->firstOrFail();
        $this->assertSame(10, $live->engine_project_id);
        $this->assertSame('site1.example.com', $live->domain);
        $this->assertNull($live->staging_of_id);
        $this->assertSame($live->id, $staging->staging_of_id);
        $this->assertSame(['site1.example.com'], $live->engine_payload['domain_names']);
        $this->assertNotNull($live->synced_at);
    }

    /**
     * The Engine's project `status` is its suspension state (`active` from
     * the start), so a panel-created row stays `pending` while the Engine still
     * runs a task for it, and turns `active` once none is left (live API suite,
     * 2026-11-04: calls right after the create failed while the account was
     * still coming up, Engine #1527).
     */
    public function test_a_pending_row_stays_pending_while_its_create_task_runs(): void
    {
        $this->configureEngine();
        Application::query()->create(['engine_id' => EngineConnection::DEFAULT_ID, 'engine_username' => 'site1', 'domain' => 'site1.example.com', 'status' => 'pending']);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (`status=active`, `scope=all`, `username`, `per_page=1`)
        Http::fakeSequence('engine.example.com/api/tasks*')
            ->push(['data' => [['id' => 7, 'username' => 'site1', 'status' => 'running', 'action' => 'deploy']], 'meta' => ['last_page' => 1, 'total' => 1]])
            ->push(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $this->assertSame('pending', Application::query()->where('engine_username', 'site1')->value('status'));

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $this->assertSame('active', Application::query()->where('engine_username', 'site1')->value('status'));

        // The row's own name is the filter, so one small page answers for it
        // whatever else the Engine is running.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/tasks')
            && $r['status'] === 'active'
            && $r['scope'] === 'all'
            && $r['username'] === 'site1'
            && $r['per_page'] === 1);
    }

    /**
     * A busy Engine fills the first page of the unfiltered task list with other
     * projects' work; a pending row's create task can sit beyond it. The sync
     * asks for that one username, so the row stays `pending` (Engine #1527).
     */
    public function test_a_create_task_beyond_the_first_page_is_found_through_the_username_filter(): void
    {
        $this->configureEngine();
        Application::query()->create(['engine_id' => EngineConnection::DEFAULT_ID, 'engine_username' => 'site1', 'domain' => 'site1.example.com', 'status' => 'pending']);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (the `username` filter reads `where username = ?`; an unfiltered page 1 holds 200 other rows of 450)
        Http::fake(['engine.example.com/api/tasks?*' => function (Request $request) {
            if (($request['username'] ?? null) !== 'site1') {
                // Engine: core/app/Http/Controllers/TaskController.php:98-101 (`username` is `where username = ?`; an unfiltered page 1 of 3 holds 200 other rows)
                return Http::response([
                    'data' => array_fill(0, 200, ['id' => 9, 'username' => 'other', 'status' => 'running']),
                    'meta' => ['last_page' => 3, 'total' => 450],
                ]);
            }

            // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (`status=active` for this one project)
            return Http::response([
                'data' => [['id' => 7, 'username' => 'site1', 'status' => 'queued', 'action' => 'create']],
                'meta' => ['last_page' => 1, 'total' => 1],
            ]);
        }]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame('pending', Application::query()->where('engine_username', 'site1')->value('status'));
        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/tasks') && $r['username'] === 'site1');
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/tasks') && ! isset($r['username']));
    }

    /**
     * The Engine lists nothing active for the row any more: its create task
     * finished, so the mirror takes the Engine's own project status (`active`).
     */
    public function test_a_finished_create_task_flips_the_pending_row_active(): void
    {
        $this->configureEngine();
        Application::query()->create(['engine_id' => EngineConnection::DEFAULT_ID, 'engine_username' => 'site1', 'domain' => 'site1.example.com', 'status' => 'pending']);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (`status=active` holds no row once the create task completed)
        Http::fake(['engine.example.com/api/tasks?*' => Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame('active', Application::query()->where('engine_username', 'site1')->value('status'));
    }

    /**
     * A read that fails after the first row was answered leaves the rows it
     * never asked about `pending` – they must not flip `active` on missing data.
     */
    public function test_a_task_read_failing_mid_way_keeps_the_unconfirmed_rows_pending(): void
    {
        $this->configureEngine();
        foreach (['site1', 'site2'] as $username) {
            Application::query()->create([
                'engine_id' => EngineConnection::DEFAULT_ID,
                'engine_username' => $username,
                'domain' => $username.'.example.com',
                'status' => 'pending',
            ]);
        }
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
            $this->engineProject(11, 'site2'),
        ]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (one filtered read per pending row; the second one fails)
        Http::fake(['engine.example.com/api/tasks?*' => function (Request $request) {
            if (($request['username'] ?? null) === 'site2') {
                // Engine: core/app/Http/Controllers/TaskController.php:99 (the second filtered read, answered with a 500)
                return Http::response(['message' => 'Server error'], 500);
            }

            // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (`status=active` for this one project)
            return Http::response([
                'data' => [['id' => 7, 'username' => 'site1', 'status' => 'running', 'action' => 'create']],
                'meta' => ['last_page' => 1, 'total' => 1],
            ]);
        }]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        // The answered row has a task; the unasked one is kept rather than
        // flipped on a missing answer.
        $this->assertSame('pending', Application::query()->where('engine_username', 'site1')->value('status'));
        $this->assertSame('pending', Application::query()->where('engine_username', 'site2')->value('status'));
    }

    /**
     * A failed first read keeps the pre-guard behaviour: the row is not held
     * back (a permanently failing task read would pin it for ever) and the
     * failure is reported.
     */
    public function test_a_failed_first_task_read_keeps_the_previous_behaviour(): void
    {
        $this->configureEngine();
        Application::query()->create(['engine_id' => EngineConnection::DEFAULT_ID, 'engine_username' => 'site1', 'domain' => 'site1.example.com', 'status' => 'pending']);
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        // Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (500)
        Http::fake(['engine.example.com/api/tasks?*' => Http::response(['message' => 'Server error'], 500)]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame('active', Application::query()->where('engine_username', 'site1')->value('status'));
    }

    public function test_without_a_pending_row_the_sync_reads_no_tasks(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame('active', Application::query()->where('engine_username', 'site1')->value('status'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/tasks'));
    }

    public function test_the_engine_created_at_offset_is_stored_as_utc(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['created_at' => '2026-03-20T09:28:21-04:00']),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        // An Engine `created_at` offset must survive as the same instant in UTC.
        $this->assertSame(
            '2026-03-20T13:28:21.000000Z',
            Application::query()->where('engine_username', 'site1')->firstOrFail()->engine_created_at?->toJSON(),
        );
    }

    public function test_a_mirrored_engine_created_at_offset_is_stored_as_utc(): void
    {
        $this->configureEngine();
        Queue::fake();

        $application = $this->synchronizer()->mirror(
            EngineConnection::DEFAULT_ID,
            $this->engineProject(10, 'site1', ['created_at' => '2026-03-20T09:28:21-04:00']),
        );

        // mirror() is the single-project upsert used by clone/staging/the
        // provisioner; its Engine `created_at` is the same offset-carrying read
        // as sync() and must be stored as UTC too.
        $this->assertNotNull($application);
        $this->assertSame('2026-03-20T13:28:21.000000Z', $application->engine_created_at?->toJSON());
    }

    public function test_ids_are_stable_and_removed_projects_are_deleted(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [$this->engineProject(10, 'site1'), $this->engineProject(12, 'site2')]])
            ->push(['data' => [$this->engineProject(12, 'site2', ['status' => 'suspended'])]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $site2Id = Application::query()->where('engine_username', 'site2')->value('id');

        $result = $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(['upserted' => 1, 'deleted' => 1, 'inserted' => []], $result);
        $this->assertSame(['site2'], Application::query()->pluck('engine_username')->all());
        $site2 = Application::query()->findOrFail($site2Id);
        $this->assertSame('suspended', $site2->status);
    }

    public function test_a_failed_staging_row_survives_the_sync(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
                $this->engineProject(60, 'site1-old', ['staging_of' => 'site1']),
            ]])
            // The Engine deleted the failed copy's destination and the other
            // staging is simply gone.
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            ->push(['data' => [$this->engineProject(10, 'site1')]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        Application::query()->where('engine_username', 'site1-staging')->update([
            'status' => 'failed',
            'staging_create_failed_at' => now(),
        ]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        // The marked row stays visible for the CA's retry/delete menu.
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1-staging']);
        // A staging without the marker is still dropped with the sync.
        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1-old']);
    }

    public function test_a_files_onboarding_row_is_deleted_when_the_engine_no_longer_lists_it(): void
    {
        // A files-onboarding row has no sync exemption –
        // the Engine creates the account synchronously before its 202 and
        // `listAll` has no filter, so a freshly created project is always
        // listed. A list that omits the row therefore proves it is gone.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [$this->engineProject(10, 'site1')]])
            ->push(['data' => []]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        Application::query()->where('engine_username', 'site1')->update(['onboarding_files_at' => now()]);

        $result = $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(1, $result['deleted']);
        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1']);
    }

    public function test_a_creating_staging_row_survives_the_sync(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]])
            // The Engine deleted the failed copy's destination before the
            // watcher polled: a sync in between must keep the row.
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            ->push(['data' => [$this->engineProject(10, 'site1')]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        Application::query()->where('engine_username', 'site1-staging')->update([
            'status' => 'pending',
            'staging_creating_at' => now(),
        ]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseHas('applications', ['engine_username' => 'site1-staging']);
        $this->assertNotNull(Application::query()->where('engine_username', 'site1-staging')->firstOrFail()->staging_creating_at);
    }

    public function test_a_creating_staging_row_inside_the_max_backoff_window_is_kept_by_the_sync(): void
    {
        // A frozen clock: a slow run (coverage) must not move the marker past the window.
        $this->freezeTime();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]])
            ->push(['data' => [$this->engineProject(10, 'site1')]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        // The marker is past the watcher's wall-clock cap but still inside the
        // maximum backoff the lost watcher may take to record the outcome, so
        // the copy may still be running and the sync must keep the row
        //The stale test just past the window drops it.
        Application::query()->where('engine_username', 'site1-staging')->update([
            'status' => 'pending',
            'staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS - 1),
        ]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseHas('applications', ['engine_username' => 'site1-staging']);
    }

    public function test_a_stale_creating_staging_row_is_dropped_by_the_sync(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]])
            ->push(['data' => [$this->engineProject(10, 'site1')]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        // The watcher was lost: a creating marker older than the watcher's cap
        // plus its maximum backoff is ignored, so a sync can drop the row after
        // the Engine removed the destination.
        Application::query()->where('engine_username', 'site1-staging')->update([
            'status' => 'pending',
            'staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS + 1),
        ]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1-staging']);
    }

    public function test_a_staging_row_at_exactly_the_stale_window_is_dropped_by_the_sync(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]])
            ->push(['data' => [$this->engineProject(10, 'site1')]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        // At exactly STALE_AFTER_SECONDS the creating marker is stale: the sync
        // and Application::isStagingCreating share one inclusive boundary
        //A fixed clock makes the comparison exact.
        Carbon::setTestNow('2026-10-10 10:00:00');
        Application::query()->where('engine_username', 'site1-staging')->update([
            'status' => 'pending',
            'staging_creating_at' => now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS),
        ]);
        $this->assertFalse(Application::query()->where('engine_username', 'site1-staging')->firstOrFail()->isStagingCreating());

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        Carbon::setTestNow();

        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1-staging']);
    }

    public function test_a_staging_whose_parent_left_the_engine_is_orphaned(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [
                $this->engineProject(10, 'site1'),
                $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1']),
            ]])
            // Only the staging is left: the Engine dropped the parent, so the
            // local link is cleared (orphan cleanup).
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            ->push(['data' => [$this->engineProject(50, 'site1-staging', ['staging_of' => 'site1'])]]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $stagingId = Application::query()->where('engine_username', 'site1-staging')->value('id');
        $this->assertNotNull(Application::query()->findOrFail($stagingId)->staging_of_id);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'site1']);
        $this->assertNull(Application::query()->findOrFail($stagingId)->staging_of_id);
    }

    /**
     * The project type is the Engine's `app.type` (Engine 2.3.0):
     * a classic project's stored `wordpress` or `php`, a container's kind. The
     * sync copies `wordpress` as WordPress and any other kind as custom; a
     * missing or `null` one (not read yet) leaves the stored type alone.
     */
    public function test_the_sync_copies_the_engines_project_type(): void
    {
        $this->configureEngine();
        $kept = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'kept',
            'type' => Application::TYPE_WORDPRESS,
        ]);
// Engine: core/app/Http/Resources/UserResource.php:58 -> 'app' => ProjectOverview::for() (type: ClassicAppType for PHP hosting)
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'wp', ['app' => ['type' => 'wordpress']]),
            $this->engineProject(11, 'site', ['app' => ['type' => 'php']]),
            $this->engineProject(12, 'node', ['app' => ['type' => 'node']]),
            $this->engineProject(13, 'kept', ['app' => ['type' => null]]),
            $this->engineProject(14, 'unread'),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(Application::TYPE_WORDPRESS, Application::query()->where('engine_username', 'wp')->value('type'));
        $this->assertSame(Application::TYPE_CUSTOM, Application::query()->where('engine_username', 'site')->value('type'));
        $this->assertSame(Application::TYPE_CUSTOM, Application::query()->where('engine_username', 'node')->value('type'));
        $this->assertSame(Application::TYPE_WORDPRESS, $kept->fresh()?->type);
        $this->assertNull(Application::query()->where('engine_username', 'unread')->value('type'));
    }

    public function test_a_single_project_mirror_copies_the_engines_project_type(): void
    {
        $this->configureEngine();

        $application = $this->synchronizer()->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(10, 'site1', ['app' => ['type' => 'wordpress']]));
        $this->assertSame(Application::TYPE_WORDPRESS, $application?->type);

        // The Engine read the files again (WordPress removed): the next mirror follows.
        $application = $this->synchronizer()->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(10, 'site1', ['app' => ['type' => 'php']]));
        $this->assertSame(Application::TYPE_CUSTOM, $application?->type);
    }

    /**
     * The Engine reports `php` for a WordPress installed into a subdirectory: it
     * looks for the core in the main domain's document root only (Engine
     * core/app/OpenApi/Schemas/UserSchema.php:116). The panel made that install,
     * so its own project type stays WordPress while the install is finished.
     */
    public function test_a_project_the_panel_installed_wordpress_on_keeps_its_type(): void
    {
        $this->configureEngine();
        $installed = $this->applicationWithInstall('subdir', WordPressInstall::FINISHED);
        $installing = $this->applicationWithInstall('installing', WordPressInstall::IN_PROGRESS);
        // The defect's end state: the mirror had already downgraded the row the
        // install set to wordpress.
        $installed->update(['type' => Application::TYPE_CUSTOM]);

        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'subdir', ['app' => ['type' => 'php']]),
            $this->engineProject(11, 'installing', ['app' => ['type' => 'php']]),
            $this->engineProject(12, 'plain', ['app' => ['type' => 'php']]),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(Application::TYPE_WORDPRESS, $installed->fresh()?->type);
        // An install still running has not made it a WordPress project yet.
        $this->assertSame(Application::TYPE_CUSTOM, $installing->fresh()?->type);
        $this->assertSame(Application::TYPE_CUSTOM, Application::query()->where('engine_username', 'plain')->value('type'));
    }

    public function test_a_single_project_mirror_keeps_the_type_of_a_finished_panel_install(): void
    {
        $this->configureEngine();
        $this->applicationWithInstall('subdir', WordPressInstall::FINISHED)
            ->update(['type' => Application::TYPE_CUSTOM]);

        $mirrored = $this->synchronizer()->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(10, 'subdir', ['app' => ['type' => 'php']]));

        $this->assertSame(Application::TYPE_WORDPRESS, $mirrored?->type);
    }

    /**
     * A staging copy is the live project's files and database, so the copy of a
     * WordPress project is WordPress too. The Engine reads the copy's main
     * document root, where a subdirectory install has no core, and answers `php`.
     */
    public function test_a_staging_copy_of_a_wordpress_project_is_wordpress(): void
    {
        $this->configureEngine();
        $this->applicationWithInstall('subdir', WordPressInstall::FINISHED)->update([
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            // The copy is listed first: the Engine's order must not matter.
            $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1', 'app' => ['type' => 'php']]),
            $this->engineProject(10, 'site1', ['app' => ['type' => 'php']]),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(Application::TYPE_WORDPRESS, Application::query()->where('engine_username', 'site1')->value('type'));
        $this->assertSame(Application::TYPE_WORDPRESS, Application::query()->where('engine_username', 'site1-staging')->value('type'));
    }

    public function test_a_staging_copy_of_a_custom_project_stays_custom(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['app' => ['type' => 'php']]),
            $this->engineProject(50, 'site1-staging', ['staging_of' => 'site1', 'app' => ['type' => 'php']]),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $this->assertSame(Application::TYPE_CUSTOM, Application::query()->where('engine_username', 'site1-staging')->value('type'));
    }

    public function test_a_single_project_mirror_of_a_staging_copy_follows_its_live_project(): void
    {
        $this->configureEngine();
        $live = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'type' => Application::TYPE_WORDPRESS,
        ]);
        $staging = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1-staging',
            'type' => Application::TYPE_CUSTOM,
            'staging_of_id' => $live->id,
        ]);

        $mirrored = $this->synchronizer()->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(50, 'site1-staging', [
            'staging_of' => 'site1',
            'app' => ['type' => 'php'],
        ]));

        $this->assertSame(Application::TYPE_WORDPRESS, $mirrored?->type);
        $this->assertSame(Application::TYPE_WORDPRESS, $staging->fresh()?->type);
    }

    private function applicationWithInstall(string $username, string $status): Application
    {
        $application = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => $username,
            'type' => Application::TYPE_WORDPRESS,
        ]);
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => $status,
            'params' => ['dir' => 'blog', 'url' => "https://{$username}.example.com/blog"],
        ]);

        return $application;
    }

    public function test_sync_records_the_engine_marker_even_with_no_projects(): void
    {
        $this->configureEngine();
        Queue::fake();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        $this->assertFalse($this->synchronizer()->hasSynced(EngineConnection::DEFAULT_ID));

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        // A successful sync of an Engine with zero projects still counts
        //The marker is the table, not applications.synced_at.
        $this->assertTrue($this->synchronizer()->hasSynced(EngineConnection::DEFAULT_ID));
        $this->assertDatabaseHas('engine_sync_states', ['engine_id' => EngineConnection::DEFAULT_ID]);
    }

    public function test_sync_if_stale_skips_the_engine_within_ttl(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);

        $this->synchronizer()->syncIfStale(EngineConnection::DEFAULT_ID);
        $this->synchronizer()->syncIfStale(EngineConnection::DEFAULT_ID);

        Http::assertSentCount(1);
    }

    public function test_unreachable_engine_serves_cached_rows(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1')]])]);
        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        config(['client-area.sync_ttl' => 0]);
        Http::fake(['*' => Http::failedConnection()]);

        $this->synchronizer()->syncIfStale(EngineConnection::DEFAULT_ID);

        $this->assertSame(['site1'], Application::query()->pluck('engine_username')->all());
    }

    public function test_unreachable_engine_with_empty_cache_rethrows(): void
    {
        $this->configureEngine();
        Http::fake(['*' => Http::failedConnection()]);

        $this->expectException(EngineUnavailableException::class);

        $this->synchronizer()->syncIfStale(EngineConnection::DEFAULT_ID);
    }

    public function test_sync_never_overwrites_the_panel_owned_name_and_site_name(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['name' => 'Engine Name']),
        ]])]);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $this->assertSame('Engine Name', $application->name);

        // The panel owns name/site_name (PUT wordpress/site-name); a later sync
        // keeps them even when the Engine still reports the old name. Only
        // `name` on insert and the mirror columns are upserted.
        $application->update(['name' => 'Panel Name', 'site_name' => 'Panel Site']);

        $this->synchronizer()->sync(EngineConnection::DEFAULT_ID);

        $application->refresh();
        $this->assertSame('Panel Name', $application->name);
        $this->assertSame('Panel Site', $application->site_name);
        $this->assertSame('Engine Name', $application->engine_payload['name'] ?? null);
    }

    public function test_mirror_never_overwrites_the_panel_owned_name(): void
    {
        // mirror() is the single-project upsert used by clone/staging and by the
        // provisioner's response; it must protect the panel-owned name too
        // (ApplicationSynchronizer.php:141; once only sync() was covered).
        $this->configureEngine();

        $application = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'engine_project_id' => 10,
            'name' => 'Panel Name',
            'site_name' => 'Panel Site',
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);

        $mirrored = $this->synchronizer()->mirror(
            EngineConnection::DEFAULT_ID,
            $this->engineProject(10, 'site1', ['name' => 'Engine Name']),
        );

        $this->assertNotNull($mirrored);
        $this->assertTrue($mirrored->is($application));
        $this->assertSame('Panel Name', $mirrored->name);
        $this->assertSame('Panel Site', $mirrored->site_name);
        $this->assertSame('Engine Name', $mirrored->engine_payload['name'] ?? null);
    }
}
