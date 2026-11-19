<?php

namespace Tests\Feature\Account;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The labels routes: /labels and /projects/{id}/labels (panel-only).
 * @see packages/api/routes/api.php:713-715 (old /labels routes)
 * @see packages/client-area/src/apis/Instances.js:61-71 (the labels filter/post)
 */
class LabelTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, Application>
     */
    private function twoSyncedProjects(User $user): \Illuminate\Database\Eloquent\Collection
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'alpha'),
            $this->engineProject(11, 'beta'),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->orderBy('engine_username')->get();
    }

    public function test_create_list_delete_label(): void
    {
        $user = User::factory()->create();

        // The old LabelResource shape under `data`.
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        // CA reads: packages/client-area/src/router/fetchData.js:263 (addNewLabel returns `{data:true}`)
        $this->actingAs($user)
            ->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Prod')
            ->assertJsonPath('data.color', '#ff0000');

        // CA: packages/client-area/src/apis/Instances.js:71 (the CA reads labels from the `/instances` payload;
        //   it has no direct `GET /labels` call site)
        // CA reads: packages/client-area/src/apis/Instances.js:71 (labels come back on the instance list)
        $this->actingAs($user)
            ->getJson('/api/labels')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Prod');

        // CA: packages/client-area/src/router/fetchData.js:245 (`Api.delete('/labels', {data: label})`)
        // CA reads: packages/client-area/src/router/fetchData.js:245 (deleteLabelFromUserLabels returns `{data:true}`)
        $this->actingAs($user)
            ->deleteJson('/api/labels', ['title' => 'Prod'])
            ->assertOk()
            ->assertJson(['success' => true]);

        // CA: packages/client-area/src/apis/Instances.js:71 (labels come from the `/instances` payload)
        // CA reads: packages/client-area/src/apis/Instances.js:71 (labels come from the `/instances` payload)
        $this->actingAs($user)->getJson('/api/labels')->assertJsonCount(0, 'data');
    }

    public function test_duplicate_and_invalid_labels_are_rejected(): void
    {
        $user = User::factory()->create();
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])->assertOk();

        // CA: packages/client-area/src/router/fetchData.js:263
        // CA reads: packages/client-area/src/router/fetchData.js:265 (`Api.getErrorMessage(error)`)
        $this->actingAs($user)
            ->postJson('/api/labels', ['title' => 'Prod', 'color' => '#00ff00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');

        // CA: packages/client-area/src/router/fetchData.js:263
        // CA reads: packages/client-area/src/router/fetchData.js:265
        $this->actingAs($user)
            ->postJson('/api/labels', ['title' => 'Bad', 'color' => 'not-a-color'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('color');
    }

    public function test_deleting_a_label_removes_it_from_every_project(): void
    {
        $user = User::factory()->create();
        $projects = $this->twoSyncedProjects($user);

        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])->assertOk();
        foreach ($projects as $project) {
            // CA: packages/client-area/src/router/fetchData.js:236
            $this->actingAs($user)
                ->postJson("/api/projects/{$project->id}/labels", ['title' => 'Prod'])
                ->assertOk();
        }

        // CA: packages/client-area/src/router/fetchData.js:245 (`Api.delete('/labels', {data: label})`)
        // CA reads: packages/client-area/src/router/fetchData.js:245 (deleteLabelFromUserLabels returns `{data:true}`)
        $this->actingAs($user)
            ->deleteJson('/api/labels', ['title' => 'Prod'])
            ->assertOk()
            ->assertJson(['success' => true]);

        foreach ($projects as $project) {
            // CA: packages/client-area/src/apis/Instances.js:17 (`Api.get('/instances/{id}')`)
            // CA reads: packages/client-area/src/apis/Instances.js:140 (`labels: app.labels ? app.labels : []`)
            $this->actingAs($user)
                ->getJson("/api/projects/{$project->id}")
                ->assertOk()
                ->assertJsonCount(0, 'data.labels');
        }

        $this->assertDatabaseCount('application_labels', 0);
    }

    public function test_deleting_a_label_removes_copies_that_carry_only_its_title(): void
    {
        $user = User::factory()->create();
        $projects = $this->twoSyncedProjects($user);

        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)->postJson('/api/labels', ['title' => 'Legacy', 'color' => '#ff0000'])->assertOk();

        // Copies attached before `application_labels.label_id` existed.
        foreach ($projects as $project) {
            ApplicationLabel::query()->create([
                'application_id' => $project->id,
                'label_id' => null,
                'title' => 'Legacy',
                'color' => '#ff0000',
            ]);
        }
        ApplicationLabel::query()->create([
            'application_id' => $projects->first()->id,
            'label_id' => null,
            'title' => 'Other',
            'color' => '#00ff00',
        ]);

        // CA: packages/client-area/src/router/fetchData.js:245 (`Api.delete('/labels', {data: label})`)
        $this->actingAs($user)->deleteJson('/api/labels', ['title' => 'Legacy'])->assertOk();

        $this->assertDatabaseMissing('application_labels', ['title' => 'Legacy']);
        $this->assertDatabaseHas('application_labels', ['title' => 'Other']);
        // CA: packages/client-area/src/apis/Instances.js:17 (`Api.get('/instances/{id}')`)
        // CA reads: packages/client-area/src/apis/Instances.js:140 (`labels: app.labels ? app.labels : []`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$projects->first()->id}")
            ->assertJsonCount(1, 'data.labels')
            ->assertJsonPath('data.labels.0.title', 'Other');
    }

    public function test_assign_and_unassign_label_on_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])->assertOk();

        // CA: packages/client-area/src/router/fetchData.js:236 (`Api.post('/instances/{id}/labels', label)`, rewritten to /projects)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/labels", ['title' => 'Prod'])
            ->assertOk();

        $this->assertDatabaseHas('application_labels', [
            'application_id' => $application->id,
            'title' => 'Prod',
        ]);

        // CA: packages/client-area/src/apis/Instances.js:17 (`Api.get('/instances/{id}')`)
        // CA reads: packages/client-area/src/apis/Instances.js:140 (`labels: app.labels ? app.labels : []`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}")
            ->assertJsonPath('data.labels.0.title', 'Prod');

        // CA: packages/client-area/src/router/fetchData.js:254 (`Api.delete('/instances/{id}/labels', {data: label})`)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/labels", ['title' => 'Prod'])
            ->assertOk();

        $this->assertDatabaseMissing('application_labels', [
            'application_id' => $application->id,
            'title' => 'Prod',
        ]);
    }

    public function test_labels_require_authentication(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:71 (the labels filter on `/instances`)
        $this->getJson('/api/labels')->assertUnauthorized();
    }
}
