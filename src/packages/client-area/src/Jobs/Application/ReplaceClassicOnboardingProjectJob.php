<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\GitSourceRecord;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use Throwable;

/**
 * Replaces the untouched classic project the CA's plain domain step created
 * with a container project that carries the repository, then follows the create
 * task.
 *
 * The CA never sends a `source_type` in the domain step
 * (`OnboardingModalWrapper.vue:1561-1572`), so that step creates a classic
 * project, and the Engine refuses `POST /projects/{u}/source` on it
 * (`SourceAttacher::assertEligible`, core/app/Lib/Project/SourceAttacher.php:91).
 * The replace runs in the background – the CA reads the accepted answer and
 * `async_status` and never the Engine's caller instruction. The empty classic
 * project is deleted first (`DELETE /projects/{u}`), then the container project
 * is created with the same domain and **username**, so
 * `ApplicationProvisioner::provision()` finds the panel row the CA already holds
 * (its `firstOrCreate` is keyed `engine_id` + `engine_username`) instead of
 * orphaning it. The row's `onboarding_at` marker is cleared and the create task
 * is handed to the controller's {@see WatchDeployJob}. The job carries its own
 * state: the panel keeps no deploy row.
 *
 * Permanent panel code: the Engine attaches a source to a container project
 * only, and the classic replacement the CA's domain step needs with several
 * services is panel code, so this moved from client-area-legacy into the
 * controller.
 */
final class ReplaceClassicOnboardingProjectJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    /** Hard wall-clock cap from the first attempt. */
    public const WALL_CLOCK_SECONDS = 1800;

    /**
     * How long a `replacing_at` marker keeps the row across a sync after the
     * job is lost: the wall-clock cap plus the longest backoff a survivor could
     * still be sleeping (mirrors `WatchStagingJob::STALE_AFTER_SECONDS`).
     */
    public const STALE_AFTER_SECONDS = self::WALL_CLOCK_SECONDS + self::BACKOFF_MAX_SECONDS;

    private const POLL_SECONDS = 3;

    private const BACKOFF_BASE_SECONDS = 3;

    private const BACKOFF_MAX_SECONDS = 60;

    /**
     * @param  array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>}  $source
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly array $source,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly int $startedAt = 0,
        public readonly int $hiccupAttempt = 0,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(
        ApplicationProvisioner $provisioner,
        AccessResolver $access,
    ): void {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        // 0. Keep the row across the Engine gap: the delete below removes the
        //    only Engine project with this username, so a concurrent sync would
        //    delete the row the CA holds before the create lands on it.
        $application->forceFill(['replacing_at' => now()])->save();

        // 1. Delete the empty classic project. A 404 means an earlier attempt
        //    already deleted it (the delete ran, but its answer was lost).
        try {
            (new ProjectsApi($application->engine()))->delete($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404) {
                // Already gone: continue with the create.
            } elseif ($e->engineStatus === 409) {
                // The domain-step create task is still preparing the account:
                // poll, and do not count it as a hiccup.
                $this->retryLater($application, $startedAt, 0);

                return;
            } elseif ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

                return;
            } else {
                $this->fail($application, EngineErrors::message($e));

                return;
            }
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineValidationException $e) {
            $this->fail($application, EngineErrors::message($e));

            return;
        }

        // 2. Create the container project with the same domain and username.
        $owner = $access->usersFor($application)->first();
        if (! $owner instanceof Authenticatable) {
            $this->fail($application, 'The project could not be replaced.');

            return;
        }

        try {
            $result = $provisioner->provision($owner, new ProvisionRequest(
                domain: $application->domain,
                username: $application->engine_username,
                gitRepo: $this->source['git_repo'],
                gitBranch: $this->source['git_branch'],
                gitToken: $this->source['git_token'],
                template: 'dind',
                envVars: $this->source['env_vars'],
            ));
        } catch (EngineValidationException $e) {
            $this->fail($application, EngineErrors::message($e));

            return;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus >= 500) {
                // A transient Engine failure at the create is retried with
                // backoff until the wall-clock cap.
                $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->fail($application, EngineErrors::message($e));

            return;
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

            return;
        }

        if ($result->application->id !== $application->id) {
            // The Engine ignored the requested username and the provisioner
            // mirrored a second row. Keep the row the CA already holds: move the
            // new Engine binding onto it and drop the stray row.
            $new = $result->application;
            $binding = [
                'engine_username' => $new->engine_username,
                'engine_project_id' => $new->engine_project_id,
                'engine_payload' => $new->engine_payload,
                'domain' => $new->domain,
                'status' => $new->status,
            ];
            $new->delete();
            $application->forceFill($binding)->save();
        }

        // The row is no longer a fresh classic onboarding project, and its task
        // is what the watcher follows. Clearing the marker lets the sync
        // reconcile the row again (the new Engine project already exists).
        // The replacement Engine project has no backup schedule: reopen the
        // default-schedule decision (controller column).
        $application->forceFill([
            'onboarding_at' => null,
            'replacing_at' => null,
            'auto_backup_state' => null,
            'auto_backup_attempted_at' => null,
        ])->save();

        GitSourceRecord::store($application, $this->source['git_repo'], $this->source['git_token']);

        WatchDeployJob::dispatch(
            $application->id,
            $result->taskId,
            $this->finishedType,
            $this->failedType,
            sourceType: DeployState::SOURCE_GIT,
        );
    }

    /**
     * Safety net: an unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        // The swap is over: let the sync reconcile the row again.
        $application->forceFill(['replacing_at' => null])->save();

        ClientAreaNotificationRequested::dispatch($application, $this->failedType, message: 'The project could not be replaced.', isError: true);
    }

    /**
     * Re-dispatch the next attempt: a busy delete polls after
     * {@see self::POLL_SECONDS}, an Engine hiccup backs off. The wall-clock cap
     * ends the replacement so the CA spinner never hangs.
     */
    private function retryLater(Application $application, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->fail($application, 'The project could not be replaced in time.');

            return;
        }

        $delay = $hiccupAttempt === 0
            ? self::POLL_SECONDS
            : min(self::BACKOFF_BASE_SECONDS * (2 ** ($hiccupAttempt - 1)), self::BACKOFF_MAX_SECONDS);

        self::dispatch(
            $this->applicationId,
            $this->source,
            $this->finishedType,
            $this->failedType,
            $startedAt,
            $hiccupAttempt,
        )->delay(now()->addSeconds($delay));
    }

    private function fail(Application $application, string $message): void
    {
        // The swap is over: let the sync reconcile the row again.
        $application->forceFill(['replacing_at' => null])->save();

        ClientAreaNotificationRequested::dispatch($application, $this->failedType, message: $message, isError: true);
    }
}
