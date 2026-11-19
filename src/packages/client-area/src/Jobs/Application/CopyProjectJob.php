<?php

namespace PanelAlpha\ClientArea\Jobs\Application;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Throwable;

/**
 * Clones a project on the Engine (`POST /projects/{u}/clone`;
 * on an Engine 2.3.0 a create with a `project` source, followed by WatchCopyJob).
 *
 * The Engine clone is synchronous (a server-side rsync), so the HTTP request
 * only queues this job on the `long` queue and answers 202 – the CA ignores the
 * copy response body (`CopyInstance.vue:235`) and waits for
 * `user.instance.installation_finished|failed` (old
 * CopyInstanceController dispatched InstallInstance).
 */
final class CopyProjectJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    /**
     * The Engine clone can take minutes (rsync); the long worker allows 1800 s
     * and the per-call Engine timeout sits below this.
     */
    public int $timeout = 1750;

    public const QUEUE = 'long';

    public const FINISHED_TYPE = 'user.instance.installation_finished';

    public const FAILED_TYPE = 'user.instance.installation_failed';

    public function __construct(public readonly int $applicationId)
    {
        $this->onQueue(self::QUEUE);
        $this->onConnection('database-long');
    }

    public function handle(ApplicationSynchronizer $synchronizer): void
    {
        $source = Application::query()->find($this->applicationId);
        if ($source === null) {
            return;
        }

        try {
            $projects = new ProjectsApi($source->engine());
            if ($projects->copiesAsCreate()) {
                $this->copyAsCreate($projects, $source);

                return;
            }

            // A server-side rsync with no Engine task: never rely on the default
            // 30 s client timeout. A classic
            // clone copies the source's databases explicitly, as the old panel did.
            $clone = (new ProjectsApi($source->engine()->withTimeout(EngineClient::LONG_TIMEOUT_SECONDS)))->clone($source->engineProject(), ['copy_databases' => true]);
        } catch (EngineException|EngineValidationException $e) {
            ClientAreaNotificationRequested::dispatch($source, self::FAILED_TYPE, message: EngineErrors::message($e), isError: true);

            return;
        }

        $application = $synchronizer->mirror($source->engine_id, $clone, panelCreated: true);
        if ($application === null) {
            ClientAreaNotificationRequested::dispatch($source, self::FAILED_TYPE, message: 'The Engine did not return the cloned project.', isError: true);

            return;
        }

        ClientAreaNotificationRequested::dispatch($application, self::FINISHED_TYPE, includeInstance: true);
    }

    /**
     * Engine 2.3.0: the copy is a create with a `project` source (202 +
     * `CopyProject` task, engine-699-migration.md B11), so no HTTP call is
     * held open for the rsync; WatchCopyJob follows the task and mirrors the
     * copy. The databases are copied, as with the clone.
     *
     * The copy's Engine account rows exist at the 202 (Engine
     * `ProjectCopier::queue()` -> `prepare()`), with the Engine's suspension
     * status `active`, while the task still rsyncs files and databases. A
     * local `pending` row is recorded at once, as the provisioner does for a
     * create, so the first sync cannot insert the copy as `active`: see
     * `ApplicationSynchronizer::stillCreating()`. A sync fills in the rest;
     * `WatchCopyJob` mirrors the copy when the task ends.
     *
     * @throws EngineException|EngineValidationException
     */
    private function copyAsCreate(ProjectsApi $projects, Application $source): void
    {
        $task = Payload::object($projects->copy($source->engineProject(), copyDatabases: true)->json('data'));
        $username = Payload::nullableString($task['username'] ?? null);
        $taskId = Payload::int($task['id'] ?? null);
        if ($username === null || $username === '' || $taskId === null || $taskId <= 0) {
            ClientAreaNotificationRequested::dispatch($source, self::FAILED_TYPE, message: 'The Engine did not return the cloned project.', isError: true);

            return;
        }

        $details = Payload::object($task['details'] ?? null);

        // Same columns and ownership as the row the sync / WatchCopyJob's
        // mirror() writes for the copy: Community records no service, Pro's
        // single-server adoption and Multi's admin assignment decide the owner
        // through `applications.service_id`, exactly as they do for a mirrored
        // copy. The copy keeps its source's kind until the Engine's own type is
        // read.
        Application::query()->firstOrCreate(
            ['engine_id' => $source->engine_id, 'engine_username' => $username],
            [
                'domain' => Payload::nullableString($details['domain'] ?? null),
                'status' => 'pending',
                'engine_created_at' => now(),
                'panel_created_at' => now(),
                'type' => $source->type,
            ],
        );

        WatchCopyJob::dispatch($source->id, $username, $taskId, now()->getTimestamp());
    }

    /**
     * Safety net: an unexpected exception must still end the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $source = Application::query()->find($this->applicationId);
        if ($source === null) {
            return;
        }

        ClientAreaNotificationRequested::dispatch($source, self::FAILED_TYPE, message: 'The copy did not finish.', isError: true);
    }
}
