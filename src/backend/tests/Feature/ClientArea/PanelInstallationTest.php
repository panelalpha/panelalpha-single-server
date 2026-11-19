<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\TestCase;

/**
 * A project that runs a panel is out of this panel's reach, whoever installed
 * it: the Engine keeps the platform id of the panel archive in the mirrored
 * details (`deploy_platform`), so a setup-wizard install – `pae project:create`
 * plus an archive deploy, without `PANELALPHA_SELF_PROJECT` – is recognised
 * like the panel's own project. The sync never mirrors one and every read
 * hides it, so a route bound to it answers 404 like an unknown project.
 *
 * Engine: `GET /projects/all` (core/app/Http/Controllers/UserController.php:122)
 * is the source of the mirrored `details.deploy_platform`.
 */
final class PanelInstallationTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
     */
    private function fakeProjects(array $projects): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => $projects])]);
    }

    /**
     * The details of a project deployed from the panel archive: the id of
     * `.panelalpha/panelalpha.yaml`, carried into the Engine's UserResource.
     */
    private function panelDetails(array $overrides = []): array
    {
        return array_merge(['template' => 'dind', 'deploy_platform' => 'panelalpha-single-server'], $overrides);
    }

    /**
     * A panel last deployed before the app config's id was renamed: the Engine
     * keeps the id of that deploy until the next one.
     */
    private function legacyPanelDetails(): array
    {
        return $this->panelDetails(['deploy_platform' => 'panelalpha-v1']);
    }

    /**
     * Create the row directly, bypassing the sync filter, so a read test proves
     * the read guard and not only "the sync skipped it".
     */
    private function insertPanelRow(string $username, array $details = [], int $projectId = 3): Application
    {
        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => $projectId,
            'engine_username' => $username,
            'name' => $username,
            'domain' => "{$username}.example.com",
            'status' => 'active',
            'engine_payload' => ['details' => $this->panelDetails($details)],
        ]);
    }

    public function test_the_sync_does_not_import_a_panel_installed_through_the_wizard(): void
    {
        $this->configureEngine();
        $this->fakeProjects([
            $this->engineProject(1, 'site1'),
            // The setup-wizard install: the panel archive, no PANELALPHA_SELF_PROJECT.
            $this->engineProject(2, 'wizardpanel', ['details' => $this->panelDetails()]),
            // A deploy through `pae` also leaves the panel's own override.
            $this->engineProject(3, 'paepanel', ['details' => $this->panelDetails([
                'env_override_keys' => ['PANELALPHA_SELF_PROJECT'],
            ])]),
            // A panel not redeployed since the id was renamed.
            $this->engineProject(5, 'oldpanel', ['details' => $this->legacyPanelDetails()]),
            // An ordinary container app is untouched.
            $this->engineProject(4, 'composeapp', ['details' => ['template' => 'dind', 'deploy_platform' => 'compose']]),
        ]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'wizardpanel']);
        $this->assertDatabaseMissing('applications', ['engine_username' => 'paepanel']);
        $this->assertDatabaseMissing('applications', ['engine_username' => 'oldpanel']);
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1']);
        $this->assertDatabaseHas('applications', ['engine_username' => 'composeapp']);
    }

    public function test_the_sync_removes_a_previously_mirrored_panel_installation(): void
    {
        // A pre-fix install mirrored every project on its Engine; a sync after
        // the upgrade must drop the other panels it imported, while the Engine
        // still lists them.
        $this->insertPanelRow('wizardpanel');
        $this->configureEngine();
        $this->fakeProjects([
            $this->engineProject(10, 'site1'),
            $this->engineProject(3, 'wizardpanel', ['details' => $this->panelDetails()]),
        ]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $this->assertDatabaseMissing('applications', ['engine_username' => 'wizardpanel']);
        $this->assertDatabaseHas('applications', ['engine_username' => 'site1']);
    }

    public function test_the_project_list_leaves_out_a_project_that_runs_a_panel(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Sync first so the freshness marker skips the sync on the request and
        // the read filter is what hides the row.
        $this->fakeProjects([$this->engineProject(10, 'site1')]);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        $panel = $this->insertPanelRow('wizardpanel');
        $oldPanel = $this->insertPanelRow('oldpanel', ['deploy_platform' => 'panelalpha-v1'], 5);

        // CA: packages/client-area/src/apis/Instances.js:76
        $response = $this->actingAs($user)->getJson('/api/projects');
        // CA reads: packages/client-area/src/apis/Instances.js:80
        $response->assertOk()->assertJsonMissing(['id' => $panel->id])->assertJsonMissing(['id' => $oldPanel->id]);
    }

    public function test_the_project_routes_answer_404_for_a_project_that_runs_a_panel(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        $this->fakeProjects([$this->engineProject(10, 'site1')]);
        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);
        $panel = $this->insertPanelRow('wizardpanel');
        Http::fake();

        // CA: packages/client-area/src/apis/Instances.js:80
        $this->actingAs($user)->getJson("/api/projects/{$panel->id}")->assertNotFound();
        // CA: packages/client-area/src/components/modal/CreateStagingModal.vue:307
        $this->actingAs($user)->postJson("/api/projects/{$panel->id}/staging", [])->assertNotFound();

        // Refused before any Engine call: nothing of that panel is read or copied.
        Http::assertNothingSent();
    }
}
