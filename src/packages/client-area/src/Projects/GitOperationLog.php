<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Jobs\Git\WatchGitOperationJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The `git_operations` implementation of the {@see GitOperationRecorder} seam,
 * extracted from {@see GitService} unchanged and moved to `client-area-legacy`,
 * together with the history read the CA's git log table pages
 * through.
 *
 * Permanent panel code: the git operation history is the old panel's design
 * and the Engine does not need to keep one (checked 2026-10-14), so it moved
 * from client-area-legacy into the controller.
 * It is the `GitOperationRecorder` default; the pass-through default that
 * recorded nothing is gone.
 */
final class GitOperationLog implements GitOperationRecorder
{
    /**
     * Run one Engine git call and record its outcome in the panel's operation
     * log (the Engine keeps none). A failed call still bubbles; the row keeps
     * the reason for the CA's log table.
     *
     * A `202 + Task` (a deploy-managed checkout) is accepted but not done: the
     * row is written `in_progress` with the task id and a watcher settles it.
     *
     * @template T
     * @param  callable(): T  $operation
     * @param  (callable(T): string)|null  $status
     * @param  array<string, mixed>  $attributes  row columns the Engine result does not carry (the switch's branches)
     * @return T
     */
    public function record(Application $application, string $action, callable $operation, ?callable $status = null, ?string $skippedMessage = null, array $attributes = []): mixed
    {
        try {
            $result = $operation();
        } catch (EngineException $e) {
            GitOperation::query()->create([
                'application_id' => $application->id,
                'action' => $action,
                'status' => GitOperation::STATUS_FAILED,
                'error_message' => EngineErrors::message($e),
            ] + $attributes);

            throw $e;
        }

        if ($result instanceof Response && $result->status() === 202) {
            $taskId = Payload::int($result->json('data.id'));
            $operation = GitOperation::query()->create([
                'application_id' => $application->id,
                'action' => $action,
                'status' => GitOperation::STATUS_IN_PROGRESS,
                'engine_task_id' => $taskId,
            ] + $attributes);

            if ($taskId !== null) {
                WatchGitOperationJob::dispatch($application->id, $operation->id, $taskId);
            }

            return $result;
        }

        $finalStatus = $status === null ? GitOperation::STATUS_SUCCESS : $status($result);
        $commit = $this->commitAttributes($application, $result);

        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => $action,
            'status' => $finalStatus,
            'error_message' => $finalStatus === GitOperation::STATUS_SKIPPED ? $skippedMessage : null,
        ] + $commit + $attributes);

        // A pulled head is the commit the Engine rebuilds from; the same read
        // feeds the operation row, so no extra Engine call. An empty $commit
        // (no head read) changes nothing.
        if ($action === GitOperation::ACTION_PULL && $finalStatus === GitOperation::STATUS_SUCCESS) {
            DeployedCommit::store($application, $commit);
        }

        return $result;
    }

    public function recordClone(Application $application): void
    {
        // The Engine connect performs the initial clone; the old install logged
        // it as `clone` (old `DeployInstance` → `GitDeploymentLog::ACTION_CLONE`).
        GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_CLONE,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);
    }

    /**
     * Record one `webhook_pull` git operation for an auto-deploy delivery (the
     * old `GitAutoDeploy` job's `GitDeploymentLog::start(… ACTION_WEBHOOK_PULL)`).
     * The import re-reads the retained deliveries, so an `in_progress` row is
     * settled on the next run; a delivery without a commit is not a git
     * operation.
     *
     * @param  array<string, mixed>  $delivery
     */
    public function recordWebhookPull(Application $application, array $delivery, ?Carbon $createdAt, bool $finished, ?string $result): void
    {
        $commit = Payload::nullableString($delivery['commit'] ?? null);
        if ($commit === null || $commit === '') {
            return;
        }

        $conditions = [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_WEBHOOK_PULL,
            'commit_hash' => $commit,
        ];
        if ($createdAt !== null) {
            $conditions['created_at'] = $createdAt;
        }

        $existing = GitOperation::query()->where($conditions)->first();

        $outcome = Payload::nullableString($delivery['outcome'] ?? null);
        $alreadySettled = $existing !== null && $existing->status !== GitOperation::STATUS_IN_PROGRESS;
        if ($alreadySettled) {
            return;
        }

        [$status, $error] = match (true) {
            in_array($outcome, ['ignored', 'rejected'], true) => [GitOperation::STATUS_SKIPPED, GitService::ALREADY_UP_TO_DATE_MESSAGE],
            ! $finished => [GitOperation::STATUS_IN_PROGRESS, null],
            in_array($result, ['deployed', 'partial'], true) => [GitOperation::STATUS_SUCCESS, null],
            $result === 'superseded' => [GitOperation::STATUS_SKIPPED, GitService::ALREADY_UP_TO_DATE_MESSAGE],
            default => [GitOperation::STATUS_FAILED, Payload::nullableString($delivery['detail'] ?? null)],
        };

        if ($existing !== null) {
            $existing->forceFill(['status' => $status, 'error_message' => $error])->save();

            return;
        }

        $operation = new GitOperation([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_WEBHOOK_PULL,
            'status' => $status,
            'error_message' => $error,
        ] + GitOperation::commitAttributes([
            'hash' => $commit,
            'date' => $createdAt?->toIso8601String(),
        ]));
        $operation->created_at = $createdAt ?? now();
        $operation->save();
    }

    /**
     * The panel-owned git operation history the CA's log table reads (moved
     * from `GitService::gitOperations()`).
     *
     * @param  array<string, mixed>  $params  CA query (`page`, `per_page`, `sort_by`, `sort_dir`)
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function history(Application $application, array $params): array
    {
        $page = max(1, Payload::int($params['page'] ?? null) ?? 1);
        $perPage = Payload::int($params['per_page'] ?? null) ?? 10;
        if ($perPage < 1 || $perPage > 100) {
            $perPage = 10;
        }

        $sortDir = ($params['sort_dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

        $paginator = GitOperation::query()
            ->where('application_id', $application->id)
            ->orderBy('created_at', $sortDir)
            ->orderBy('id', $sortDir)
            ->paginate($perPage, ['*'], 'page', $page);

        return [
            'data' => array_values(array_map(
                fn (GitOperation $operation): array => $this->presentOperation($operation),
                $paginator->items(),
            )),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * One row of the CA's git log table (old `InstanceGitDeploymentLogResource`).
     * `commit_at` is nullable, so narrow the cast instead of trusting it.
     *
     * @return array<string, mixed>
     */
    private function presentOperation(GitOperation $operation): array
    {
        $commitAt = $operation->commit_at;
        $createdAt = $operation->created_at;

        return [
            'id' => $operation->id,
            'action' => $operation->action,
            'status' => $operation->status,
            'branch_from' => $operation->branch_from,
            'branch_to' => $operation->branch_to,
            'commit_hash' => $operation->commit_hash,
            'commit_message' => $operation->commit_message,
            'commit_at' => $commitAt instanceof Carbon ? $commitAt->toJSON() : null,
            'error_message' => $operation->error_message,
            'created_at' => $createdAt instanceof Carbon ? $createdAt->toJSON() : null,
        ];
    }

    /**
     * The commit a git operation left HEAD at, for the CA's commit column
     * (`GitLogsTable.vue:72-83`): from the Engine result when it carries one,
     * else from the checkout's newest commit (`GET git/commits?limit=1`). The
     * Engine's git result is a status without a commit, so the HEAD read is the
     * normal path. A commit the panel cannot read leaves the columns null.
     *
     * @return array<string, mixed>
     */
    private function commitAttributes(Application $application, mixed $result): array
    {
        $commit = null;
        if (is_array($result)) {
            $candidate = Payload::object($result['commit'] ?? null);
            if ($candidate !== []) {
                $commit = $candidate;
            }
        }

        $commit ??= $this->headCommit($application);

        return $commit === null ? [] : GitOperation::commitAttributes($commit);
    }

    /**
     * The newest commit of the checkout (Engine `git/commits` is newest-first),
     * or null when the Engine cannot read it.
     *
     * @return array<string, mixed>|null
     */
    private function headCommit(Application $application): ?array
    {
        try {
            $rows = (new ProjectsApi($application->engine()))->gitCommits($application->engineProject(), $application->gitBranch(), 1);
        } catch (EngineException $e) {
            report($e);

            return null;
        }

        return $rows[0] ?? null;
    }
}
