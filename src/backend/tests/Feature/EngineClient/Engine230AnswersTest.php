<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Answers Engine 2.3.0 changed for calls the panel already made on 2.2.0, read
 * so the callers see what they saw before.
 */
final class Engine230AnswersTest extends TestCase
{
    use EngineFixtures;

    private function engine(): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token'));
    }

    /**
     * Engine 0d1f6cc88: the deploy history of a project that is not a
     * container project is a 403, where 2.2.0 answered an empty list.
     */
    public function test_the_deploy_history_of_a_classic_project_is_empty(): void
    {
        // Engine: core/app/Http/Controllers/Concerns/ReadsDeployLogs.php:18 -> deployLogProject (403)
        Http::fake(['engine.example.com/api/projects/site1/deploys' => Http::response(['message' => 'Deploy logs work only on container projects (template dind).'], 403)]);

        $this->assertSame([], (new ProjectsApi($this->engine()))->deploys(new EngineProject(EngineConnection::DEFAULT_ID, 'site1')));
    }

    public function test_any_other_deploy_history_refusal_still_bubbles(): void
    {
        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39 -> index (404 for an unknown project)
        Http::fake(['engine.example.com/api/projects/site1/deploys' => Http::response(['message' => 'Project not found.'], 404)]);

        $this->expectException(EngineRequestException::class);

        (new ProjectsApi($this->engine()))->deploys(new EngineProject(EngineConnection::DEFAULT_ID, 'site1'));
    }

    /**
     * Engine dc92b2620: a task log page holds 500 rows unless `limit` asks for
     * more (at most 2000); the panel asks for the 2000 rows 2.2.0 always sent,
     * so the failure tail of a long deploy still reaches its end.
     */
    public function test_a_task_log_page_asks_for_the_full_page(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:264 -> logs (TaskLogPageRequest `limit`)
        Http::fake(['engine.example.com/api/tasks/7/logs*' => Http::response(['data' => [], 'meta' => ['next_after_id' => 40, 'task_status' => 'failed']])]);

        $page = (new TasksApi($this->engine()))->logs(7, 40);

        $this->assertSame(40, $page['next_after_id']);
        Http::assertSent(static fn (Request $request): bool => str_starts_with($request->url(), self::ENGINE.'/tasks/7/logs?')
            && (int) $request['limit'] === TasksApi::LOG_PAGE
            && (int) $request['after_id'] === 40);
    }
}
