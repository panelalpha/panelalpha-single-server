<?php

namespace PanelAlpha\ClientArea\Http\Presenters\WordPress;

use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * A WordPress import (Engine 2.2.0) in the old `InstanceResource`
 * `import_details` shape (packages/api/app/Http/Resources/InstanceResource.php:226-243):
 * `{status, steps: {name: status}, current_step: {name, status, percent,
 * current_item, current_step_number, steps_count} | null, message}`.
 *
 * The CA reads `steps` (each key is a `heading.instance.modal.importDetails.step.<key>`
 * title, the value a chip status: `not-started`, `in-progress`, `completed`,
 * `failed`, `stopped`), `current_step` (title, `percent` and `current_item`
 * under the avatar and in the details modal) and `message` (the failure text)
 * – `components/modal/ImportInstanceDetailsModal.vue:52,195-218`,
 * `components/InstanceAvatar.vue:226-237`. The Engine's step names
 * (`WordpressMigration::STEP_*`) map to the old step keys the CA translates;
 * its progress (`MigrationProgress::of`) gives the current step's
 * `phase_percent` and `item`.
 */
final class ImportDetailsPresenter
{
    /** Engine step → the old CA step key with the closest title. */
    private const STEP_KEYS = [
        'resolve_source' => 'prepareMigrationUsingPlugin',
        'create_project' => 'prepareInstance',
        'install_wordpress' => 'installNewInstance',
        'install_destination_plugin' => 'installPluginOnNewInstance',
        'install_source_plugin' => 'installPluginOnImportedInstance',
        'verify_source_plugin' => 'prepareNewInstanceToMigration',
        'remote_sync' => 'runMigrationUsingPlugin',
        'migrate_database' => 'migrateDatabaseUsingPlugin',
        'migrate_files' => 'migrateFilesUsingPlugin',
        'finalize' => 'finalizeMigrationUsingPlugin',
        'remove_plugins' => 'cleanUpPlugins',
        'clear_secrets' => 'cleanUp',
    ];

    /** The steps whose `phase_percent` is their own progress (`MigrationProgress::TRANSFER_STEPS`). */
    private const array TRANSFER_STEPS = ['migrate_database', 'migrate_files'];

    /** The old `Import` statuses the CA colours (`ImportInstanceDetailsModal.vue:241-247`). */
    private const string NOT_STARTED = 'not-started';

    private const string IN_PROGRESS = 'in-progress';

    private const string DONE = 'completed';

    private const string FAILED = 'failed';

    private const string STOPPED = 'stopped';

    /** Shown while the panel waits for the project's create task (`starting`). */
    public const string WAITING_FOR_PROJECT = 'Waiting for the new project to be ready.';

    /**
     * @return array{status: string, steps: array<string, string>, current_step: array<string, mixed>|null, message: string|null}
     */
    public function present(WordPressImport $import): array
    {
        $engine = Payload::object($import->engine_status);
        $running = in_array($import->status, [WordPressImport::PENDING, WordPressImport::RUNNING], true) && ! $import->isStale();
        $progress = Payload::object($engine['progress'] ?? null);
        $currentEngineStep = Payload::nullableString($progress['step'] ?? null);

        $steps = [];
        $current = null;
        $engineSteps = Payload::objects($engine['steps'] ?? null);
        foreach ($engineSteps as $index => $step) {
            $name = Payload::nullableString($step['name'] ?? null);
            if ($name === null) {
                continue;
            }
            $key = self::STEP_KEYS[$name] ?? $name;
            $status = $this->stepStatus(Payload::nullableString($step['status'] ?? null), $import, $running && $name === $currentEngineStep);
            $steps[$key] = $status;

            if ($name === $currentEngineStep && ($running || $status === self::FAILED)) {
                $current = [
                    'name' => $key,
                    'status' => $status,
                    // The Engine measures only the two transfer steps; its
                    // `phase_percent` of any other step is its place in a
                    // band of several steps, not the step's own progress.
                    'percent' => in_array($name, self::TRANSFER_STEPS, true) ? self::percent($progress['phase_percent'] ?? null) : null,
                    'current_item' => Payload::nullableString($progress['item'] ?? null),
                    'current_step_number' => Payload::int($progress['step_index'] ?? null) ?? $index + 1,
                    'steps_count' => Payload::int($progress['step_count'] ?? null) ?? count($engineSteps),
                ];
            }
        }

        return [
            'status' => $this->status($import),
            // The old resource listed the steps newest first (`collect()->reverse()`).
            'steps' => array_reverse($steps, true),
            'current_step' => $current,
            'message' => $this->message($import, $engine, $progress, $running),
        ];
    }

    /**
     * The step statuses in run order (the old `Import::$steps`), for a mirror
     * that lists them itself.
     *
     * @return array<string, string>
     */
    public function stepStatuses(WordPressImport $import): array
    {
        return array_reverse($this->present($import)['steps'], true);
    }

    /**
     * The old import status: `in-progress` while it runs, `completed`, `failed`
     * (a failed, stale or refused import) or `stopped` (cancelled).
     */
    public function status(WordPressImport $import): string
    {
        if ($import->isStale()) {
            return self::FAILED;
        }

        return match ($import->status) {
            WordPressImport::COMPLETED => self::DONE,
            WordPressImport::FAILED => self::FAILED,
            WordPressImport::CANCELLING, WordPressImport::CANCELLED => self::STOPPED,
            default => self::IN_PROGRESS,
        };
    }

    private function stepStatus(?string $engineStatus, WordPressImport $import, bool $isCurrent): string
    {
        return match (true) {
            $engineStatus === 'completed' => self::DONE,
            $engineStatus === 'failed' => self::FAILED,
            $isCurrent => self::IN_PROGRESS,
            in_array($import->status, [WordPressImport::CANCELLING, WordPressImport::CANCELLED], true) => self::STOPPED,
            default => self::NOT_STARTED,
        };
    }

    /**
     * @param  array<string, mixed>  $engine
     * @param  array<string, mixed>  $progress
     */
    private function message(WordPressImport $import, array $engine, array $progress, bool $running): ?string
    {
        if ($import->status === WordPressImport::STARTING) {
            return self::WAITING_FOR_PROJECT;
        }
        if ($running) {
            return Payload::nullableString($progress['message'] ?? null);
        }
        if ($import->status === WordPressImport::COMPLETED) {
            $notices = array_values(array_filter(
                array_map(static fn (mixed $notice): ?string => Payload::nullableString($notice), (array) ($engine['notices'] ?? [])),
                static fn (?string $notice): bool => $notice !== null && $notice !== '',
            ));

            return $notices === [] ? null : implode(' ', $notices);
        }

        return $import->error ?? self::failure($engine);
    }

    /**
     * The newest failed step's message from the Engine's step log, as the
     * Engine wrote it.
     *
     * @param  array<string, mixed>  $engine
     */
    public static function rawFailure(array $engine): ?string
    {
        foreach (array_reverse(Payload::objects($engine['step_log'] ?? null)) as $entry) {
            if (($entry['status'] ?? null) === 'failed') {
                $message = Payload::nullableString($entry['message'] ?? null);
                if ($message !== null && $message !== '') {
                    return $message;
                }
            }
        }

        return null;
    }

    /**
     * The newest failed step's message, friendly when it is a known refusal.
     * No logging here: the project page polls this read.
     *
     * @param  array<string, mixed>  $engine
     */
    public static function failure(array $engine): ?string
    {
        $message = self::rawFailure($engine);

        return $message === null ? null : (EngineText::friendly($message) ?? $message);
    }

    private static function percent(mixed $value): ?int
    {
        return is_int($value) || is_float($value) ? (int) round(max(0, min(100, $value))) : null;
    }
}
