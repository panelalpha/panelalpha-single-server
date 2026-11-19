<?php

namespace PanelAlpha\ClientArea\Jobs\WordPress;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\PluginPresenter;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ThemePresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\ProtectedProject;
use Throwable;

/**
 * Runs one Engine WordPress action the CA treats as async (plugin/theme install
 * & update, core update): `wp/*` is synchronous but the CA shows a spinner and
 * waits for a notification.
 *
 * Carries ids, not models; runs on the `long` queue/`database-long` connection
 * with a per-call Engine timeout long enough for WP-CLI and no automatic retry.
 * It persists the panel-owned `async_status` (pending → finished/failed) and
 * sends the plugin/theme row **built here from the Engine's final state** (old
 * `PluginResource`; the CA matches on `item.name`, `Instances.js:377-384`) with
 * `includeInstance: false`; `failed()` always ends the spinner with a generic
 * message.
 */
final class RunWordPressActionJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public const PLUGIN_INSTALL = 'plugin.install';
    public const PLUGIN_UPDATE = 'plugin.update';
    public const THEME_INSTALL = 'theme.install';
    public const THEME_UPDATE = 'theme.update';
    public const CORE_UPDATE = 'core.update';

    /**
     * A framework failure (timeout, MaxAttemptsExceeded) never forwards its raw
     * text to the CA.
     */
    public const GENERIC_FAILURE = 'The WordPress action failed.';

    public int $tries = 1;

    public int $timeout = 1700;

    public const QUEUE = 'long';

    public const CONNECTION = 'database-long';

    /** WP-CLI can run for minutes; the default 30 s would fail it. */
    public const ENGINE_TIMEOUT_SECONDS = 600;

    /** The backup an update waits for is polled every this many seconds, at most BACKUP_POLLS times. */
    public const BACKUP_POLL_SECONDS = 5;

    public const BACKUP_POLLS = 240;

    /** A backup that failed or was cancelled stops the update it was made for. */
    public const BACKUP_FAILED = 'The backup before the update failed, so WordPress was not updated.';

    public const BACKUP_TIMEOUT = 'The backup before the update did not finish in time, so WordPress was not updated.';

    /**
     * @param  array<string, mixed>  $payload  install params (slug/url) or the core version
     * @param  string|null  $itemType  plugin | theme | core
     * @param  string|null  $itemName
     * @param  string|null  $itemAction  install | update
     * @param  int|null  $backupTaskId  a backup the panel started and this action waits for
     */
    public function __construct(
        public readonly int $applicationId,
        public readonly string $action,
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly array $payload = [],
        public readonly ?string $itemType = null,
        public readonly ?string $itemName = null,
        public readonly ?string $itemAction = null,
        public readonly ?int $backupTaskId = null,
    ) {
        $this->onQueue(self::QUEUE);
        $this->onConnection(self::CONNECTION);
    }

    public function handle(PluginPresenter $plugins, ThemePresenter $themes): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $api = new WordPressApi($application->engine()->withTimeout(self::ENGINE_TIMEOUT_SECONDS), $application->wordpressInstallPath());

        try {
            // The old UpdateWordpress job wrote `in_progress` before the Engine
            // ran (UpdateWordpress.php:64); the CA gates its update spinner on
            // async_status.update (Instances.js:246).
            $this->mark(WordPressAsyncStatus::IN_PROGRESS);
            $this->run($api, $application);
        } catch (EngineException|EngineValidationException|ProjectProtectedException|ValidationException $e) {
            // An Engine 422 and a protected-project refusal are not
            // EngineExceptions – catch them too.
            report($e);
            $this->mark(WordPressAsyncStatus::FAILED);

            $payload = $this->payload($api, $application, WordPressAsyncStatus::FAILED, $plugins, $themes);
            $message = $this->engineMessage($e);
            if ($message !== null) {
                $payload['message'] = $message;
            }

            ClientAreaNotificationRequested::dispatch($application, $this->failedType, extra: $payload, isError: true, includeInstance: ! $this->hasItem());

            return;
        }

        $this->mark(WordPressAsyncStatus::FINISHED);
        // A core or plugin change moves the versions the Installation card shows.
        app(ProjectWordPressDetails::class)->refresh($application);
        ClientAreaNotificationRequested::dispatch(
            $application,
            $this->finishedType,
            extra: $this->payload($api, $application, WordPressAsyncStatus::FINISHED, $plugins, $themes),
            includeInstance: ! $this->hasItem(),
        );
    }

    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        if ($application === null) {
            return;
        }

        $this->mark(WordPressAsyncStatus::FAILED);

        $payload = $this->presenterRow($application, WordPressAsyncStatus::FAILED);

        ClientAreaNotificationRequested::dispatch(
            $application,
            $this->failedType,
            message: self::GENERIC_FAILURE,
            extra: $payload,
            isError: true,
            includeInstance: ! $this->hasItem(),
        );
    }

    private function run(WordPressApi $api, Application $application): void
    {
        match ($this->action) {
            self::PLUGIN_INSTALL => $api->installPlugin($application->engineProject(), $this->installParams()),
            self::PLUGIN_UPDATE => $api->updatePlugin($application->engineProject(), $this->itemName ?? ''),
            self::THEME_INSTALL => $api->installTheme($application->engineProject(), $this->installParams()),
            self::THEME_UPDATE => $api->updateTheme($application->engineProject(), $this->itemName ?? ''),
            self::CORE_UPDATE => $this->coreUpdate($api, $application),
            default => throw new \InvalidArgumentException("Unknown WordPress action: {$this->action}"),
        };
    }

    /**
     * The core update: when the dialog's backup box started one, the update waits
     * for that backup (a failed one stops it) and then runs.
     */
    private function coreUpdate(WordPressApi $api, Application $application): void
    {
        $this->waitForBackup($application);

        $api->coreUpdate($application->engineProject(), array_filter([
            'version' => $this->payload['version'] ?? null,
        ], static fn ($v) => $v !== null && $v !== ''));
    }

    /**
     * Polls the Engine task of the backup the panel started before queuing this
     * update. An Engine hiccup only delays the next poll; a backup that ends
     * other than completed is the update's failure, with its own message.
     */
    private function waitForBackup(Application $application): void
    {
        if ($this->backupTaskId === null) {
            return;
        }

        for ($poll = 0; $poll < self::BACKUP_POLLS; $poll++) {
            try {
                $status = Payload::string($application->engine()->task($this->backupTaskId)['status'] ?? '');
            } catch (Throwable $e) {
                report($e);
                $status = '';
            }

            if ($status === 'completed') {
                return;
            }
            if (in_array($status, ['failed', 'cancelled'], true)) {
                throw ValidationException::withMessages([self::BACKUP_FAILED]);
            }

            Sleep::sleep(self::BACKUP_POLL_SECONDS);
        }

        throw ValidationException::withMessages([self::BACKUP_TIMEOUT]);
    }

    /**
     * @return array<string, mixed>
     */
    private function installParams(): array
    {
        // The Engine's install takes `slug` and `force` (WpPluginInstallRequest /
        // WpThemeInstallRequest); `force` reinstalls over an existing copy.
        return array_filter([
            'slug' => $this->payload['slug'] ?? $this->itemName,
            'force' => isset($this->payload['force']) ? (bool) $this->payload['force'] : null,
        ], static fn ($v) => $v !== null && $v !== '');
    }

    private function mark(string $status): void
    {
        if ($this->itemType === null || $this->itemName === null || $this->itemAction === null) {
            return;
        }

        WordPressAsyncStatus::query()->updateOrCreate(
            ['application_id' => $this->applicationId, 'type' => $this->itemType, 'name' => $this->itemName],
            ['action' => $this->itemAction, 'status' => $status],
        );
    }

    /**
     * The notification payload: the plugin/theme row in its **final** state,
     * read back from the Engine and shaped by the presenter, or the dispatch
     * payload for a core update.
     *
     * @return array<string, mixed>
     */
    private function payload(WordPressApi $api, Application $application, string $status, PluginPresenter $plugins, ThemePresenter $themes): array
    {
        if (! $this->hasItem()) {
            return $this->payload;
        }

        try {
            $row = $this->itemType === WordPressAsyncStatus::THEME
                ? $this->theme($api, $application)
                : $api->plugin($application->engineProject(), $this->itemName ?? '');
        } catch (\Throwable $e) {
            // Best effort: a failed read must not break the notification.
            report($e);
            $row = ['name' => $this->itemName];
        }

        return $this->itemType === WordPressAsyncStatus::THEME
            ? ['theme' => $themes->present($application, $row, $this->asyncStatus($status))]
            : ['plugin' => $plugins->present($application, $row, $this->asyncStatus($status))];
    }

    /**
     * The row without an Engine call – `failed()` runs after a framework error,
     * so it must not depend on the Engine answering.
     *
     * @return array<string, mixed>
     */
    private function presenterRow(Application $application, string $status): array
    {
        if (! $this->hasItem() || $this->itemName === null) {
            return [];
        }

        $row = ['name' => $this->itemName];
        $async = $this->asyncStatus($status);

        return $this->itemType === WordPressAsyncStatus::THEME
            ? ['theme' => app(ThemePresenter::class)->present($application, $row, $async)]
            : ['plugin' => app(PluginPresenter::class)->present($application, $row, $async)];
    }

    /**
     * Whether this job notifies about a sub-resource (plugin/theme) rather
     * than the project itself (core update).
     */
    private function hasItem(): bool
    {
        return $this->itemType === WordPressAsyncStatus::PLUGIN
            || $this->itemType === WordPressAsyncStatus::THEME;
    }

    /**
     * @return array<string, string>
     */
    private function asyncStatus(string $status): array
    {
        return $this->itemAction === null ? [] : [$this->itemAction => $status];
    }

    /**
     * @return array<string, mixed>
     */
    private function theme(WordPressApi $api, Application $application): array
    {
        foreach ($api->themes($application->engineProject()) as $theme) {
            if (($theme['name'] ?? null) === $this->itemName) {
                return $theme;
            }
        }

        return ['name' => $this->itemName];
    }

    private function engineMessage(EngineException|EngineValidationException|ProjectProtectedException|ValidationException $e): ?string
    {
        if ($e instanceof EngineException) {
            return EngineErrors::message($e);
        }

        if ($e instanceof EngineValidationException) {
            $e = EngineErrors::validation($e);
        } elseif ($e instanceof ProjectProtectedException) {
            $e = ProtectedProject::refusal();
        }

        // The validation error messages, not the framework text.
        $messages = [];
        foreach (Payload::objects($e->errors()) as $fieldErrors) {
            foreach (Payload::strings($fieldErrors) as $message) {
                $messages[] = $message;
            }
        }

        return $messages !== [] ? $messages[0] : null;
    }
}
