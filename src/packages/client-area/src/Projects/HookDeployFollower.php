<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitAutoDeployHooks;
use PanelAlpha\ClientArea\Projects\GitOperationRecorder;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Throwable;

/**
 * Follows a project's git-hook deploys in the Engine's deploy history.
 * The hook-delivery import into the panel's `deploy_logs` is retired, because the Engine's history lists hook deploys
 * (`trigger: hook`); this restores what the import did besides the table, from
 * that history: for every hook deploy that finished since the last one handled,
 * the old `user.instance.git_auto_deploy_finished|failed` notification, the
 * `webhook_pull` git operation and the project's last commit; and, as the
 * import did first, the provider webhook is re-registered when the Engine's
 * hook URL moved.
 *
 * Bookkeeping is one marker per project, `applications.git_hook_deploy_id`: the
 * newest finished Engine deploy (of any trigger) the follower has seen. Engine
 * deploy ids start with their start time (`Ymd-His-<6 hex>`,
 * `Lib/Deploy/DeployLog/DeployLogger.php:128`) and the Engine orders its own
 * list by them (`DeployHistory.php:65-75`), so "newer than the marker" is a
 * string comparison of two Engine ids – never a panel clock. The marker moves
 * one deploy at a time, after that deploy's side effects, so nothing is sent
 * twice. Only the newest deploy can still run (one deploy at a time), so a
 * running deploy stays above the marker until it ends. The first run sets the
 * marker to the newest finished deploy and sends nothing: deploys that ended
 * before the follower existed are never replayed.
 *
 * Permanent panel code: the Engine does not need a provider webhook (the panel
 * registers it itself, as the old panel did), so this moved from
 * client-area-legacy into the controller.
 */
final class HookDeployFollower
{
    /** An Engine deploy id (`DeployLogger.php:128`); anything else is skipped. */
    private const string DEPLOY_ID_PATTERN = '/^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$/';

    /**
     * The `detail` the Engine gave a hook delivery whose deploy failed or was
     * cancelled without an error (`Lib/DeployHook/DeliveryRunner.php:106-107`):
     * the message the old import sent.
     */
    public const string DEPLOY_FAILED_MESSAGE = 'The deploy failed.';

    public const string DEPLOY_CANCELLED_MESSAGE = 'The deploy was cancelled.';

    public function __construct(
        private readonly GitOperationRecorder $operations,
        private readonly GitAutoDeployHooks $autoDeploy,
    ) {}

    /**
     * Two Engine calls (`GET /projects/{u}/git/deploy-hook`, then
     * `GET /projects/{u}/deploys`), plus the rotate and the provider calls when
     * the hook URL moved, plus one `GET /projects/{u}/git/commits` when a new
     * hook deploy moved the checkout (message and date of that commit; when that
     * read fails, a later run reads it again). A hiccup bubbles before the
     * marker moves, so the next run retries; a 404 of the deploy list (the
     * project is gone, the sync removes the row) ends quietly.
     */
    public function follow(Application $application): void
    {
        if ($application->git_webhook_id === null) {
            return;
        }

        $api = new ProjectsApi($application->engine());
        $this->reRegisterMovedHook($api, $application);

        try {
            $deploys = $api->deploys($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return;
        }

        $finished = $this->finished($deploys);
        $marker = $application->git_hook_deploy_id;

        if ($marker === null) {
            // First run: everything listed is old (an empty marker is below
            // every Engine id, so a deploy still running now counts once it ends).
            $application->forceFill(['git_hook_deploy_id' => $finished[0]['id'] ?? ''])->save();

            return;
        }

        $lastCommit = $this->lastCommit($finished, $marker);

        foreach (array_reverse($finished) as $deploy) {
            if (strcmp($deploy['id'], $marker) <= 0) {
                continue;
            }

            if (Payload::nullableString($deploy['item']['trigger'] ?? null) === 'hook') {
                $this->handle($application, $deploy['item'], $deploy['status']);
            }

            $application->forceFill(['git_hook_deploy_id' => $deploy['id']])->save();
        }

        if ($lastCommit !== null) {
            DeployedCommit::record($application, $lastCommit['commit'], $lastCommit['branch']);
        } else {
            DeployedCommit::retryPending($application);
        }
    }

    /**
     * The Engine's address moved on since the hook was registered at the
     * provider (`url_changed_since_registration`, `Lib/DeployHook/DeployHookActions.php:59-60`):
     * the provider still calls the old URL, so re-register there – a rotate is
     * the only way to a new secret. As the retired import did: a
     * background run cannot 422, so a failed re-registration switches
     * auto-deploy off cleanly and the user re-enables it; a hook the Engine no
     * longer has (404) has nothing to re-register, and the deploys are still
     * followed.
     */
    private function reRegisterMovedHook(ProjectsApi $api, Application $application): void
    {
        try {
            $hook = $api->showDeployHook($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return;
        }

        if (($hook['url_changed_since_registration'] ?? false) !== true) {
            return;
        }

        try {
            $this->autoDeploy->rotate($application);
        } catch (Throwable $e) {
            report($e);
            $this->autoDeploy->disable($application);
        }
    }

    /**
     * The finished deploys with a valid id, newest first.
     *
     * @param  list<array<string, mixed>>  $deploys
     * @return list<array{id: string, status: string, item: array<string, mixed>}>
     */
    private function finished(array $deploys): array
    {
        $finished = [];
        foreach ($deploys as $item) {
            $id = Payload::nullableString($item['id'] ?? null);
            $status = Payload::nullableString($item['status'] ?? null);
            if ($id === null || preg_match(self::DEPLOY_ID_PATTERN, $id) !== 1 || $status === null || $status === '' || $status === 'running') {
                continue;
            }

            $finished[] = ['id' => $id, 'status' => $status, 'item' => $item];
        }

        return $finished;
    }

    /**
     * The commit a new hook deploy left the checkout at, with its branch: only a
     * `success` or `partial` deploy moved it, and only when no newer deploy (a
     * panel redeploy records its own commit) succeeded after it.
     *
     * @param  list<array{id: string, status: string, item: array<string, mixed>}>  $finished
     * @return array{commit: string, branch: string|null}|null
     */
    private function lastCommit(array $finished, string $marker): ?array
    {
        foreach ($finished as $deploy) {
            if (! in_array($deploy['status'], ['success', 'partial'], true)) {
                continue;
            }
            if (strcmp($deploy['id'], $marker) <= 0 || Payload::nullableString($deploy['item']['trigger'] ?? null) !== 'hook') {
                return null;
            }

            $commit = Payload::nullableString($deploy['item']['commit'] ?? null);
            if ($commit === null || $commit === '') {
                return null;
            }

            $branch = Payload::nullableString($deploy['item']['branch'] ?? null);

            return [
                'commit' => $commit,
                'branch' => $branch === null || $branch === '' ? null : $branch,
            ];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $item
     */
    private function handle(Application $application, array $item, string $status): void
    {
        $ok = in_array($status, ['success', 'partial'], true);
        $error = Payload::nullableString($item['error'] ?? null);
        $detail = $ok ? null : EngineText::sanitize($error !== null && $error !== ''
            ? $error
            : ($status === 'cancelled' ? self::DEPLOY_CANCELLED_MESSAGE : self::DEPLOY_FAILED_MESSAGE));

        $startedAt = Payload::int($item['started_at'] ?? null);

        // The delivery the old import read for this deploy, as the Engine
        // recorded it (`DeliveryRunner.php:104-109`: success → deployed,
        // partial → partial, failed and cancelled → deploy_failed).
        $this->operations->recordWebhookPull(
            $application,
            [
                'branch' => Payload::nullableString($item['branch'] ?? null),
                'commit' => Payload::nullableString($item['commit'] ?? null),
                'outcome' => 'queued',
                'detail' => $detail,
            ],
            $startedAt === null ? null : Carbon::createFromTimestamp($startedAt),
            true,
            match ($status) {
                'success' => 'deployed',
                'partial' => 'partial',
                default => 'deploy_failed',
            },
        );

        // The CA refetches the project on the notification: the Source card
        // must not keep the `running` deploy cached while this one ran.
        ProjectSourceDetails::forget($application);

        ClientAreaNotificationRequested::dispatch(
            $application,
            $ok ? 'user.instance.git_auto_deploy_finished' : 'user.instance.git_auto_deploy_failed',
            extra: $ok ? [] : ['message' => $detail],
            isError: ! $ok,
            includeInstance: true,
        );
    }
}
