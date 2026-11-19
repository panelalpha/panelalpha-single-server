<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
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
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * Attaches the git source to the container project the onboarding domain step
 * created, once that project's create task has finished.
 * The domain step answers `202` while the Engine still builds the
 * container, and `POST /projects/{u}/source` answers a busy 409 until then
 * (`ProjectRebuild::whileIdle`, core/app/Lib/Project/ProjectRebuild.php:123 and
 * `DeployBusyException`). The attach therefore retries inside this job, so the
 * Client Area gets the old-style accepted answer and follows the deploy log
 * like the files onboarding; a definite `project_not_eligible` or any other
 * non-transient refusal notifies `installation_failed`.
 *
 * Once the Engine accepts, the task goes to the controller's
 * {@see WatchDeployJob}, which follows the source rebuild to its end (the same
 * watcher the files deploy uses). A `source_already_attached` means another
 * deploy is already following the source, so this attach ends without a
 * failure or notification. The job carries its own
 * state: the panel keeps no deploy row.
 *
 * Permanent panel code: the Engine attaches a source to a container project
 * only, and the classic replacement the CA's domain step needs with several
 * services is panel code, so this moved from client-area-legacy into the
 * controller.
 */
final class AttachGitSourceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public const QUEUE = 'engine-tasks';

    /** Hard wall-clock cap from the first attempt. */
    public const WALL_CLOCK_SECONDS = 1800;

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

    public function handle(): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $startedAt = $this->startedAt > 0 ? $this->startedAt : now()->getTimestamp();

        try {
            $taskId = (new ProjectsApi($application->engine()))->attachSource($application->engineProject(), $this->source);
        } catch (EngineUnavailableException) {
            $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

            return;
        } catch (EngineRequestException $e) {
            // The source is already attached: this attach duplicates the
            // deploy the CA is already following, so it ends without a failure
            // or notification.
            if ($e->engineStatus === 409 && self::hasProblemCode($e, 'source_already_attached')) {
                return;
            }

            if ($e->engineStatus === 409 && ! self::isDefiniteAttachConflict($e)) {
                // The create task is still preparing the container: wait.
                $this->retryLater($application, $startedAt, 0);

                return;
            }

            if ($e->engineStatus >= 500) {
                $this->retryLater($application, $startedAt, $this->hiccupAttempt + 1);

                return;
            }

            $this->fail($application, EngineErrors::message($e));

            return;
        } catch (EngineValidationException $e) {
            $this->fail($application, EngineErrors::message($e));

            return;
        }

        GitSourceRecord::store($application, $this->source['git_repo'], $this->source['git_token']);

        WatchDeployJob::dispatch(
            $application->id,
            $taskId,
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

        ClientAreaNotificationRequested::dispatch($application, $this->failedType, message: 'The git source attach stopped.', isError: true);
    }

    /**
     * Re-dispatch the next attempt: a busy project polls after
     * {@see self::POLL_SECONDS}, an Engine hiccup backs off. The wall-clock cap
     * ends the attach so the CA spinner never hangs.
     */
    private function retryLater(Application $application, int $startedAt, int $hiccupAttempt): void
    {
        if (now()->getTimestamp() >= $startedAt + self::WALL_CLOCK_SECONDS) {
            $this->fail($application, 'The project did not become ready for its git source in time.');

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
        ClientAreaNotificationRequested::dispatch($application, $this->failedType, message: $message, isError: true);
    }

    /**
     * Whether the Engine refusal carries a stable `problems[].code`
     * (`core/app/Exceptions/ProblemException.php:38`, rendered by the Engine
     * handler beside `errors`).
     */
    private static function hasProblemCode(EngineRequestException $e, string $code): bool
    {
        foreach (Payload::objects($e->response?->json('problems')) as $problem) {
            if (Payload::nullableString($problem['code'] ?? null) === $code) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether the Engine's 409 is a definite refusal of the git source
     * (`SourceAttacher::assertEligible`, core/app/Lib/Project/SourceAttacher.php:82-99)
     * rather than the project still preparing (`ProjectRebuild::whileIdle`). The
     * definite refusals carry a `problems[].code`; the busy ones do not
     * (`core/app/Exceptions/DeployBusyException.php`).
     */
    private static function isDefiniteAttachConflict(EngineRequestException $e): bool
    {
        return self::hasProblemCode($e, 'source_already_attached')
            || self::hasProblemCode($e, 'project_not_eligible');
    }
}
