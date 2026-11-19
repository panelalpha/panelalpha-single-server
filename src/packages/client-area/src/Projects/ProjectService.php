<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Events\ProjectDeletedByUser;
use PanelAlpha\ClientArea\Events\ProjectsUnmirrored;
use PanelAlpha\ClientArea\Jobs\Application\CopyProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\DeleteProjectJob;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Application lifecycle operations that touch the Engine.
 *
 * Deleting a project is the one place that needs to know both the Engine's
 * refusal semantics and the panel mirror: the Engine answers 409 while a task
 * runs ('busy'), and a 404 means the project is already gone, so the panel
 * mirror is cleaned up either way.
 */
final class ProjectService
{
    public function __construct(
        private readonly GitService $git,
        private readonly WordPressImportService $imports,
    ) {}

    /**
     * Clone a project on the Engine (`POST /projects/{u}/clone`, synchronous)
     * and mirror the result (old
     * CopyInstanceController::store). The clone runs on the `long` queue: the
     * HTTP request only accepts the copy and the CA gets
     * `user.instance.installation_finished|failed` when it ends.
     * Since Engine 2.2.0 the clone points a copied WordPress at its own
     * database and host, so every project kind is copied.
     */
    public function copy(Application $source): void
    {
        CopyProjectJob::dispatch($source->id);
    }

    /** Tells the admins about a user's own delete; a staging's and an admin's send nothing. */
    public function announceUserDelete(Application $application): void
    {
        if ($application->staging_of_id === null) {
            ProjectDeletedByUser::dispatch($application);
        }
    }

    /**
     * Delete an application on the Engine and drop the local mirror.
     *
     * @return bool false when $deferWhileBusy left a busy Engine's delete to DeleteProjectJob
     *
     * @throws EngineRequestException 409 when the Engine is busy and the delete is not deferred
     */
    public function delete(Application $application, bool $deferWhileBusy = false): bool
    {
        // The Engine refuses to delete a live project that has a staging with a
        // 500; check locally and answer the old 422.
        if ($application->stagings()->exists()) {
            // Old text `cannot_remove_with_existing_staging` (messages.php:167).
            throw ValidationException::withMessages([
                'Cannot remove instance with existing staging instance.',
            ]);
        }

        // A staging whose creation the Engine confirmed failed is only removed
        // locally when a `show` answers 404. `async_status.staging = failed`
        // does not prove the destination is gone: the Engine marks the failure
        // before it destroys the destination (`Jobs/CreateStaging.php:99-100`),
        // so the delete must still reach the Engine and treat its 404 as
        // "already gone". A still **creating** staging has
        // a destination on the Engine, so it takes the normal Engine delete;
        // its 409 while the copy runs bubbles. A creating marker
        // older than the watcher cap plus its maximum backoff is stale and
        // ignored (Application::isStagingCreating).
        if ($application->staging_create_failed_at !== null) {
            try {
                (new ProjectsApi($application->engine()))->show($application->engineProject());
            } catch (EngineRequestException $e) {
                // Only a `show` 404 proves the destination is already gone, so
                // the row can be dropped without an Engine teardown. Any other
                // answer (403/409/5xx) does not prove it: fall through to the
                // Engine DELETE, the authoritative teardown.
                if ($e->engineStatus === 404) {
                    $application->delete();
                    ProjectsUnmirrored::dispatch($application->engine_id);

                    return true;
                }
            }
        }

        // An import into the project is cancelled (or its ended record
        // dropped) first, so the Engine stops filling a project that goes.
        $this->imports->forget($application);

        // The provider webhook is the panel's to remove; the Engine project
        // delete takes the Engine hook with it. Persist-after-accept: only remove
        // the third-party hook after the Engine accepted.
        try {
            // The Engine tears the project down synchronously; the CA consumes
            // the result in this response, so the call stays here but must not
            // be cut off by the default 30 s client timeout.
            (new ProjectsApi($application->engine()->withTimeout(EngineClient::LONG_TIMEOUT_SECONDS)))
                ->delete($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 409 && $deferWhileBusy) {
                DeleteProjectJob::dispatch($application->id);

                return false;
            }

            // Already gone on the Engine: treat as deleted so the CA stops
            // showing it (the old panel did the same for a 404).
            if ($e->engineStatus !== 404) {
                throw $e;
            }
        }

        $this->git->deleteProviderWebhook($application);
        $application->delete();
        // The project leaves its owners' Connect AI scopes.
        ProjectsUnmirrored::dispatch($application->engine_id);

        return true;
    }
}
