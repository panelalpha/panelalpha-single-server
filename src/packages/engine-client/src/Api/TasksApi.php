<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine-wide task list. `GET /tasks` is the only
 * source for "is any Engine task still queued or running"; the admin-area menu
 * badge reads it through the host app's cache. `logs()` pages one task's log
 * (the failure tail of a deploy whose log is gone).
 */
final class TasksApi
{
    /** The rows of one task log page the panel asks for: what Engine 2.2.0 always answered. */
    public const LOG_PAGE = 2000;

    public function __construct(readonly EngineClient $engine) {}

    /**
     * Whether any Engine task is queued or running, Engine-wide. `scope=all`
     * needs an unrestricted token (the single Engine API token is one); the
     * `active` alias expands to `queued`+`running`
     * (`TaskListRequest::STATUS_ALIASES`).
     *
     * Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index,
     * paginated `{data:[TaskSummary], links, meta}` (`TaskSummaryCollection`);
     * `per_page` 1 is enough for a boolean and keeps the read cheap.
     */
    public function hasActiveTasks(): bool
    {
        return Payload::objects($this->engine->get('tasks', [
            'status' => 'active',
            'scope' => 'all',
            'per_page' => 1,
        ])->json('data')) !== [];
    }

    /**
     * One page of the Engine's task list, newest first. `$filters` are the
     * Engine's: `status` (a comma list of queued, running, completed, failed,
     * cancelled, or `active`), `scope` (`mine` or `all`; `all` needs an
     * unrestricted token, which the panel's is), `username`, `action`
     * (`details.action`), `since` (`updated_at` at or after), `per_page`
     * (1–200, default 50) and `page`. A task is `{id, job_id, queue, job_type,
     * status, details, username, pid, pid_start_time, queued_at, started_at,
     * completed_at, failed_at, cancelled_at, action, created_by_token_id}`.
     *
     * Engine: core/app/Http/Controllers/TaskController.php:91-101 -> index
     * (`TaskListRequest.php:31-42` rules), `TaskSummaryResource.php:14-25` items
     * in a paginated `{data, links, meta}`.
     *
     * @param  array<string, int|string>  $filters
     * @return array{tasks: list<array<string, mixed>>, last_page: int, total: int}
     */
    public function list(array $filters = []): array
    {
        $response = $this->engine->get('tasks', $filters);

        return [
            'tasks' => Payload::objects($response->json('data')),
            'last_page' => Payload::int($response->json('meta.last_page')) ?? 1,
            'total' => Payload::int($response->json('meta.total')) ?? 0,
        ];
    }

    /**
     * One task with its first log page (`EngineClient::task()`).
     *
     * Engine: core/app/Http/Controllers/TaskController.php:180-185 -> show,
     * `TaskResource.php:15-37` (the summary fields plus `logs`,
     * `next_after_id`); 404 for an unknown id.
     *
     * @return array<string, mixed>
     */
    public function show(int $taskId): array
    {
        return $this->engine->task($taskId);
    }

    /**
     * Cancel a queued or running task; the Engine kills its process when it
     * has one. A finished task, or a running one nothing can stop (a backup,
     * restore, staging or push without a pid), is a 409
     * (`EngineRequestException`, `engineStatus` 409, the Engine's message).
     *
     * Engine: core/app/Http/Controllers/TaskController.php:407-418 -> cancel,
     * `{data:{cancelled: true}}`; `Lib/Task/TaskCanceller.php:35-61`.
     */
    public function cancel(int $taskId): void
    {
        $this->engine->post("tasks/{$taskId}/cancel");
    }

    /**
     * One page of a task's log lines after `$afterId` (oldest first, at most
     * 2000 per page), and the id to continue after. A deploy line's `log` is
     * its message with `level` and `stage` beside it; a plain task line has
     * both null. A failed create keeps the end of its deploy log here, because
     * the rollback deletes the deploy log (`Lib/Task/DeployLogTail.php`).
     *
     * Engine: core/app/Http/Controllers/TaskController.php:222-232 -> TaskController::logs,
     * `{data:[TaskLogResource{id, log, level, stage, created_at}], meta:{next_after_id, task_status}}`
     * (`Http/Resources/TaskLogCollection.php:20-28`, `TaskLogResource.php:14-26`).
     *
     * @return array{lines: list<array<string, mixed>>, next_after_id: int}
     */
    public function logs(int $taskId, int $afterId = 0): array
    {
        // Engine 2.3.0 pages 500 rows unless asked (`TaskLogPage::DEFAULT_LIMIT`,
        // up to `MAX_LIMIT` 2000); 2.2.0 always answered 2000 and ignores `limit`.
        $query = ['limit' => self::LOG_PAGE];
        if ($afterId > 0) {
            $query['after_id'] = $afterId;
        }
        $response = $this->engine->get("tasks/{$taskId}/logs", $query);

        return [
            'lines' => Payload::objects($response->json('data')),
            'next_after_id' => Payload::int($response->json('meta.next_after_id')) ?? $afterId,
        ];
    }
}
