<?php

namespace PanelAlpha\Community\Tasks;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;

/**
 * One page of the Engine's task list as the Tasks view reads it, each row
 * linked to the panel project that owns the Engine `username`.
 *
 * Engine exceptions are not caught: `EngineErrors` renders them.
 */
final class EngineTaskList
{
    private const int DEFAULT_PER_PAGE = 50;

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly ApplicationRepository $applications,
    ) {}

    /**
     * @param  array<string, int|string>  $filters  `page`, `per_page`, `status`, `action` (only the present keys)
     * @return array{data: list<array<string, mixed>>, meta: array{current_page: int, last_page: int, per_page: int, total: int}}
     */
    public function page(Authenticatable $user, array $filters): array
    {
        $result = (new TasksApi($this->engines->forEngine($this->engines->defaultEngineId())))
            ->list($filters + ['scope' => 'all']);

        $projects = $this->applications->forUser($user, false)->load('stagingOf')->keyBy('engine_username');

        $rows = [];
        foreach ($result['tasks'] as $task) {
            $rows[] = $this->row($task, $projects);
        }

        return [
            'data' => $rows,
            'meta' => [
                'current_page' => (int) ($filters['page'] ?? 1),
                'last_page' => $result['last_page'],
                'per_page' => (int) ($filters['per_page'] ?? self::DEFAULT_PER_PAGE),
                'total' => $result['total'],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $task
     * @param  Collection<string, Application>  $projects
     * @return array<string, mixed>
     */
    private function row(array $task, Collection $projects): array
    {
        $username = self::string($task['username'] ?? null);
        $app = $username !== null ? $projects->get($username) : null;
        $status = self::string($task['status'] ?? null) ?? '';
        $error = self::string(self::map($task['details'] ?? null)['error'] ?? null);

        return [
            'id' => $task['id'] ?? null,
            'action' => self::string($task['action'] ?? null),
            'job_type' => self::string($task['job_type'] ?? null),
            'status' => $status,
            'username' => $username,
            'project' => $app === null ? null : [
                'id' => $app->id,
                'name' => StagingService::displayName($app) ?: $username,
                'domain' => is_string($app->domain) && $app->domain !== '' ? $app->domain : null,
            ],
            'error' => $status === 'failed' && $error !== null && $error !== '' ? EngineText::redact($error) : null,
            'queued_at' => $task['queued_at'] ?? null,
            'started_at' => $task['started_at'] ?? null,
            'finished_at' => $task['completed_at'] ?? $task['failed_at'] ?? $task['cancelled_at'] ?? null,
        ];
    }

    private static function string(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }

    /**
     * @return array<array-key, mixed>
     */
    private static function map(mixed $value): array
    {
        return is_array($value) ? $value : [];
    }
}
