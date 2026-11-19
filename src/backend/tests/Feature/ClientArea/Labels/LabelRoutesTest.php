<?php

namespace Tests\Feature\ClientArea\Labels;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Labels\LabelController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ProjectLabelController;
use PanelAlpha\ClientArea\Http\Presenters\LabelPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectLabelRequest;
use PanelAlpha\ClientArea\Labels\LabelService;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use PanelAlpha\ClientArea\Models\Label;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Labels are a Client Area feature, so the user's labels
 * (`GET|POST|DELETE /api/labels`) and the per-project labels
 * (`POST|DELETE /api/projects/{application}/labels`) moved from
 * client-area-legacy into client-area. Only the action classes and the route
 * names change: method, URI, middleware and the recorded activity action stay.
 * The user's labels had moved from the host into legacy with the host's
 * middleware (`api` + `auth`, no `activity`), which they keep. The request and response contract is
 * `Tests\Feature\Account\LabelTest`.
 *
 * Contract:
 * - CA: `packages/client-area/src/router/fetchData.js:263` (`Api.post('/labels', label)`),
 *   `:245` (`Api.delete('/labels', {data: label})`), `:236`
 *   (`Api.post('/instances/${instance}/labels', label)`), `:254`
 *   (`Api.delete('/instances/${instance}/labels', {data: label})`); the CA reads
 *   `{data:true}` back.
 * - Old: `packages/api/routes/api.php:713-715` (`label.list`, `label.create`,
 *   `label.delete`; no privilege, no throttle) and `:234-237`
 *   (`instance.assign_label`, `instance.unassign_label`;
 *   `privilege:general.manage_labels`).
 * - Engine: none (panel-only).
 */
final class LabelRoutesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{string, string, string, string|null}>
     */
    public static function userLabelRoutes(): array
    {
        return [
            'list' => ['client-area.labels.index', 'GET', 'index', null],
            'create' => ['client-area.labels.store', 'POST', 'store', 'user.label.create'],
            'delete' => ['client-area.labels.destroy', 'DELETE', 'destroy', 'user.label.delete'],
        ];
    }

    #[DataProvider('userLabelRoutes')]
    public function test_the_user_label_route_is_a_controller_route_with_the_host_middleware(string $name, string $method, string $action, ?string $oldAction): void
    {
        $route = Route::getRoutes()->getByName($name);

        $this->assertNotNull($route, $name.' is not registered');
        $this->assertContains($method, $route->methods());
        $this->assertSame('api/labels', $route->uri());
        $this->assertSame(LabelController::class.'@'.$action, $route->getActionName());
        // The host's `api` group plus its `auth` group, nothing else: no
        // `activity` and no privilege.
        $this->assertSame(['api', 'auth'], $route->gatherMiddleware());
        $this->assertSame($oldAction, ActivityActionMap::for($name));
    }

    /**
     * @return array<string, array{string, string, string, string}>
     */
    public static function projectLabelRoutes(): array
    {
        return [
            'assign' => ['client-area.projects.labels.assign', 'POST', 'assign', 'user.instance.assign_label'],
            'unassign' => ['client-area.projects.labels.unassign', 'DELETE', 'unassign', 'user.instance.unassign_label'],
        ];
    }

    #[DataProvider('projectLabelRoutes')]
    public function test_the_project_label_route_is_a_controller_route_with_its_old_stack(string $name, string $method, string $action, string $oldAction): void
    {
        $route = Route::getRoutes()->getByName($name);

        $this->assertNotNull($route, $name.' is not registered');
        $this->assertSame([$method], $route->methods());
        $this->assertSame('api/projects/{application}/labels', $route->uri());
        $this->assertSame(ProjectLabelController::class.'@'.$action, $route->getActionName());
        // `ClientAreaRoutes::group()`'s stack (with `activity`) plus the old
        // route's privilege, as under legacy.
        $this->assertSame(['api', 'auth', 'activity', 'privilege:general.manage_labels'], $route->gatherMiddleware());
        $this->assertSame(['application' => '[0-9]+'], $route->wheres);
        $this->assertSame($oldAction, ActivityActionMap::for($name));
    }

    public function test_a_label_change_records_no_activity(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)
            ->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])
            ->assertOk();
        // CA: packages/client-area/src/router/fetchData.js:245 (`Api.delete('/labels', {data: label})`)
        $this->actingAs($user)
            ->deleteJson('/api/labels', ['title' => 'Prod'])
            ->assertOk();

        $this->assertSame(0, ActivityLog::query()->count());
    }
}
