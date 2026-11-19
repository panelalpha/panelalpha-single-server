<?php

namespace PanelAlpha\ClientArea\Hosting;

use Cron\CronExpression;
use Illuminate\Http\Client\Response;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\BackupsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Contracts\BackupDestination;
use PanelAlpha\ClientArea\Contracts\DefaultBackupSchedule;
use PanelAlpha\ClientArea\Jobs\Application\WatchBackupTaskJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectBackupDetails;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Backups of one project. The Engine owns
 * the backup rows and the objects; the panel presents them in the old Client
 * Area shape, resolves the one backup container and follows every
 * `202` task so the CA's `async_status`/notifications end.
 *
 * Engine: core/app/Http/Controllers/User/BackupController.php and
 * core/app/Http/Controllers/User/BackupScheduleController.php (see
 * {@see BackupsApi} for the line map).
 */
final class BackupService
{
    public function __construct(
        private readonly BackupDestination $destination,
        private readonly ProjectBackupDetails $details,
        private readonly DefaultBackupSchedule $startingSchedule,
    ) {}

    /**
     * No backup container is configured on the Engine, so a backup cannot be
     * stored; the CA shows the message on the create/automatic-backup form.
     * The Engine exposes no `enabled` flag
     * (`BackupContainerResource.php:15-24`), so the first container is used.
     */
    public const NO_CONTAINER_REFUSAL = 'Backups are not available until the Engine has a backup container.';

    /** Old `api/custom_validation.invalid_action` (key 0). */
    public const INVALID_ACTION = 'Invalid action';

    /** Old `api/custom_validation.cannot_delete_backup` text. */
    public const CANNOT_DELETE_BACKUP = 'Cannot delete a backup that is being created.';

    /** Old `api/custom_validation.invalid_frequency_settings` text. */
    public const INVALID_FREQUENCY = 'The automatic backup frequency settings are invalid.';

    /**
     * The project's backups, newest first, in the old `BackupResource` shape,
     * plus the `meta.usage` the CA's usage cards read.
     *
     * @return array{data: list<array<string, mixed>>, meta: array{usage: array<string, mixed>}}
     */
    public function list(Application $application): array
    {
        $rows = [];
        $manual = 0;
        $automatic = 0;
        $size = 0;

        foreach ((new BackupsApi($application->engine()))->list($application->engineProject()) as $backup) {
            $row = $this->present($backup);
            $rows[] = $row;
            $size += Payload::int($row['size'] ?? null) ?? 0;
            if ($row['type'] === 'automatic') {
                $automatic++;
            } else {
                $manual++;
            }
        }

        $this->details->rememberBackups($application, $rows);

        return [
            'data' => $rows,
            'meta' => ['usage' => [
                'manual_backups_number' => ['total' => $manual, 'max' => null],
                'automatic_backups_number' => ['total' => $automatic, 'max' => null],
                'backups_size' => ['total' => $size, 'max' => null],
            ]],
        ];
    }

    /**
     * Start a manual backup (old BackupController::store). The CA's
     * `backupDirectory`/`backupDatabase` become the Engine's `files`/`databases`;
     * both false is refused before the Engine (old
     * `backup_no_directory_or_database`).
     *
     * @param  array<string, mixed>  $params  validated BackupStoreRequest
     * @return array{success: true, data: array<string, mixed>}
     */
    public function create(Application $application, array $params): array
    {
        $files = (bool) ($params['backupDirectory'] ?? false);
        $databases = (bool) ($params['backupDatabase'] ?? false);
        if (! $files && ! $databases) {
            throw ValidationException::withMessages([
                'backupDirectory' => ['Choose files or databases to back up.'],
            ]);
        }

        $backup = $this->start($application, $files, $databases, Payload::nullableString($params['backupNote'] ?? null));
        $this->watch($application, $backup, 'create');

        return ['success' => true, 'data' => $this->present($backup)];
    }

    /**
     * Start a manual backup and answer the Engine's `202` row without the CA
     * rows, so a caller outside the backups table can wait for the Engine task
     * it names (the WordPress core update's backup box).
     *
     * @return array<string, mixed> the Engine `BackupResource`
     */
    public function start(Application $application, bool $files, bool $databases, ?string $note = null): array
    {
        if (in_array($application->status, ['pending', 'failed'], true)) {
            throw ValidationException::withMessages([self::INVALID_ACTION]);
        }

        return (new BackupsApi($application->engine()))->create($application->engineProject(), [
            'container' => $this->container($application),
            'files' => $files,
            'databases' => $databases,
            'note' => $note,
        ]);
    }

    /**
     * Restore a backup (old BackupController::restore). The CA sends booleans;
     * the Engine filters by name: restoring only the files is `only.files`, only
     * the databases is `exclude.files` (the database names are not known to the
     * panel).
     *
     * @param  array<string, mixed>  $params  validated RestoreBackupRequest
     */
    public function restore(Application $application, int $backupId, array $params): void
    {
        $directory = (bool) ($params['restoreDirectory'] ?? false);
        $database = (bool) ($params['restoreDatabase'] ?? false);
        if (! $directory && ! $database) {
            throw ValidationException::withMessages([
                'restoreDirectory' => ['Choose files or databases to restore.'],
            ]);
        }

        // The CA's restore modal is the confirmation (it sends only
        // `restoreDirectory`/`restoreDatabase`/`deleteExistingFiles`,
        // BackupActionsMixin.js:310-337), so the panel sends `confirm:true`
        // itself. A caller that sends `confirm:false` bypasses that modal
        // confirmation and is refused before any Engine call.
        if (array_key_exists('confirm', $params) && (bool) $params['confirm'] === false) {
            throw ValidationException::withMessages([
                'confirm' => ['Confirm the restore before restoring a backup.'],
            ]);
        }

        $engineParams = ['confirm' => true];
        if ($directory && ! $database) {
            $engineParams['only'] = ['files' => true];
        } elseif ($database && ! $directory) {
            $engineParams['exclude'] = ['files' => true];
        }
        if ($directory) {
            $engineParams['delete_existing_files'] = (bool) ($params['deleteExistingFiles'] ?? true);
        }

        $backup = (new BackupsApi($application->engine()))->restore($application->engineProject(), $backupId, $engineParams);

        $this->watch($application, $backup, 'restore');
    }

    /**
     * Delete a backup (old BackupController::destroy). A backup the Engine is
     * still writing is refused with the old key-0 text before any delete call.
     * The Engine's raw status is `running` (`System/Project/Backup.php:66`),
     * which {@see self::asyncStatus()} maps to the old `in_progress`.
     */
    public function delete(Application $application, int $backupId): void
    {
        $api = new BackupsApi($application->engine());
        $current = $api->show($application->engineProject(), $backupId);
        if (($this->asyncStatus($current)['create'] ?? null) === 'in_progress') {
            throw ValidationException::withMessages([self::CANNOT_DELETE_BACKUP]);
        }

        $snapshot = $this->present($current);
        $backup = $api->delete($application->engineProject(), $backupId);

        $this->watch($application, $backup, 'delete', $snapshot);
    }

    /**
     * The stored backup item, streamed; the caller copies the Engine status and
     * headers.
     */
    public function download(Application $application, int $backupId, int $itemId, ?string $range = null): Response
    {
        return (new BackupsApi($application->engine()))->download($application->engineProject(), $backupId, $itemId, $range);
    }

    /**
     * The project's automatic-backup settings (old
     * AutomaticBackupController::show), mapped from the Engine's one schedule.
     *
     * `store_configured` says whether the project has a backup store to use
     * (the card shows "Configure a backup store" instead of Activate when it has
     * not); on an Engine error the key is omitted, like before it existed.
     *
     * A project without a schedule answers `never` with the panel's default cron
     * for it ({@see DefaultBackupSchedule}), so the dialog opens at that time.
     *
     * @return array{location: null, frequency: string, cron_frequency: string|null, cron_minute: string, cron_hour: string, cron_day_of_month: string, cron_day_of_week: string, rotation: null, store_configured?: bool}
     */
    public function automaticBackup(Application $application): array
    {
        $schedule = (new BackupsApi($application->engine()))->schedule($application->engineProject());
        $presented = $schedule === null ? $this->startingSchedule($application) : $this->presentSchedule($schedule);
        $this->details->rememberSchedule($application, $presented['frequency'] !== 'never');

        try {
            $presented['store_configured'] = $this->destination->containerFor($application) !== null;
        } catch (EngineException) {
            // Undefined = today's behavior: the card still shows the schedule.
        }

        return $presented;
    }

    /**
     * Create/replace/remove the automatic-backup schedule (old
     * AutomaticBackupController::update). `never` removes it; the other
     * frequencies build the Engine's UTC cron, with the destination's
     * `keep_last` (the Engine's default 7 unless the paid edition's container
     * or plan sets the automatic-backup limit; the old model had no rotation
     * column).
     *
     * @param  array<string, mixed>  $params  validated AutomaticBackupRequest
     */
    public function updateAutomaticBackup(Application $application, array $params): void
    {
        $api = new BackupsApi($application->engine());
        $frequency = Payload::string($params['frequency'] ?? '');

        if ($frequency === 'never') {
            $api->deleteSchedule($application->engineProject());
            $this->details->rememberSchedule($application, false);

            return;
        }

        $cron = $this->cronFor($frequency, $params);
        if ($cron === null || ! CronExpression::isValidExpression($cron)) {
            throw ValidationException::withMessages([self::INVALID_FREQUENCY]);
        }

        $schedule = [
            'container' => $this->container($application),
            'cron' => $cron,
        ];
        $keepLast = $this->destination->keepLastFor($application);
        if ($keepLast !== null) {
            $schedule['keep_last'] = $keepLast;
        }
        $api->updateSchedule($application->engineProject(), $schedule);
        $this->details->rememberSchedule($application, true);
    }

    public function refreshDetails(Application $application): void
    {
        $this->list($application);
        $schedule = (new BackupsApi($application->engine()))->schedule($application->engineProject());
        $presented = $schedule === null ? $this->startingSchedule($application) : $this->presentSchedule($schedule);
        $this->details->rememberSchedule($application, $presented['frequency'] !== 'never');
    }

    /**
     * One `GET backups` row in the old `BackupResource` shape: `date` is unix
     * seconds (the CA appends `000`), `size` is bytes, `type` is
     * manual/automatic and `async_status` maps the Engine's
     * `backup`/`restore`/`delete` keys to the CA's `create`/`restore`/`delete`.
     *
     * Each item also reports the Engine `details.type` (`files`, `volume`,
     * `database`) and `details.name`, and the row reports `parts`: what the
     * backup really holds (`files`, `volumes` and `databases` names in Engine
     * order). `parts` is null while the backup is not completed (items are
     * saved one by one), when it has no items or when no item has a known
     * type (older Engine), so the CA falls back to `directory`/`database`.
     *
     * @param  array<string, mixed>  $backup
     * @return array<string, mixed>
     */
    public function present(array $backup): array
    {
        $contents = Payload::object($backup['contents'] ?? null);
        $directory = (bool) ($contents['files'] ?? true);
        $database = (bool) ($contents['databases'] ?? true);

        $items = [];
        $hasFiles = false;
        $volumes = [];
        $databases = [];
        foreach (Payload::objects($backup['items'] ?? null) as $item) {
            // The Engine's item `details.type` is `files`, `volume` or
            // `database` (Engine `System/Project/Backup.php:746-747`), so each
            // row reports only its own contents; the backup-level flags are not
            // copied onto every item.
            $details = Payload::object($item['details'] ?? null);
            $type = Payload::nullableString($details['type'] ?? null);
            $name = Payload::nullableString($details['name'] ?? null);
            if ($type === 'files') {
                $hasFiles = true;
            } elseif ($type === 'volume' && $name !== null) {
                $volumes[] = $name;
            } elseif ($type === 'database' && $name !== null) {
                $databases[] = $name;
            }
            $items[] = [
                'id' => Payload::int($item['id'] ?? null) ?? 0,
                'directory' => $type === 'files',
                'database' => $type === 'database',
                'type' => $type,
                'name' => $name,
            ];
        }

        $engineStatus = Payload::nullableString(Payload::object($backup['async_status'] ?? null)['backup'] ?? null);
        $recognised = $hasFiles || $volumes !== [] || $databases !== [];
        $parts = ! $recognised || ($engineStatus !== null && $engineStatus !== '' && $engineStatus !== 'completed')
            ? null
            : ['files' => $hasFiles, 'volumes' => $volumes, 'databases' => $databases];

        return [
            'id' => Payload::int($backup['id'] ?? null),
            'type' => Payload::nullableString($backup['kind'] ?? null) === 'scheduled' ? 'automatic' : 'manual',
            'mode' => 'full',
            'convert_from_id' => null,
            'name' => null,
            'size' => Payload::int($backup['size_bytes'] ?? null) ?? 0,
            'version' => null,
            'date' => $this->timestamp($backup['created_at'] ?? null),
            'note' => Payload::nullableString($backup['note'] ?? null),
            'directory' => $directory,
            'database' => $database,
            'parts' => $parts,
            'async_status' => $this->asyncStatus($backup),
            'items' => $items,
        ];
    }

    /**
     * The default old `AutomaticBackupResource` (frequency `never`), used when
     * the project has no Engine schedule yet.
     *
     * @return array{location: null, frequency: string, cron_frequency: string|null, cron_minute: string, cron_hour: string, cron_day_of_month: string, cron_day_of_week: string, rotation: null}
     */
    public static function defaultSchedule(): array
    {
        return [
            'location' => null,
            'frequency' => 'never',
            'cron_frequency' => null,
            'cron_minute' => '0',
            'cron_hour' => '0',
            'cron_day_of_month' => '1',
            'cron_day_of_week' => '0',
            'rotation' => null,
        ];
    }

    /**
     * The old `AutomaticBackupResource` of a project without a schedule: the
     * frequency `never` (the switch stays off) with the cron the panel would
     * give the project ({@see DefaultBackupSchedule}), so the dialog opens at
     * that time instead of midnight.
     *
     * @return array{location: null, frequency: string, cron_frequency: string|null, cron_minute: string, cron_hour: string, cron_day_of_month: string, cron_day_of_week: string, rotation: null}
     */
    private function startingSchedule(Application $application): array
    {
        $cron = $this->startingSchedule->cronFor($application);
        if ($cron === null || ! CronExpression::isValidExpression($cron)) {
            return self::defaultSchedule();
        }

        $presented = $this->presentSchedule(['cron' => $cron]);
        $presented['frequency'] = 'never';
        $presented['cron_frequency'] = null;

        return $presented;
    }

    /**
     * @param  array<string, mixed>  $schedule  Engine `BackupScheduleResource`
     * @return array{location: null, frequency: string, cron_frequency: string|null, cron_minute: string, cron_hour: string, cron_day_of_month: string, cron_day_of_week: string, rotation: null}
     */
    private function presentSchedule(array $schedule): array
    {
        $cron = Payload::string($schedule['cron'] ?? '');
        $parts = CronExpression::isValidExpression($cron)
            ? (new CronExpression($cron))->getParts()
            : ['0', '0', '1', '*', '0'];

        return [
            'location' => null,
            'frequency' => $this->frequencyOf($parts),
            'cron_frequency' => $cron === '' ? null : $cron,
            'cron_minute' => $parts[0],
            'cron_hour' => $parts[1],
            'cron_day_of_month' => $parts[2],
            'cron_day_of_week' => $parts[4],
            'rotation' => null,
        ];
    }

    /**
     * The old frequency word from the cron fields: a wildcard day-of-month and
     * day-of-week is daily, a set day-of-week is weekly, a set day-of-month is
     * monthly, anything else is custom.
     *
     * @param  array<int|string, string>  $parts  cron parts (`minute hour dom month dow`)
     */
    private function frequencyOf(array $parts): string
    {
        $dayOfMonth = $parts[2] ?? '*';
        $dayOfWeek = $parts[4] ?? '*';

        if ($dayOfWeek !== '*' && $dayOfMonth === '*') {
            return 'weekly';
        }
        if ($dayOfMonth !== '*' && $dayOfWeek === '*') {
            return 'monthly';
        }
        if ($dayOfMonth === '*' && $dayOfWeek === '*') {
            return 'daily';
        }

        return 'custom';
    }

    /**
     * The Engine cron for an old frequency. The CA's `cron_hour`/`cron_minute`
     * are UTC (the modal converts for display), so they go in directly.
     *
     * @param  array<string, mixed>  $params
     */
    private function cronFor(string $frequency, array $params): ?string
    {
        $minute = $this->cronPart($params['cron_minute'] ?? null, '0');
        $hour = $this->cronPart($params['cron_hour'] ?? null, '0');

        return match ($frequency) {
            'daily' => "{$minute} {$hour} * * *",
            'weekly' => "{$minute} {$hour} * * ".$this->cronPart($params['cron_day_of_week'] ?? null, '0'),
            'monthly' => "{$minute} {$hour} ".$this->cronPart($params['cron_day_of_month'] ?? null, '1').' * *',
            'custom' => Payload::nullableString($params['cron_frequency'] ?? null),
            default => null,
        };
    }

    /**
     * A cron field as a decimal string, or the fallback when absent.
     */
    private function cronPart(mixed $value, string $fallback): string
    {
        $int = Payload::int($value);

        return $int === null ? $fallback : (string) $int;
    }

    /**
     * The Engine container the project's backups go to ({@see BackupDestination}:
     * the first Engine container, or the paid Admin Area's container rules);
     * none is the documented refusal.
     */
    private function container(Application $application): string
    {
        $container = $this->destination->containerFor($application);
        if ($container === null || $container === '') {
            throw ValidationException::withMessages([self::NO_CONTAINER_REFUSAL]);
        }

        return $container;
    }

    /**
     * Dispatch the watcher for the `202` task the Engine recorded on the backup
     * (`async_status.task_id`), with the old `user.instance.backup.*` types.
     *
     * @param  array<string, mixed>  $backup
     * @param  array<string, mixed>  $snapshot
     */
    private function watch(Application $application, array $backup, string $action, array $snapshot = []): void
    {
        $taskId = Payload::int(Payload::object($backup['async_status'] ?? null)['task_id'] ?? null);
        if ($taskId === null) {
            return;
        }

        WatchBackupTaskJob::dispatch(
            $application->id,
            $taskId,
            Payload::int($backup['id'] ?? null) ?? 0,
            $action,
            "user.instance.backup.{$action}_finished",
            "user.instance.backup.{$action}_failed",
            $snapshot === [] ? $this->present($backup) : $snapshot,
        )->onConnection('database');
    }

    /**
     * @param  array<string, mixed>  $backup
     * @return array<string, string>
     */
    private function asyncStatus(array $backup): array
    {
        $status = Payload::object($backup['async_status'] ?? null);
        $out = [];
        foreach (['backup' => 'create', 'restore' => 'restore', 'delete' => 'delete'] as $engine => $ca) {
            $value = Payload::nullableString($status[$engine] ?? null);
            if ($value === null || $value === '') {
                continue;
            }
            $out[$ca] = match ($value) {
                'completed' => 'finished',
                'running' => 'in_progress',
                default => $value,
            };
        }

        return $out;
    }

    /**
     * The Engine ISO-8601 `created_at` as unix seconds (the CA appends `000`).
     */
    private function timestamp(mixed $value): ?int
    {
        $string = Payload::nullableString($value);
        if ($string === null || $string === '') {
            return null;
        }

        $parsed = strtotime($string);

        return $parsed === false ? null : $parsed;
    }
}
