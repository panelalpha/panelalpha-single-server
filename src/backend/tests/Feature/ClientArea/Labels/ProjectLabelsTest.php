<?php

namespace Tests\Feature\ClientArea\Labels;

use App\Models\User;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Labels are a Client Area feature. `Application` has a real
 * `applicationLabels()` relation (legacy's registrar keeps only the
 * deploy-log relations), and `ProjectPresenter` reads it directly instead of
 * through `ProjectFacets::labels()` (a removed seam), with the
 * same eager loading: the project list runs one label query whatever the
 * number of rows.
 *
 * Contract:
 * - CA: `packages/client-area/src/apis/Instances.js:76` (list), `:17` (show);
 *   it reads `labels` (`title`, `color`) at `:140` and filters the list by
 *   `labels=a,b` (`:61-71`).
 * - Engine: the project mirror comes from
 *   `core/app/Http/Controllers/UserController.php:122` (`listAll`); labels are
 *   panel-only.
 */
final class ProjectLabelsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_label_relation_is_the_models_own(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        $this->assertInstanceOf(HasMany::class, $application->applicationLabels());
        $this->assertSame(ApplicationLabel::class, $application->applicationLabels()->getRelated()::class);
        // Legacy registers no label relation any more, and no deploy-log ones
        // either.
        $this->assertNull($application->relationResolver(Application::class, 'applicationLabels'));
        $this->assertNull($application->relationResolver(Application::class, 'latestDeployLog'));
    }

    public function test_the_labels_reach_the_project_and_the_filtered_list(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);

        // CA: packages/client-area/src/apis/Instances.js:17
        $item = $this->actingAs($user)
            ->getJson('/api/projects/'.$application->id)
            ->assertOk()
            ->json('data');
        // CA reads: packages/client-area/src/apis/Instances.js:140
        $this->assertSame([['title' => 'Prod', 'color' => '#ff0000']], $item['labels']);

        // CA: packages/client-area/src/apis/Instances.js:76 (`labels=a,b` filter)
        $list = $this->actingAs($user)
            ->getJson('/api/projects?labels=Prod')
            ->assertOk()
            ->json('data');
        // CA reads: packages/client-area/src/apis/Instances.js:140
        $this->assertSame([['title' => 'Prod', 'color' => '#ff0000']], $list[0]['labels']);
    }

    public function test_the_project_list_runs_one_label_query(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);
        foreach (['site2', 'site3'] as $username) {
            $other = Application::query()->create([
                'engine_id' => $application->engine_id,
                'engine_username' => $username,
                'domain' => $username.'.example.com',
                'status' => 'active',
            ]);
            $other->applicationLabels()->create(['title' => 'Stage', 'color' => '#00ff00']);
        }

        // Warm the sync TTL so the measured request does not sync the mirror.
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        // CA: packages/client-area/src/apis/Instances.js:76
        $items = $this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data');
        $labelQueries = array_filter(
            array_column(DB::getQueryLog(), 'query'),
            static fn (string $sql): bool => str_contains($sql, '"application_labels"'),
        );
        DB::disableQueryLog();

        $this->assertCount(1, $labelQueries);
        // CA reads: packages/client-area/src/apis/Instances.js:140
        $this->assertCount(3, $items);
        $titles = [];
        foreach ($items as $item) {
            $titles[$item['id']] = array_column($item['labels'], 'title');
        }
        $this->assertSame(['Prod'], $titles[$application->id]);
    }
}
