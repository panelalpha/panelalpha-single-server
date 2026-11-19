<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitOperationRecorder;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * One panel-side git operation of a project (`git/logs`).
 *
 * The Engine keeps no operation history, so pull / push / revert / branch
 * changes are recorded
 * here with their outcome for the Client Area's log table (old
 * `git_deployment_logs`). The action and status values match the old model so
 * the CA's translations keep working.
 *
 * @property int $id
 * @property int $application_id
 * @property string $action
 * @property string $status
 * @property int|null $engine_task_id Engine task that settles a queued operation
 * @property string|null $branch_from Branch the checkout was on, for a switch
 * @property string|null $branch_to Branch the checkout switched to
 * @property string|null $commit_hash
 * @property string|null $commit_message
 * @property Carbon|null $commit_at
 * @property string|null $error_message
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property Application $application
 *
 * Permanent panel code: the git operation history is the old panel's design
 * and the Engine does not need to keep one (checked 2026-10-14), so it moved
 * from client-area-legacy into the controller.
 */
class GitOperation extends Model
{
    use Prunable;

    public const string ACTION_PULL = GitOperationRecorder::ACTION_PULL;

    public const string ACTION_PUSH = GitOperationRecorder::ACTION_PUSH;

    public const string ACTION_REVERT = GitOperationRecorder::ACTION_REVERT;

    /** A branch switch of the checkout; the Engine rebuilds, so the row stays `in_progress` until it ends. */
    public const string ACTION_BRANCH_CHANGE = GitOperationRecorder::ACTION_BRANCH_CHANGE;

    /** The old `GitDeploymentLog::ACTION_CLONE`: the first git connect clones. */
    public const string ACTION_CLONE = 'clone';

    /** The old `GitDeploymentLog::ACTION_WEBHOOK_PULL`: an auto-deploy delivery. */
    public const string ACTION_WEBHOOK_PULL = 'webhook_pull';

    public const string STATUS_IN_PROGRESS = 'in_progress';

    public const string STATUS_SUCCESS = GitOperationRecorder::STATUS_SUCCESS;

    public const string STATUS_FAILED = 'failed';

    public const string STATUS_SKIPPED = GitOperationRecorder::STATUS_SKIPPED;

    protected $fillable = [
        'application_id',
        'action',
        'status',
        'engine_task_id',
        'branch_from',
        'branch_to',
        'commit_hash',
        'commit_message',
        'commit_at',
        'error_message',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'engine_task_id' => 'integer',
            'commit_at' => 'datetime',
        ];
    }

    /**
     * Rows past the retention window; the scheduler runs
     * `model:prune` for this model.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        $days = Payload::int(config('client-area.git_operation_retention_days', 30)) ?? 30;

        return static::query()->where('created_at', '<', now()->subDays($days));
    }

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    /**
     * The panel commit columns of an Engine `git/commits` row (newest-first):
     * `hash`, `subject`, `date` → `commit_hash`, `commit_message`, `commit_at`.
     * A malformed row leaves the columns null rather than inventing data. The
     * Engine `date` is converted to UTC, so its offset is not dropped by the
     * datetime cast.
     *
     * @param  array<string, mixed>  $commit
     * @return array{commit_hash: string|null, commit_message: string|null, commit_at: Carbon|null}
     */
    public static function commitAttributes(array $commit): array
    {
        $date = Payload::nullableString($commit['date'] ?? null);
        $at = null;
        if ($date !== null && $date !== '') {
            try {
                // An Engine `git/commits` `date` carries the author's UTC offset
                // (recorded: `2026-03-20T09:28:21-04:00`); the panel stores UTC, so
                // convert before the datetime cast drops the offset.
                $at = Carbon::parse($date)->utc();
            } catch (Throwable) {
                $at = null;
            }
        }

        return [
            'commit_hash' => Payload::nullableString($commit['hash'] ?? null),
            'commit_message' => Payload::nullableString($commit['subject'] ?? $commit['message'] ?? null),
            'commit_at' => $at,
        ];
    }
}
