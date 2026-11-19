<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\StagingRetrier;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;

/**
 * The `StagingRetrier` seam: today's retry-staging workaround
 * extracted verbatim from `StagingService::retry()`.
 *
 * The Engine has no "restage into the existing project" call, so the panel
 * removes the failed project and creates it again under the **same** username
 * and, where the Engine can serve it, the same domain.
 *
 * Permanent panel code: the Engine does not need such a call (checked
 * 2026-10-14: delete and re-create loses nothing), so the retrier moved from
 * client-area-legacy back into the controller and is
 * the `StagingRetrier` default; the refusing `NullStagingRetrier` is gone.
 */
final class DeleteAndRecreateStagingRetrier implements StagingRetrier
{
    public function __construct(private readonly ApplicationSynchronizer $synchronizer) {}

    /**
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    public function retry(Application $parent, Application $staging, array $params): Application
    {
        // A copy that is still running has a live destination the retry would
        // destroy; refuse before any Engine call so no second watcher starts
        //A marker older than the watcher cap plus its maximum
        // backoff is stale and ignored, so the retry is allowed again
        // (Application::isStagingCreating).
        if ($staging->isStagingCreating()) {
            throw ValidationException::withMessages([StagingService::CANNOT_RETRY]);
        }

        // Re-running the copy deletes the destination; only a failed install
        // (or a destination the Engine already dropped) may be retried.
        if (! $this->stagingIsRetryable($staging)) {
            throw ValidationException::withMessages([StagingService::CANNOT_RETRY]);
        }

        $requested = $this->nonEmptyString($params['domain'] ?? null);
        if ($requested !== null && StagingService::inOnlineZone($requested)) {
            throw ValidationException::withMessages(['domain' => [StagingService::ONLINE_DOMAIN_REFUSED]]);
        }

        try {
            // Destroying the destination account is a synchronous Engine
            // teardown like the project delete: it must not be cut off by the
            // default 30 s client timeout.
            (new ProjectsApi($parent->engine()->withTimeout(EngineClient::LONG_TIMEOUT_SECONDS)))
                ->delete($staging->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }
        }

        $api = new ProjectsApi($parent->engine());

        /** @var array{new_username?: string, domain?: string, copy_databases: bool} $engineParams */
        $engineParams = [
            'new_username' => $staging->engine_username,
            'copy_databases' => true,
        ];
        $domain = $requested ?? $staging->domain;
        // A panelalpha.online name cannot be handed to the Engine: it is stored
        // without a proxy registration. Leave it out and let the Engine allocate
        // (and register) a new one, as the first create does.
        if ($domain !== null && $domain !== '' && ! StagingService::inOnlineZone($domain)) {
            $engineParams['domain'] = $domain;
        }

        $created = $api->createStaging($parent->engineProject(), $engineParams);

        $application = $this->synchronizer->mirror($parent->engine_id, $created['project']);
        if ($application === null) {
            throw new EngineRequestException(502, 'The Engine did not return the staging project.');
        }

        $application->forceFill([
            // A retry starts a new copy: mark it creating until the watcher
            // records the outcome.
            'staging_creating_at' => now(),
            // The row may be a failed staging the synchronizer kept; a retry
            // that reached the Engine clears the marker and re-links it.
            'staging_create_failed_at' => null,
        ] + StagingService::linkFields($parent, StagingService::stagingName($parent, $staging->name, $application->name)))->save();

        // A retry re-creates the project, so the CA gets the same watcher as a
        // fresh staging (old retryStaging dispatched CreateStaging again).
        WatchStagingJob::dispatch($application->id, $created['task_id'] ?? 0, startedAt: (int) $application->staging_creating_at?->getTimestamp(), parentId: $parent->id, stagingUsername: (string) $application->engine_username)->onConnection('database');

        return $application;
    }

    /**
     * A staging copy may only be retried when it failed, or when the Engine
     * already dropped the destination (a failed copy is deleted,
     * Engine `Jobs/CreateStaging.php:86-101`, `failed()`). Any other state is a working or
     * running staging and would be destroyed.
     */
    private function stagingIsRetryable(Application $staging): bool
    {
        // A creation the panel saw fail is retryable even when the Engine
        // already dropped the destination.
        if ($staging->staging_create_failed_at !== null) {
            return true;
        }

        // The Engine writes only `running` / `completed` / `failed`; `failed` here is the mirror's lagging copy of the
        // Engine's own failure, so it is retryable without a live poll.
        $payload = Payload::object($staging->engine_payload);
        $details = Payload::object($payload['details'] ?? null);
        $async = Payload::object($details['async_status'] ?? null);
        $status = Payload::nullableString($async['staging'] ?? null);
        if ($status === 'failed') {
            return true;
        }

        try {
            $project = (new ProjectsApi($staging->engine()))->show($staging->engineProject());
        } catch (EngineRequestException $e) {
            // 404: the Engine already cleaned up the failed copy.
            return $e->engineStatus === 404;
        }

        // The mirror payload can lag the Engine; the live status decides whether
        // the copy failed (failed installs may be retried).
        $details = Payload::object($project['details'] ?? null);
        $async = Payload::object($details['async_status'] ?? null);
        $live = Payload::nullableString($async['staging'] ?? null);

        return $live === 'failed';
    }

    private function nonEmptyString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
