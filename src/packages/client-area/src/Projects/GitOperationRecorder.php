<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A seam: the panel-owned git operation log (the Engine
 * keeps no git operation history, only the current checkout).
 *
 * The controller default is the `git_operations` log {@see GitOperationLog}
 * (`bindIf`, so an edition may still replace it); the Engine does not need to
 * keep the history. The action and status values the callers pass are defined here.
 */
interface GitOperationRecorder
{
    public const string ACTION_PULL = 'pull';

    public const string ACTION_PUSH = 'push';

    public const string ACTION_REVERT = 'revert';

    public const string ACTION_BRANCH_CHANGE = 'branch_change';

    public const string STATUS_SUCCESS = 'success';

    public const string STATUS_SKIPPED = 'skipped';

    /**
     * Run one Engine git call and record its outcome in the panel operation
     * log. A failed call still bubbles after the failed row is written; a
     * `202 + Task` is recorded `in_progress` with the task id and a watcher.
     *
     * @template T
     * @param  callable(): T  $operation
     * @param  (callable(T): string)|null  $status
     * @param  array<string, mixed>  $attributes  row columns the Engine result does not carry (the switch's branches)
     * @return T
     */
    public function record(Application $application, string $action, callable $operation, ?callable $status = null, ?string $skippedMessage = null, array $attributes = []): mixed;

    /**
     * Record the initial `clone` operation of a fresh git connect.
     */
    public function recordClone(Application $application): void;

    /**
     * Record/settle one `webhook_pull` operation for an auto-deploy delivery.
     *
     * @param  array<string, mixed>  $delivery
     */
    public function recordWebhookPull(Application $application, array $delivery, ?Carbon $createdAt, bool $finished, ?string $result): void;
}
