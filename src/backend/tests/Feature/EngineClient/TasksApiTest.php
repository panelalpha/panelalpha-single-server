<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * engine-client's `TasksApi::list()` passes the filters through and maps the
 * paginated Engine answer.
 */
final class TasksApiTest extends TestCase
{
    use EngineFixtures;

    private function api(): TasksApi
    {
        return new TasksApi(new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token')));
    }

    public function test_list_sends_the_filters_and_maps_the_page(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:91 → index(), paginated {data:[TaskSummary], links, meta}
        Http::fake(['engine.example.com/api/tasks*' => Http::response([
            'data' => [['id' => 7, 'status' => 'failed', 'username' => 'site1', 'action' => 'backup.create']],
            'links' => [],
            'meta' => ['current_page' => 2, 'last_page' => 5, 'total' => 230],
        ])]);

        $page = $this->api()->list(['status' => 'failed', 'action' => 'backup.create', 'scope' => 'all', 'per_page' => 50, 'page' => 2]);

        $this->assertSame(7, $page['tasks'][0]['id']);
        $this->assertSame(5, $page['last_page']);
        $this->assertSame(230, $page['total']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'GET'
            && str_starts_with($request->url(), self::ENGINE.'/tasks?')
            && $request['status'] === 'failed'
            && $request['action'] === 'backup.create'
            && (int) $request['page'] === 2);
    }

    public function test_list_defaults_the_paging_when_meta_is_missing(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:91 → index(), an empty page without meta
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => []])]);

        $this->assertSame(['tasks' => [], 'last_page' => 1, 'total' => 0], $this->api()->list());
    }
}
