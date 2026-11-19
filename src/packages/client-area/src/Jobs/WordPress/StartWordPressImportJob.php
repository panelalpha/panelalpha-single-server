<?php

namespace PanelAlpha\ClientArea\Jobs\WordPress;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\Api\WordPressMigrationsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Throwable;

/**
 * Starts a WordPress import on the Engine (Engine 2.2.0) once the
 * classic project the import's domain step created exists:
 *
 * 1. wait until the project's create task (and any other task of it) ended –
 *    the Engine imports only into a project whose docroot holds nothing but
 *    the placeholder (`MigrationTargetResolver::assertEligible`);
 * 2. `POST /wordpress/migrations {…source, project: <username>}` – the site
 *    keeps its own domain and URLs, the project's;
 * 3. store the Engine migration id, drop the stored source (the wp-admin
 *    password or the plugin token: the Engine keeps its own encrypted copy
 *    until the import ends) and hand over to {@see WatchWordPressImportJob}.
 *
 * A refusal (the Engine's 422 problems, a create that never ended) marks the
 * import failed with the reason, keeps the source for quick-retry and sends
 * `installation_failed` (old `ImportInstance::failed`). Carries the id only;
 * runs on the `long` queue with no automatic retry.
 */
final class StartWordPressImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    /** The long worker allows 1800 s. */
    public int $timeout = 1750;

    public const QUEUE = 'long';

    public const CONNECTION = 'database-long';

    /** How long the project's create task may still run before the start gives up. */
    public const CREATE_WAIT_SECONDS = 900;

    public const POLL_SECONDS = 5;

    public const STILL_CREATING = 'The project is still being created. Retry the import in a few minutes.';

    public function __construct(public readonly int $applicationId)
    {
        $this->onConnection(self::CONNECTION);
        $this->onQueue(self::QUEUE);
    }

    public function handle(): void
    {
        $application = Application::query()->find($this->applicationId);
        $import = $application?->wordpressImport;
        if ($application === null || $import === null || $import->status !== WordPressImport::STARTING) {
            return;
        }

        if (! $this->waitForCreate($application)) {
            $this->fail($application, $import, self::STILL_CREATING);

            return;
        }

        $body = Payload::object($import->source);
        $body['project'] = (string) $application->engine_username;

        try {
            $answer = (new WordPressMigrationsApi($application->engine()))->start($body);
        } catch (EngineValidationException|EngineException $e) {
            $this->fail($application, $import, EngineErrors::message($e));

            return;
        }

        $id = Payload::int($answer['id'] ?? null);
        if ($id === null) {
            $this->fail($application, $import, 'The Engine did not return the import.');

            return;
        }

        $import->update([
            'engine_migration_id' => $id,
            'status' => Payload::nullableString($answer['status'] ?? null) ?? WordPressImport::PENDING,
            'engine_status' => $answer,
            'source' => null,
            'error' => null,
        ]);

        ImportStatusChanged::forEveryone($application->refresh());
        WatchWordPressImportJob::dispatch($application->id);
    }

    /**
     * Safety net: an unexpected exception still ends the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        $import = $application?->wordpressImport;
        if ($application === null || $import === null || $import->status !== WordPressImport::STARTING) {
            return;
        }

        $this->fail($application, $import, $exception === null ? 'The import could not be started.' : EngineErrors::message($exception));
    }

    /**
     * Whether the project has no queued or running Engine task, within
     * {@see self::CREATE_WAIT_SECONDS}.
     */
    private function waitForCreate(Application $application): bool
    {
        $deadline = now()->getTimestamp() + self::CREATE_WAIT_SECONDS;
        $api = new TasksApi($application->engine());

        while (true) {
            try {
                $active = $api->list([
                    'username' => (string) $application->engine_username,
                    'status' => 'active',
                    'scope' => 'all',
                    'per_page' => 1,
                ]);
                if ($active['total'] === 0) {
                    return true;
                }
            } catch (EngineUnavailableException $e) {
                report($e);
            }

            if (now()->getTimestamp() >= $deadline) {
                return false;
            }
            Sleep::sleep(self::POLL_SECONDS);
        }
    }

    private function fail(Application $application, WordPressImport $import, string $message): void
    {
        $import->update(['status' => WordPressImport::FAILED, 'error' => $message]);
        $application->unsetRelation('wordpressImport');

        ImportStatusChanged::forEveryone($application);
        ClientAreaNotificationRequested::dispatch($application->refresh(), InstallWordPressJob::FAILED_TYPE, message: $message, isError: true, includeInstance: true);
    }
}
