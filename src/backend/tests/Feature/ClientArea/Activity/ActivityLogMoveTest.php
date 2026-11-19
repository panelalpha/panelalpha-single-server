<?php

namespace Tests\Feature\ClientArea\Activity;

use Illuminate\Console\Application as Artisan;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Activity\ActivityLogService;
use PanelAlpha\ClientArea\Http\Controllers\Project\ActivityLogController;
use PanelAlpha\ClientArea\Http\Middleware\LogActivity;
use PanelAlpha\ClientArea\Http\Presenters\Activity\ActivityLogPresenter;
use PanelAlpha\ClientArea\Http\Requests\Project\ActivityLogListRequest;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The activity log is a Client Area feature, so its code moved
 * from client-area-legacy into the controller: the
 * action map, the service, the list controller, request and presenter, the
 * recording `LogActivity` middleware, the `ActivityLog` model and
 * `routes/activity.php`. The `ActivityContext` seam and its no-op
 * `NullActivityContext` are gone – the `activity` alias is the recording
 * middleware itself, with or without legacy. The retention key
 * (`client-area.activity_retention_days`, same env name and default) and the
 * `model:prune` of `ActivityLog` moved with it; legacy keeps pruning its own
 * `GitOperation`. Only the route name and class names change: method, URI,
 * middleware and the recorded actions stay (`ActivityLogTest`).
 *
 * Contract:
 * - CA: `packages/client-area/src/router/fetchData.js:15` (`GET /projects/{id}/logs`);
 *   the CA translates the old action names (`components/logs/LogItem.vue:65`).
 * - Old: `packages/api/routes/api.php` `instance.logs` with
 *   `privilege:general.view_logs`.
 * - Engine: none (panel-only history).
 */
final class ActivityLogMoveTest extends TestCase
{
    public function test_the_activity_seam_is_gone_and_the_alias_is_the_recording_middleware(): void
    {
        $this->assertFalse(interface_exists('PanelAlpha\\ClientArea\\Contracts\\ActivityContext'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Http\\Middleware\\NullActivityContext'));
        $this->assertSame(LogActivity::class, app('router')->getMiddleware()['activity'] ?? null);
        $this->assertSame([], class_implements(LogActivity::class));
    }

    public function test_the_log_route_is_a_controller_route_with_its_old_stack(): void
    {
        $route = Route::getRoutes()->getByName('client-area.projects.logs');

        $this->assertNotNull($route);
        $this->assertSame(['GET', 'HEAD'], $route->methods());
        $this->assertSame('api/projects/{application}/logs', $route->uri());
        $this->assertSame(ActivityLogController::class.'@index', $route->getActionName());
        // `ClientAreaRoutes::group()`'s stack plus the old route's privilege, as
        // under legacy.
        $this->assertSame(['api', 'auth', 'activity', 'privilege:general.view_logs'], $route->gatherMiddleware());
        $this->assertSame(['application' => '[0-9]+'], $route->wheres);
        $this->assertNull(Route::getRoutes()->getByName('client-area-legacy.projects.logs'));
    }

    /**
     * The map named the route legacy registered, so its recorded action did not
     * change; the auto-deploy route has since moved into the controller, so
     * the same action is mapped under its `client-area.*` name and the legacy
     * name maps nothing. The phpMyAdmin preview SSO keeps its action under its
     * controller name.
     */
    public function test_the_map_names_the_moved_routes_with_the_same_action(): void
    {
        $this->assertSame('user.instance.git.auto_deploy', ActivityActionMap::for('client-area.projects.git.auto_deploy'));
        $this->assertNull(ActivityActionMap::for('client-area-legacy.projects.git.auto_deploy'));
        $this->assertSame(
            'user.hosting.mysql.create_phpmyadmin_preview_sso_url',
            ActivityActionMap::for('client-area.hosting.mysql.phpmyadmin_preview_sso'),
        );
    }

    public function test_the_controller_prunes_the_activity_log_daily(): void
    {
        $events = array_values(array_filter(
            $this->app->make(Schedule::class)->events(),
            static fn (Event $event): bool => $event->description === 'prune-client-area-tables',
        ));

        $this->assertCount(1, $events, 'prune-client-area-tables must be scheduled exactly once.');
        $this->assertSame('0 0 * * *', $events[0]->expression);
        // As the combined legacy entry was: no overlap guard.
        $this->assertFalse($events[0]->withoutOverlapping);
        // The git operation log moved in from client-area-legacy
        // and is pruned by the same entry.
        $this->assertSame(
            Artisan::formatCommandString("model:prune --model='PanelAlpha\\ClientArea\\Models\\ActivityLog' --model='PanelAlpha\\ClientArea\\Models\\GitOperation'"),
            $events[0]->command,
        );
    }
}
