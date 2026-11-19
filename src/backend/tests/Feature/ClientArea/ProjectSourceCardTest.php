<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectSourceJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use Tests\TestCase;

/**
 * The Source card of a deployed (git/files) project on its General page
 * (old `InstanceSourceResource`, packages/api/app/Http/Resources/
 * InstanceSourceResource.php). The CA shows the stack label
 * (`details.detected_stack.label`), the database container
 * (`source.database`) and the last deploy (`source.last_deploy`)
 * – FilesSourceInfoCard.vue:101-134, GitSourceInfoCard.vue – and an empty
 * card without them. The project answer reads them from the cache a queued
 * refresh fills; it never calls the Engine itself.
 */
final class ProjectSourceCardTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function containerDetails(array $overrides = []): array
    {
        return array_merge(['template' => 'dind', 'deploy_label' => 'Node.js'], $overrides);
    }

    private function fakeContainers(): void
    {
        // Engine: core/app/Http/Controllers/User/ContainerController.php:47 -> index; core/app/System/Project/Dind/ContainerOperations.php:52 (`docker compose ps --format json`)
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['data' => [
            ['Service' => 'app', 'Name' => 'site1-app-1', 'Image' => 'project-app', 'State' => 'running'],
            ['Service' => 'db', 'Name' => 'site1-db-1', 'Image' => 'mariadb:11.4', 'State' => 'running'],
        ]])]);
    }

    public function test_a_first_view_queues_the_refresh_and_shows_the_defaults(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        Http::fake();

        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-133 (the card's defaults until the refresh ran)
        $project->assertJsonPath('data.source.type', 'files');
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-125
        $project->assertJsonPath('data.source.last_deploy', null);
        Http::assertNotSent(static fn ($request): bool => str_contains($request->url(), '/containers') || str_contains($request->url(), '/deploys'));
        $this->assertSame(1, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());
    }

    public function test_after_the_refresh_a_files_project_shows_its_stack_database_and_last_deploy(): void
    {
        $this->fakeContainers();
        $this->fakeEngineDeploys('site1', [
            $this->engineDeploy(['status' => 'partial', 'source' => 'archive', 'finished_at' => 1791973000]),
            $this->engineDeploy(['id' => '20261013-101500-a1b2c3', 'status' => 'failed', 'source' => 'archive', 'started_at' => 1791880000, 'finished_at' => 1791880100]),
        ]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);

        RefreshProjectSourceJob::dispatchSync($application->id);
        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: src/components/cards/FilesSourceInfoCard.vue:101-114 (details.detected_stack.label)
        $project->assertJsonPath('data.details.detected_stack.label', 'Node.js');
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:126-133 (source.database)
        $project->assertJsonPath('data.source.database', ['present' => true, 'label' => 'MariaDB 11.4']);
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-125 (a partial deploy is a finished one)
        $project->assertJsonPath('data.source.last_deploy.status', 'finished');
        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $project->assertJsonPath('data.source.last_deploy.waiting_for_files', false);
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:121-124 (source.last_deploy.finished_at)
        $project->assertJsonPath('data.source.last_deploy.finished_at', '2026-10-14T10:16:40+00:00');
        $this->assertTrue(Cache::has(ProjectSourceDetails::cacheKey($application)));
    }

    public function test_a_files_project_still_waiting_for_its_files_is_marked_in_the_project_answer(): void
    {
        // A files project the panel created and left before uploading: the
        // Engine's create deploy runs as a task and stays `running` until the
        // archive arrives, so the CA's Upload new version dialog must upload
        // instead of waiting for its end.
        $this->fakeContainers();
        $this->fakeEngineDeploys('site1', [
            $this->engineDeploy(['status' => 'running', 'finished_at' => null, 'kind' => 'install', 'source' => 'template']),
        ]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        $application->forceFill(['onboarding_files_at' => now()])->save();

        RefreshProjectSourceJob::dispatchSync($application->id);
        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $project->assertJsonPath('data.source.last_deploy.status', 'running');
        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmit` -> `source.last_deploy`)
        $project->assertJsonPath('data.source.last_deploy.waiting_for_files', true);
    }

    public function test_stale_facts_are_shown_while_a_refresh_is_queued(): void
    {
        $this->fakeContainers();
        $this->fakeEngineDeploys('site1', [$this->engineDeploy(['source' => 'archive'])]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        RefreshProjectSourceJob::dispatchSync($application->id);

        // Fresh: shown, nothing queued.
        // CA: src/apis/Instances.js:17
        $fresh = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:126-133 (source.database)
        $fresh->assertJsonPath('data.source.database.label', 'MariaDB 11.4');
        $this->assertSame(0, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());

        // Stale: still shown, and a refresh is queued.
        $this->travel(ProjectSourceDetails::FRESH_SECONDS + 1)->seconds();
        // CA: src/apis/Instances.js:17
        $stale = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:126-133 (source.database)
        $stale->assertJsonPath('data.source.database.label', 'MariaDB 11.4');
        $this->assertSame(1, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());
    }

    public function test_without_a_recipe_label_the_stack_is_the_application_image(): void
    {
        $this->fakeContainers();
        $this->fakeEngineDeploys('site1', []);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails(['deploy_label' => null])]);

        RefreshProjectSourceJob::dispatchSync($application->id);
        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: src/components/cards/FilesSourceInfoCard.vue:101-114 (details.detected_stack.label)
        $project->assertJsonPath('data.details.detected_stack.label', 'project-app');
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-125 (nothing deployed: no "Deployed")
        $project->assertJsonPath('data.source.last_deploy', null);
    }

    public function test_an_engine_failure_keeps_the_card_defaults(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/ContainerController.php:47 -> index (the Engine cannot be reached)
            'engine.example.com/api/projects/site1/containers' => Http::response(['message' => 'Server Error'], 500),
            // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index (unreachable)
            'engine.example.com/api/projects/site1/deploys' => Http::response(['message' => 'Server Error'], 500),
        ]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails(['deploy_label' => null])]);

        RefreshProjectSourceJob::dispatchSync($application->id);
        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: src/components/cards/FilesSourceInfoCard.vue:126-133 (source.database)
        $project->assertJsonPath('data.source.database', ['present' => false, 'label' => null]);
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-125 (source.last_deploy)
        $project->assertJsonPath('data.source.last_deploy', null);
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:101-114 (details.detected_stack.label)
        $project->assertJsonPath('data.details.detected_stack.label', 'Docker (files)');
    }

    public function test_a_cached_running_deploy_is_shown_only_while_the_facts_are_trusted(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        $key = ProjectSourceDetails::cacheKey($application);
        $facts = [
            'label' => 'Node.js',
            'services' => [],
            'database' => ['present' => false, 'label' => null],
            'last_deploy' => ['status' => 'running', 'finished_at' => null, 'waiting_for_files' => false],
        ];
        Http::fake();

        // Within the trust window the running deploy is shown and nothing is queued.
        Cache::put($key, ['facts' => $facts, 'refreshed_at' => now()->getTimestamp()], ProjectSourceDetails::KEEP_SECONDS);
        // CA: src/apis/Instances.js:17
        $fresh = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:118-125 (source.last_deploy)
        $fresh->assertJsonPath('data.source.last_deploy.status', 'running');
        $this->assertSame(0, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());

        // A deploy the refresh can no longer confirm is not served as running:
        // the Upload new version dialog must not wait for a deploy that ended.
        Cache::put($key, [
            'facts' => $facts,
            'refreshed_at' => now()->getTimestamp() - ProjectSourceDetails::RUNNING_TRUST_SECONDS - 1,
        ], ProjectSourceDetails::KEEP_SECONDS);
        // CA: src/apis/Instances.js:17
        $stale = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();
        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmitUpload`)
        $stale->assertJsonPath('data.source.last_deploy', null);
        // CA reads: src/components/cards/FilesSourceInfoCard.vue:101-114 (details.detected_stack.label)
        $stale->assertJsonPath('data.details.detected_stack.label', 'Node.js');
        $this->assertSame(1, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());
    }

    public function test_a_files_project_waiting_for_its_archive_keeps_its_running_state(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        Http::fake();
        Cache::put(ProjectSourceDetails::cacheKey($application), [
            'facts' => [
                'label' => 'Node.js',
                'services' => [],
                'database' => ['present' => false, 'label' => null],
                'last_deploy' => ['status' => 'running', 'finished_at' => null, 'waiting_for_files' => true],
            ],
            'refreshed_at' => now()->getTimestamp() - ProjectSourceDetails::RUNNING_TRUST_SECONDS - 1,
        ], ProjectSourceDetails::KEEP_SECONDS);

        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: packages/client-area/src/components/cards/FilesSourceInfoCard.vue:118-125 (source.last_deploy)
        $project->assertJsonPath('data.source.last_deploy.status', 'running');
        // CA reads: packages/client-area/src/components/modal/FilesUploadVersionModal.vue:342 (`canSubmitUpload`)
        $project->assertJsonPath('data.source.last_deploy.waiting_for_files', true);
    }

    public function test_the_list_never_carries_the_source_card_facts(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => $this->containerDetails()]);
        Cache::put(ProjectSourceDetails::cacheKey($application), ['facts' => ['label' => 'Node.js', 'services' => [], 'database' => ['present' => true, 'label' => 'MySQL 8'], 'last_deploy' => null], 'refreshed_at' => now()->getTimestamp()], 60);
        Http::fake();

        // CA: src/apis/Instances.js:76
        $list = $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA reads: src/apis/Instances.js:77-80 (the list item keeps the card's defaults)
        $list->assertJsonPath('data.0.source.database.present', false);
        $this->assertSame(0, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());
    }

    public function test_a_classic_site_without_git_has_no_source_card(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => []]);
        Http::fake();

        // CA: src/apis/Instances.js:17
        $project = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk();

        // CA reads: src/apis/privileges/privilegeMethods.js:130-135 (hasGitSource/hasFilesSource need a source)
        $project->assertJsonPath('data.source', null);
        $this->assertSame(0, DB::table('jobs')->where('payload', 'like', '%RefreshProjectSourceJob%')->count());
    }

    public function test_a_gone_project_refresh_does_nothing(): void
    {
        Http::fake();

        RefreshProjectSourceJob::dispatchSync(999);

        Http::assertNothingSent();
        $this->assertFalse(Cache::has(ProjectSourceDetails::cacheKey(new Application(['id' => 999]))));
    }
}
