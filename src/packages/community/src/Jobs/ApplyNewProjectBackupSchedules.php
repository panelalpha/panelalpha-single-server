<?php

namespace PanelAlpha\Community\Jobs;

use Closure;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\Community\Backups\BackupDefaults;
use PanelAlpha\Community\Backups\SettingsBackupDestination;
use PanelAlpha\EngineClient\Api\BackupsApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * Every minute: gives each new project (`auto_backup_state` null) the default
 * automatic-backup schedule from Settings, once. Only a project this panel
 * created (`panel_created_at`) is swept: the Engine's list also holds projects
 * another panel or the operator made, and the Settings defaults are the user's
 * own. A project is decided as `skipped` (failed, predates the feature, switch
 * off, no store), `scheduled` (it has a schedule, ours or the owner's) or
 * `failed` (the Engine refused for an hour). A sweep covers every creation path
 * and waits for `pending` projects. An existing schedule is never overwritten:
 * the owner may have pressed Activate on the card before the sweep got there.
 */
final class ApplyNewProjectBackupSchedules implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** The Engine error window after which a project is given up. */
    private const int GIVE_UP_MINUTES = 60;

    public function __construct()
    {
        $this->onQueue('default');
    }

    public function handle(
        Container $container,
        EngineResolver $engines,
        EngineHealth $health,
        PanelSettings $settings,
        BackupDefaults $defaults,
        SettingsBackupDestination $destination,
    ): void {
        if (! SingleUserMode::active($container) || $health->isDown($engines->defaultEngineId())) {
            return;
        }

        $since = $settings->get(BackupDefaults::AUTO_ENABLE_SINCE);
        if ($since === null || $since === '') {
            $since = now()->utc()->toIso8601String();
            $settings->set(BackupDefaults::AUTO_ENABLE_SINCE, $since);
        }
        $sinceAt = Carbon::parse($since);

        // Community has one Engine, so the store is looked up once per sweep (again
        // only after a failed lookup), not once per project.
        $store = null;
        $resolved = false;
        $containerFor = function (Application $application) use ($destination, &$store, &$resolved): ?string {
            if (! $resolved) {
                $store = $destination->containerFor($application);
                $resolved = true;
            }

            return $store;
        };

        Application::query()
            ->excludingSelf()
            ->whereNotNull('panel_created_at')
            ->whereNull('auto_backup_state')
            ->whereNull('staging_of_id')
            ->chunkById(100, function ($applications) use ($defaults, $containerFor, $sinceAt): void {
                foreach ($applications as $application) {
                    if ($application instanceof Application) {
                        $this->decide($application, $defaults, $containerFor, $sinceAt);
                    }
                }
            });
    }

    /**
     * @param  Closure(Application): ?string  $containerFor
     */
    private function decide(Application $application, BackupDefaults $defaults, Closure $containerFor, Carbon $since): void
    {
        if ($application->status === 'failed') {
            $this->mark($application, 'skipped');

            return;
        }
        // Not `replacing_at`: that column is legacy-owned; during a classic→git
        // replace the Engine answers 404 and the sweep retries.
        if ($application->status === 'pending' || $application->engine_created_at === null) {
            return;
        }
        // A row the synchronizer inserted for a project that already existed on
        // the Engine; the migration back-fill cannot see these.
        if ($application->engine_created_at->lt($since)) {
            $this->mark($application, 'skipped');

            return;
        }

        try {
            $container = $defaults->autoEnable() ? $containerFor($application) : null;
            if ($container === null) {
                $this->mark($application, 'skipped');

                return;
            }

            $api = new BackupsApi($application->engine());
            if ($api->schedule($application->engineProject()) === null) {
                $api->updateSchedule($application->engineProject(), [
                    'container' => $container,
                    'cron' => $defaults->cronFor($application->engine_username),
                    'keep_last' => $defaults->keepLast(),
                    'files' => true,
                    'databases' => true,
                    'enabled' => true,
                ]);
            }
            $this->mark($application, 'scheduled');
        } catch (EngineException|EngineValidationException $e) {
            $this->failed($application, $e);
        }
    }

    private function failed(Application $application, EngineException|EngineValidationException $e): void
    {
        $attemptedAt = $application->auto_backup_attempted_at;
        if ($attemptedAt === null) {
            $application->forceFill(['auto_backup_attempted_at' => now()])->save();

            return;
        }

        if ($attemptedAt->lte(now()->subMinutes(self::GIVE_UP_MINUTES))) {
            Log::warning('The default automatic-backup schedule could not be created.', [
                'project' => $application->engine_username,
                'error' => EngineErrors::message($e),
            ]);
            $this->mark($application, 'failed');
        }
    }

    private function mark(Application $application, string $state): void
    {
        $application->forceFill(['auto_backup_state' => $state])->save();
    }
}
