<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The Client Area project list (GET /projects): visibility,
 * search, sort and pagination in one place so the controller only validates
 * and shapes the response envelope.
 */
final class ProjectListService
{
    /**
     * The list's sort keys; `storage` and `bandwidth` sort by the measured bytes.
     */
    private const SORTABLE = ['created_at', 'domain', 'name', 'status', 'storage', 'bandwidth'];

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly ProjectPresenter $presenter,
    ) {}

    /**
     * @param  array{page?: int|null|numeric-string, per_page?: int|null|numeric-string, sort_by?: string|null, sort_dir?: string|null, search_term?: string|null, labels?: string|null, server_account_id?: int|null|numeric-string}  $params
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function paginate(Authenticatable $user, array $params): array
    {
        $page = Payload::int($params['page'] ?? null) ?? 1;
        $perPage = Payload::int($params['per_page'] ?? null) ?? 8;
        $candidateSort = Payload::nullableString($params['sort_by'] ?? null);
        $sortBy = in_array($candidateSort, self::SORTABLE, true) ? $candidateSort : 'created_at';
        $sortDir = ($params['sort_dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $needle = mb_strtolower(trim(Payload::string($params['search_term'] ?? null)));

        $projects = collect($this->presenter->presentList($this->applications->forUser($user), $user));

        if ($needle !== '') {
            $projects = $projects->filter(fn (array $project) => $this->matches($project, $needle));
        }

        // `labels=Prod,Staging` keeps the projects carrying **any** of them
        // (old `whereHas('applicationLabels', whereIn('title', …))`, R15).
        $labels = array_values(array_filter(array_map('trim', explode(',', Payload::string($params['labels'] ?? null)))));
        if ($labels !== []) {
            $projects = $projects->filter(fn (array $project) => $this->hasAnyLabel($project, $labels));
        }

        $serverAccountId = Payload::int($params['server_account_id'] ?? null);
        if ($serverAccountId !== null) {
            $projects = $projects->filter(fn (array $project) => Payload::int($project['server_account_id'] ?? null) === $serverAccountId);
        }

        // An unmeasured project goes last in either direction.
        $projects = $projects
            ->sort(function (array $left, array $right) use ($sortBy, $sortDir): int {
                $a = $this->sortValue($left, $sortBy);
                $b = $this->sortValue($right, $sortBy);
                if ($a === null || $b === null) {
                    return ($a === null) <=> ($b === null);
                }

                return $sortDir === 'desc' ? $b <=> $a : $a <=> $b;
            })
            ->values();

        return [
            'data' => array_values($projects->forPage($page, $perPage)->all()),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $projects->count(),
                'sort_by' => $sortBy,
                'sort_dir' => $sortDir,
            ],
        ];
    }

    /**
     * The value the list sorts on; null for a numeric column the Engine has not measured.
     *
     * @param  array<string, mixed>  $project
     */
    private function sortValue(array $project, string $sortBy): int|string|null
    {
        if ($sortBy !== 'storage' && $sortBy !== 'bandwidth') {
            // `name`, `domain`, `created_at` and `status` are presented as strings.
            return Payload::nullableString($project[$sortBy] ?? null);
        }

        $stats = Payload::object($project['stats'] ?? null);
        $stat = Payload::object($stats[$sortBy] ?? null);

        return Payload::int($stat['usage'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $project
     * @param  list<string>  $labels
     */
    private function hasAnyLabel(array $project, array $labels): bool
    {
        $titles = [];
        foreach (Payload::objects($project['labels'] ?? null) as $label) {
            $title = Payload::nullableString($label['title'] ?? null);
            if ($title !== null) {
                $titles[] = $title;
            }
        }

        return array_intersect($titles, $labels) !== [];
    }

    /**
     * @param  array<string, mixed>  $project
     */
    private function matches(array $project, string $needle): bool
    {
        foreach (['domain', 'name', 'username'] as $field) {
            $value = mb_strtolower(Payload::string($project[$field] ?? null));
            if ($value !== '' && str_contains($value, $needle)) {
                return true;
            }
        }

        return false;
    }
}
