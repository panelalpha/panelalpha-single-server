<?php

namespace PanelAlpha\ClientArea\Activity;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ActivityLog;

/**
 * The panel-side activity history of one application (GET
 * /projects/{id}/logs). Filtering and sorting live here.
 */
final class ActivityLogService
{
    /** Sort keys the CA sends → column. */
    private const SORTABLE = [
        'date' => 'created_at',
        'action' => 'action',
        'request_method' => 'request_method',
        'ip_address' => 'ip_address',
    ];

    /**
     * @param  array{page?: int|null|numeric-string, per_page?: int|null|numeric-string, sort_by?: string|null, sort_dir?: string|null, search_term?: string|null}  $params
     * @return array{sort_by: string, sort_dir: string, logs: LengthAwarePaginator<int, ActivityLog>}
     */
    public function paginate(Application $application, array $params): array
    {
        $sortBy = $params['sort_by'] ?? 'date';
        $column = self::SORTABLE[$sortBy] ?? 'created_at';
        $sortDir = ($params['sort_dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

        // What an admin did while signed in as a user is not the project's
        // history (old `ActivityLogsController::index()`,
        // packages/api/app/Http/Controllers/User/Instance/Logs/ActivityLogsController.php:44).
        // Community has no admin, so it never marks an entry.
        $query = ActivityLog::query()->where('application_id', $application->id)->whereNull('admin_as_user');

        $needle = trim((string) ($params['search_term'] ?? ''));
        if ($needle !== '') {
            $like = '%'.$needle.'%';
            $query->whereRaw('(action LIKE ? OR request_uri LIKE ? OR payload LIKE ?)', [$like, $like, $like]);
        }

        $logs = $query
            // The row's own actor, eager-loaded.
            ->with('user')
            ->orderBy($column, $sortDir)
            ->orderByDesc('id')
            ->paginate((int) ($params['per_page'] ?? 10));

        return ['sort_by' => $sortBy, 'sort_dir' => $sortDir, 'logs' => $logs];
    }
}
