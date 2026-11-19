<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Label;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Feature\ClientArea\OldRouteNames;
use Tests\Feature\ClientArea\OldRoutePrivileges;
use Tests\TestCase;

/**
 * The panel-side activity log: the middleware records
 * successful mutating requests, GET /projects/{id}/logs returns them.
 * @see packages/client-area/src/components/logs/LogItem.vue:65, mixins/InstanceLogMixin.js (action/payload)
 * @see packages/api/routes/api.php (old /{id}/logs, instance.logs)
 */
class ActivityLogTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    public function test_mutating_request_is_logged_and_read_back(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/projects/{application}/thing', function () {
                request()->attributes->set('activity', ['name' => 'Thing']);

                return response()->json(['ok' => true]);
            })
            ->name('user.instance.test_thing')
            // The middleware logs only what the map or a route default names;
            // a route outside the package supplies its own.
            ->defaults('activity', 'user.instance.test_thing');

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->postJson("/api/test/projects/{$application->id}/thing?from=test")
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.instance.test_thing',
            'application_id' => $application->id,
            'user_id' => $user->id,
            'request_method' => 'POST',
            // Old `request_uri` was the path only.
            'request_uri' => "/api/test/projects/{$application->id}/thing",
        ]);

        // CA: src/router/fetchData.js:15
        // CA reads: src/router/fetchData.js:16-19 (`meta`, `data`); components/logs/LogItem.vue:51-106 (action/payload/request_method/user)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/logs")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            // Old Controller::getPerPage default.
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('data.0.action', 'user.instance.test_thing')
            ->assertJsonPath('data.0.payload.name', 'Thing')
            ->assertJsonPath('data.0.request_method', 'POST')
            ->assertJsonPath('data.0.user.email', $user->email);

        $this->assertNotNull($response->json('data.0.date'));
        $this->assertArrayHasKey('ip_address', $response->json('data.0'));
        $this->assertArrayHasKey('role', $response->json('data.0.user'));
    }

    public function test_the_old_action_name_and_label_payload_are_logged(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $label = Label::query()->create(['user_id' => $user->id, 'title' => 'Prod', 'color' => '#ff0000']);

        // A real package route: the map turns the v1 name into the old CA action
        // and the controller attaches the label payload.
        // CA: src/router/fetchData.js:236
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/labels", ['title' => 'Prod'])
            ->assertOk();

        $log = ActivityLog::query()->latest('id')->firstOrFail();
        $this->assertSame('user.instance.assign_label', $log->action);
        $this->assertSame(
            ['title' => 'Prod', 'color' => '#ff0000'],
            $log->payload['App\\Models\\Label:'.$label->id] ?? null,
        );
    }

    public function test_every_migrated_mutating_route_has_an_old_action_name(): void
    {
        // No mutating package route may log under a v1 route
        // name that the CA cannot translate, and every action it does log must
        // be one of the old route names.
        $oldNames = array_merge(OldRouteNames::NAMES, OldRouteNames::V1_ONLY);
        $unmapped = [];
        $foreign = [];
        foreach (Route::getRoutes() as $route) {
            $name = $route->getName();
            // Both packages' Client Area routes (by name prefix).
            if ($name === null || (! str_starts_with($name, 'client-area.') && ! str_starts_with($name, 'client-area-legacy.'))) {
                continue;
            }
            if (array_intersect($route->methods(), ['POST', 'PUT', 'PATCH', 'DELETE']) === []) {
                continue;
            }
            $action = $route->defaults['activity'] ?? ActivityActionMap::for($name);
            if ($action === null) {
                $unmapped[] = $name;
                continue;
            }
            if (! in_array($action, $oldNames, true)) {
                $foreign[$name] = $action;
            }
        }

        $this->assertSame([], $unmapped, 'Mutating routes without an old action name: '.implode(', ', $unmapped));
        $this->assertSame([], $foreign, 'Actions that are not old route names: '.json_encode($foreign));
    }

    public function test_a_staging_payload_is_presented_parent_first(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $staging = Application::query()->create([
            'engine_id' => $application->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $application->id,
        ]);

        // MySQL re-sorts JSON object keys, so the stored payload may arrive with
        // the staging first; the CA reads instances[1] as the staging
        // (InstanceLogMixin.js:56-58 -> LogItem.vue:99-101).
        ActivityLog::query()->create([
            'application_id' => $application->id,
            'user_id' => $user->id,
            'action' => 'user.instance.staging.create',
            'request_method' => 'POST',
            'payload' => [
                'App\\Models\\Application:'.$staging->id => [
                    'id' => $staging->id,
                    'name' => 'Staging',
                    'domain' => 'staging.site1.example.com',
                    'type' => 'wordpress',
                ],
                'App\\Models\\Application:'.$application->id => [
                    'id' => $application->id,
                    'name' => 'Site1',
                    'domain' => 'site1.example.com',
                    'type' => 'custom',
                ],
            ],
        ]);

        // CA: src/router/fetchData.js:15
        // CA reads: src/router/fetchData.js:16-19
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/logs")
            ->assertOk();

        // The presenter rebuilds the parent-then-staging order.
        $this->assertSame(
            ['App\\Models\\Application:'.$application->id, 'App\\Models\\Application:'.$staging->id],
            array_keys($response->json('data.0.payload')),
        );
    }

    public function test_an_unmapped_route_logs_nothing(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // No map entry and no `activity` default: the CA cannot translate it, so
        // the middleware must not fall back to the v1 route name.
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/unmapped-activity', fn () => response()->json(['ok' => true]))
            ->name('client-area.test.unmapped');

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->postJson('/api/test/unmapped-activity')
            ->assertOk();

        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_the_row_shows_its_own_actor_not_the_viewer(): void
    {
        $viewer = User::factory()->create();
        $application = $this->application($viewer);
        $actor = $viewer; // the log row records the acting user

        ActivityLog::query()->create([
            'application_id' => $application->id,
            'user_id' => $actor->id,
            'action' => 'user.instance.delete',
            'request_method' => 'DELETE',
        ]);

        // A second user views the same project's log.
        $other = User::factory()->create();

        // CA: src/router/fetchData.js:15
        // CA reads: components/logs/LogItem.vue:65 (the CA translates `data.0.action`)
        $this->actingAs($other)
            ->getJson("/api/projects/{$application->id}/logs")
            ->assertOk()
            ->assertJsonPath('data.0.user.email', $actor->email);
    }

    public function test_a_deleted_actor_leaves_null_user_fields(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $log = ActivityLog::query()->create([
            'application_id' => $application->id,
            'user_id' => $user->id,
            'action' => 'user.instance.delete',
            'request_method' => 'DELETE',
        ]);
        $log->user()->getRelated()->newQuery()->whereKey($user->id)->forceDelete();

        // CA: src/router/fetchData.js:15
        // CA reads: components/logs/LogItem.vue:65
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/logs")
            ->assertOk()
            ->assertJsonPath('data.0.user.email', null);
    }

    public function test_deleting_a_project_logs_the_deletion_with_a_snapshot(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $id = $application->id;

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $log = ActivityLog::query()->latest('id')->firstOrFail();
        $this->assertSame('user.instance.delete', $log->action);
        // The project is gone, so the FK stays null and the row is snapshotted.
        $this->assertNull($log->application_id);
        $this->assertSame('site1.example.com', $log->payload['App\\Models\\Application:'.$id]['domain'] ?? null);
    }

    public function test_read_requests_are_not_logged(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Route::middleware(['api', 'auth', 'activity'])
            ->get('/api/test2/projects/{application}/thing', fn () => response()->json(['ok' => true]))
            ->name('user.instance.test_read');

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->getJson("/api/test2/projects/{$application->id}/thing")->assertOk();

        $this->assertSame(0, ActivityLog::query()->count());
    }

    public function test_logs_are_scoped_to_the_application_and_unknown_project_is_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        ActivityLog::query()->create(['application_id' => $application->id, 'action' => 'mine', 'request_method' => 'POST']);
        ActivityLog::query()->create(['application_id' => null, 'action' => 'other', 'request_method' => 'POST']);

        // CA: src/router/fetchData.js:15
        // CA reads: src/router/fetchData.js:16 (`meta.total`, `data.0.action`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/logs")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.action', 'mine');

        // CA: src/router/fetchData.js:15
        $this->actingAs($user)->getJson('/api/projects/999/logs')->assertNotFound();
    }

    public function test_logs_require_authentication(): void
    {
        // CA: src/router/fetchData.js:15
        $this->getJson('/api/projects/1/logs')->assertUnauthorized();
    }
}
