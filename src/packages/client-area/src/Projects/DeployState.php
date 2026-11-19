<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;

/**
 * A container project's deploys as the Engine reports them, in the Client
 * Area's vocabulary (the Engine lists its deploys since `53c9a6ff4`).
 *
 * The installation state (`async_status.installation`) comes from
 * the synced project first: the Engine records the outcome of the latest deploy
 * in `details.deployment_status` (`success|partial|failed`, `Jobs/DeployProject.php:184-208`,
 * `System/Project/Deployment/FailureRetention.php:31-39`) and sets
 * `details.deployed_before` when a deploy fails after one succeeded, so a failed
 * redeploy never undoes an install. Only a project whose install has not
 * succeeded – it failed, or it was created within {@see self::INSTALL_WINDOW_SECONDS}
 * and has no outcome yet – reads its newest deploy from `GET /projects/{u}/deploys`
 * to tell a running install or retry apart; every other row makes no Engine
 * call, so the project list stays one sync.
 *
 * The Engine's deploy statuses are `running|success|partial|failed|cancelled`
 * plus `unknown` for an older log that ends without a verdict
 * (`OpenApi/Schemas/DeployHistoryItemSchema.php:11`); the CA translates
 * `deployLogs.status.<status>` and treats `failed`/`cancelled` as failures
 * (`components/deploy/deployLogUi.js:11-13`). Its sources are
 * `git|hook|archive|rebuild|template`; the CA translates only
 * `deployLogs.source.git|files`.
 */
final class DeployState
{
    public const string STATUS_RUNNING = 'running';

    public const string STATUS_FINISHED = 'finished';

    public const string STATUS_FAILED = 'failed';

    public const string STATUS_CANCELLED = 'cancelled';

    public const string SOURCE_GIT = 'git';

    public const string SOURCE_FILES = 'files';

    /** The CA's `async_status.installation` values (`apis/Instances.js:235-243`). */
    public const string INSTALL_IN_PROGRESS = 'in_progress';

    public const string INSTALL_FINISHED = 'finished';

    public const string INSTALL_FAILED = 'failed';

    /**
     * How long after its creation a project without a recorded deploy outcome
     * may still be installing: the deploy watcher's wall-clock cap
     * (`WatchDeployJob::WALL_CLOCK_SECONDS`). An older project without one
     * never deployed through the Engine's pipeline and reads as not installing,
     * with no Engine call.
     */
    public const int INSTALL_WINDOW_SECONDS = 3600;

    /**
     * The installation state of a non-staging project in the CA vocabulary
     * (`in_progress`, `finished`, `failed`), or null when it has none: a classic
     * project, a project still waiting for its files – a files-onboarding one,
     * or one whose create deploy waits on the Engine ({@see self::waitsForFiles()})
     * – or an older project without a recorded deploy outcome.
     */
    public function installation(Application $application): ?string
    {
        // A WordPress import fills the project on the Engine; the
        // panel follows it. A dead run (`stale`) reads as failed, so the CA
        // offers its quick-retry.
        $import = $application->wordpressImport;
        if ($import !== null) {
            return match (true) {
                $import->status === WordPressImport::COMPLETED => self::INSTALL_FINISHED,
                in_array($import->status, [WordPressImport::FAILED, WordPressImport::CANCELLED], true), $import->isStale() => self::INSTALL_FAILED,
                default => self::INSTALL_IN_PROGRESS,
            };
        }

        // "Install WordPress" on a classic project is the panel's own job.
        $install = $application->wordpressInstall;
        if ($install !== null) {
            return match ($install->status) {
                WordPressInstall::FINISHED => self::INSTALL_FINISHED,
                WordPressInstall::FAILED => self::INSTALL_FAILED,
                default => self::INSTALL_IN_PROGRESS,
            };
        }

        if ($application->onboarding_files_at !== null) {
            return null;
        }
        // A row the panel just asked the Engine to create (`pending`, no synced
        // payload yet) is read like a container project.
        if (! $application->isContainer() && $application->status !== 'pending') {
            return null;
        }

        $details = Payload::object(($application->engine_payload ?? [])['details'] ?? null);
        $outcome = Payload::nullableString($details['deployment_status'] ?? null);
        if (in_array($outcome, ['success', 'partial'], true)) {
            return self::INSTALL_FINISHED;
        }

        $failed = $outcome === 'failed';
        if ($failed && ($details['deployed_before'] ?? null) === true) {
            // A redeploy failed after the install succeeded.
            return self::INSTALL_FINISHED;
        }

        if (! $failed && ! $this->mayStillInstall($application)) {
            return null;
        }

        try {
            $newest = $this->newestDeploy($application);
        } catch (EngineException $e) {
            // Best effort: the synced outcome stands until the Engine answers.
            report($e);

            return $failed ? self::INSTALL_FAILED : null;
        }

        $status = $newest === null ? null : Payload::nullableString($newest['status'] ?? null);
        if ($status === 'running') {
            if ($newest !== null && self::waitsForFiles($newest)) {
                // A project that waits for its files has no install the panel
                // can show or cancel.
                return $failed ? self::INSTALL_FAILED : null;
            }

            // The install, or a retry of a failed one, is running.
            return self::INSTALL_IN_PROGRESS;
        }
        if ($failed) {
            return self::INSTALL_FAILED;
        }
        if ($status === null) {
            // Nothing logged yet: a project the panel just created is waiting
            // for its create task to start the deploy.
            return $application->status === 'pending' ? self::INSTALL_IN_PROGRESS : null;
        }

        // The mirror has not seen the outcome yet.
        return self::caStatus($status) === self::STATUS_FINISHED ? self::INSTALL_FINISHED : self::INSTALL_FAILED;
    }

    /**
     * Whether the project's install failed and nothing is retrying it – what the
     * old panel's `cannot_retry_installation` guard and staging refusal read.
     */
    public function installationFailed(Application $application): bool
    {
        return $this->installation($application) === self::INSTALL_FAILED;
    }

    /**
     * Whether the Engine lists a git deploy of the project that is running or
     * succeeded – the git onboarding the CA is already following;
     * a project that deploys from git would refuse a second attach anyway
     * (`source_already_attached`).
     * An Engine failure bubbles: the attach the caller would make next needs the
     * Engine too.
     */
    public function hasGitInstall(Application $application): bool
    {
        foreach ((new ProjectsApi($application->engine()))->deploys($application->engineProject()) as $deploy) {
            if (Payload::nullableString($deploy['source'] ?? null) === 'git'
                && in_array(Payload::nullableString($deploy['status'] ?? null), ['running', 'success', 'partial'], true)
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Follow a deploy the Engine accepted: the watcher polls its task and log and
     * sends the CA notification it is given when it ends. After commit: a caller
     * that changes the row inside a transaction (the files onboarding clears its
     * marker with it) starts the watcher only once that is durable; outside a
     * transaction this dispatches now. `$sourceType` (`git`/`files`) names
     * what a kept task tail installed from.
     */
    public function follow(Application $application, ?int $taskId, DeployWatch $watch, string $sourceType): void
    {
        // The first accepted deploy ends the files onboarding, whichever route
        // started it: the marker only silences the Engine's waiting-for-files
        // create deploy of that window.
        if ($application->onboarding_files_at !== null) {
            $application->forceFill(['onboarding_files_at' => null])->save();
        }

        WatchDeployJob::dispatch(
            $application->id,
            $taskId,
            $watch->finishedType,
            $watch->failedType,
            archivePath: $watch->archivePath,
            sourceType: $sourceType,
        )->afterCommit();
    }

    /**
     * Whether the Engine runs a deploy of the project – its newest deploy is
     * `running` – so a second one must be refused with the old 409. A project
     * still in files onboarding has not deployed yet: the Engine's create deploy
     * waits there for the archive (`running`, `DeployLogger::WAITING_FOR_FILES`),
     * which the onboarding upload must not count; the same wait on a project the
     * panel adopted (`{@see self::waitsForFiles()}`) is what the upload delivers.
     * An Engine failure bubbles: the deploy that follows needs the Engine too.
     */
    public function isDeployRunning(Application $application): bool
    {
        if ($application->onboarding_files_at !== null) {
            return false;
        }

        $newest = $this->newestDeploy($application);

        return $newest !== null
            && Payload::nullableString($newest['status'] ?? null) === 'running'
            && ! self::waitsForFiles($newest);
    }

    /**
     * Whether the deploy is a create the Engine ran in its request and left
     * `running` until the project's files arrive (`DeployLogger::WAITING_FOR_FILES`):
     * a template deploy no task ran. Every deploy the panel starts is a task, so
     * this is never an install the panel started.
     *
     * @param  array<string, mixed>  $deploy
     */
    public static function waitsForFiles(array $deploy): bool
    {
        return Payload::nullableString($deploy['source'] ?? null) === 'template'
            && Payload::int($deploy['task_id'] ?? null) === null;
    }

    /**
     * A project without a recorded outcome may still be installing only for a
     * while after the panel or the Engine created it.
     */
    private function mayStillInstall(Application $application): bool
    {
        if ($application->status === 'pending') {
            return true;
        }

        $created = $application->engine_created_at;

        return $created !== null && $created->greaterThan(now()->subSeconds(self::INSTALL_WINDOW_SECONDS));
    }

    /**
     * The project's newest kept deploy (the Engine lists them newest first).
     *
     * @return array<string, mixed>|null
     */
    private function newestDeploy(Application $application): ?array
    {
        foreach ((new ProjectsApi($application->engine()))->deploys($application->engineProject()) as $deploy) {
            return $deploy;
        }

        return null;
    }

    /**
     * The CA status of an Engine deploy status. `success` and `partial` are a
     * finished deploy (a partial one carries its warning); `unknown` – a kept log
     * that ends without a verdict, i.e. a deploy whose process died – is a
     * failure, as the Engine closes such a deploy itself
     * (`DeployLogger::INTERRUPTED_MESSAGE`).
     */
    public static function caStatus(?string $engineStatus): string
    {
        return match ($engineStatus) {
            'running' => self::STATUS_RUNNING,
            'success', 'partial' => self::STATUS_FINISHED,
            'cancelled' => self::STATUS_CANCELLED,
            default => self::STATUS_FAILED,
        };
    }

    /**
     * The CA `source_type` of an Engine deploy source: a git deploy or a push
     * (`hook`) is `git`, an archive upload is `files`; a rebuild, a template or
     * an unnamed source deploys what the project already has, so it is the
     * project's own kind – `git` when the mirror has a repository, as the panel's
     * redeploy decides (`DeployService::sourceType()`).
     */
    public static function sourceType(Application $application, ?string $engineSource): string
    {
        return match ($engineSource) {
            'git', 'hook' => self::SOURCE_GIT,
            'archive' => self::SOURCE_FILES,
            default => $application->gitRepositoryUrl() !== null ? self::SOURCE_GIT : self::SOURCE_FILES,
        };
    }
}
