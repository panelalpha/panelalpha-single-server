<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Events\EngineCallFailed;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * engine-client's task list and cancel and the application probe the Admin
 * Area's Tasks pages and health checks reach,
 * and the `EngineCallFailed` event every failed Engine call dispatches.
 */
final class TasksAndFailuresApiTest extends TestCase
{
    use EngineFixtures;

    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'));
    }

    public function test_the_task_list_show_and_cancel(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:407-418 -> cancel, {data:{cancelled: true}}
            'engine.example.com/api/tasks/7/cancel' => Http::response(['data' => ['cancelled' => true]]),
            // Engine: core/app/Http/Controllers/TaskController.php:180-185 -> show, TaskResource
            'engine.example.com/api/tasks/7' => Http::response(['data' => ['id' => 7, 'status' => 'cancelled', 'logs' => [], 'next_after_id' => 0]]),
            // Engine: core/app/Http/Controllers/TaskController.php:91-101 -> index, paginated TaskSummaryCollection
            'engine.example.com/api/tasks?*' => Http::response([
                'data' => [['id' => 7, 'status' => 'queued', 'action' => 'deploy']],
                'links' => [],
                'meta' => ['current_page' => 2, 'last_page' => 3, 'total' => 101],
            ]),
        ]);
        $api = new TasksApi($this->client());

        $page = $api->list(['scope' => 'all', 'status' => 'active', 'page' => 2]);
        $this->assertSame(7, $page['tasks'][0]['id']);
        $this->assertSame(3, $page['last_page']);
        $this->assertSame(101, $page['total']);
        $this->assertSame('cancelled', $api->show(7)['status']);
        $api->cancel(7);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'GET'
            && $request->data() === ['scope' => 'all', 'status' => 'active', 'page' => 2]);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST' && $request->url() === self::ENGINE.'/tasks/7/cancel');
    }

    public function test_a_task_the_engine_cannot_stop_is_its_409(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:413-414 -> cancel, 409 {message} (Lib/Task/TaskCanceller.php:35-37)
        Http::fake(['engine.example.com/api/tasks/8/cancel' => Http::response(['message' => 'Task cannot be cancelled'], 409)]);

        try {
            (new TasksApi($this->client()))->cancel(8);
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, $e->engineStatus);
            $this->assertSame('Task cannot be cancelled', $e->engineMessage);
        }
    }

    public function test_the_application_probe(): void
    {
        // Engine: core/app/Http/Controllers/User/AppHealthController.php:126 -> show, {data: report} (AppHealth.php:223-228)
        Http::fake(['engine.example.com/api/projects/site1/app/health' => Http::response(['data' => ['healthy' => false, 'serving' => 'placeholder', 'ports' => [], 'checks' => []]])]);

        $report = (new ContainersApi($this->client()))->appHealth(new EngineProject(1, 'site1'));

        $this->assertFalse($report['healthy']);
        $this->assertSame('placeholder', $report['serving']);
    }

    public function test_every_failed_call_dispatches_the_facts(): void
    {
        Event::fake([EngineCallFailed::class]);
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1303 -> projectOr404
            'engine.example.com/api/projects/site1' => Http::response(['message' => 'Not found'], 404),
            // Defensive (not an Engine shape): an Engine failing with a 500 on a project's sub-resource
            'engine.example.com/api/projects/site1/usage' => Http::response(['message' => 'Server Error'], 500),
            // Engine: core/app/Http/Controllers/SystemController.php:42 -> info (a success dispatches nothing)
            'engine.example.com/api/system/info' => Http::response(['data' => ['version' => '2.1.2']]),
            // Defensive (not an Engine shape): the Engine cannot be reached
            'engine.example.com/api/metrics/current' => Http::failedConnection(),
        ]);
        $client = $this->client();

        foreach (['projects/site1', 'projects/site1/usage', 'system/info', 'metrics/current'] as $path) {
            try {
                $client->get($path);
            } catch (EngineRequestException|EngineUnavailableException) {
            }
        }

        $events = [];
        Event::assertDispatched(EngineCallFailed::class, static function (EngineCallFailed $event) use (&$events): bool {
            $events[] = [$event->path, $event->status, $event->unreachable(), $event->projectUsername(), $event->addressesProjectItself()];

            return $event->engineId === 1 && $event->method === 'GET';
        });
        $this->assertSame([
            ['projects/site1', 404, false, 'site1', true],
            ['projects/site1/usage', 500, false, 'site1', false],
            ['metrics/current', null, true, null, false],
        ], $events);
    }

    public function test_the_engine_wide_project_routes_name_no_project(): void
    {
        $usernames = [];
        foreach (['projects/all?with_domain_names=1', 'projects/verify-new-username', 'tasks', 'users/site2/domains'] as $path) {
            $event = new EngineCallFailed(1, 'GET', $path, 500, false, false, 'boom');
            $usernames[] = $event->projectUsername();
        }

        $this->assertSame([null, null, null, 'site2'], $usernames);
    }
}
