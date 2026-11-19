<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\StagingRetrier;
use PanelAlpha\EngineClient\Api\MysqlApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Api\UsageApi;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Jobs\Application\WatchPushJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;

/**
 * Staging mirror of a live project on the Engine
 * `POST /projects/{u}/staging` (202). The Engine copies the files and the
 * databases asynchronously; since Engine 2.2.0 it also points a copied
 * WordPress at its own database and host and restores the target when a push
 * fails, so every project
 * kind uses the same calls.
 */
final class StagingService
{
    /** Old `api/messages.cannot_create_staging_from_staging` text (key 0). */
    public const CANNOT_CREATE_FROM_STAGING = 'Cannot create staging instance from staging instance.';

    /** Old `api/custom_validation.instance_has_already_has_staging` text (key 0). */
    public const ALREADY_HAS_STAGING = 'This instance already has staging environment.';

    /** Old `api/custom_validation.cannot_retry_installation` text (key 0). */
    public const CANNOT_RETRY = 'Cannot retry installation on this instance.';

    /** Old `api/custom_validation.invalid_action` text (key 0). */
    public const INVALID_ACTION = 'Invalid action';

    /**
     * A copy's address under the PanelAlpha Online proxy: the proxy serves only
     * the names the Engine allocates there, so a name supplied to the Engine is
     * recorded without a tunnel and opens the proxy's not-found page.
     */
    public const ONLINE_ZONE = 'panelalpha.online';

    public const ONLINE_DOMAIN_REFUSED = 'A staging copy cannot use a panelalpha.online address: the PanelAlpha proxy assigns those names. Create the copy without a domain to get a free one.';

    /**
     * Keyed `tables` refusal for a selection that is not the `database.table`
     * string the push dialog read back from `GET push/diff`.
     * A malformed entry must never be dropped: an emptied selection
     * would become a whole-database push.
     */
    public const INVALID_TABLE_SELECTION = 'Each selected table must be a database.table name.';

    public function __construct(
        private readonly ApplicationSynchronizer $synchronizer,
        private readonly DeployState $deploys,
        private readonly StagingRetrier $retrier,
    ) {}

    /**
     * Create the staging project and mirror it, so the CA gets its payload
     * straight away (old InstanceController::createStaging).
     *
     * The Engine staging call takes `new_username`, `domain` and `copy_databases`;
     * the old `protocol`, `dir` and `skip_uploads_dir` flags are accepted by the CA
     * and the FormRequest but not forwarded – the Engine copies the whole project.
     * A classic staging copies the source's databases explicitly, as the old panel did.
     *
     * The domain is optional: without one the Engine allocates a name and, for a
     * copy of a site on panelalpha.online, registers it with the proxy. A name
     * supplied under that zone is refused (see ONLINE_DOMAIN_REFUSED).
     *
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    public function create(Application $parent, array $params): Application
    {
        $this->assertCanCreate($parent);

        /** @var array{copy_databases: bool, domain?: string} $engineParams */
        $engineParams = ['copy_databases' => true];
        $domain = $this->nonEmptyString($params['domain'] ?? null);
        if ($domain !== null) {
            $this->assertDomainCanBeServed($domain);
            $engineParams['domain'] = $domain;
        }

        $staging = (new ProjectsApi($parent->engine()))->createStaging($parent->engineProject(), $engineParams);

        $application = $this->synchronizer->mirror($parent->engine_id, $staging['project']);
        if ($application === null) {
            throw new EngineRequestException(502, 'The Engine did not return the staging project.');
        }

        // The Engine links them by username; keep the local link too so the
        // list shows the staging under its parent before the next sync. The
        // marker keeps the row across a sync that runs before the watcher sees
        // the Engine's failed copy and deletes the destination.
        $application->forceFill([
            'staging_creating_at' => now(),
            'staging_create_failed_at' => null,
        ] + self::linkFields($parent, self::stagingName($parent, $application->name)))->save();

        // The Engine copies asynchronously and sets the destination's
        // `async_status.staging`; tell the CA when the copy ends. The
        // task id is the only record left when a failed copy is deleted;
        // the username survives a row deleted mid-copy.
        // The whole staleness window counts from the creating marker, not from
        // the first poll: dispatch the marker time so a queue backlog cannot
        // move the wall-clock cap.
        WatchStagingJob::dispatch($application->id, $staging['task_id'] ?? 0, startedAt: (int) $application->staging_creating_at?->getTimestamp(), parentId: $parent->id, stagingUsername: (string) $application->engine_username)->onConnection('database');

        return $application;
    }

    /**
     * `PUT /projects/{id}/retry-staging/{stagingId}` – re-run the copy for a
     * staging that failed (old InstanceController::retryStaging).
     *
     * The Engine has no "restage into the existing project" call, so the panel
     * removes the failed project and creates it again under the **same**
     * username and – where the Engine can serve it – the same domain.
     *
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    public function retry(Application $parent, string $stagingId, array $params): Application
    {
        $staging = $parent->stagings()->whereKey($stagingId)->firstOrFail();

        // The Engine has no restage call, so the delete-and-recreate workaround
        // lives behind the `StagingRetrier` seam.
        return $this->retrier->retry($parent, $staging, $params);
    }

    /**
     * `PUT /projects/{id}/push-to-live` – the bound project is the **staging**
     * one (old PushToLive job): push it onto its live parent. The Engine sets
     * `async_status.push` on the target, which a job follows to notify the CA.
     *
     * @param  array<string, mixed>  $params  the old PushToAppRequest flags (kept for the CA; the Engine pushes the whole state)
     */
    public function pushToLive(Application $staging, array $params): void
    {
        $live = $staging->stagingOf;
        if ($live === null) {
            throw ValidationException::withMessages(['application' => ['The project has no live parent to push to.']]);
        }

        $this->push($staging, $live, 'user.instance.push_to_live_finished', 'user.instance.push_to_live_failed', $params);
    }

    /**
     * `GET /projects/{id}/push-to-live` – the table diff of the staging against
     * its live parent (old ApplicationController::pushToLiveShow). Read-only:
     * the CA opens the push dialog with `{tables_structure_diff,
     * tables_data_diff}` and hides the table selectors when the read fails.
     *
     * @return array{tables_structure_diff: list<string>, tables_data_diff: list<string>}
     */
    public function pushToLiveDiff(Application $staging): array
    {
        $live = $staging->stagingOf;
        if ($live === null) {
            throw ValidationException::withMessages(['application' => ['The project has no live parent to push to.']]);
        }

        return $this->pushDiff($staging, $live);
    }

    /**
     * `GET /projects/{id}/push-to-staging` – the table diff of the live project
     * against its staging (old ApplicationController::showPushToStaging).
     *
     * @return array{tables_structure_diff: list<string>, tables_data_diff: list<string>}
     */
    public function pushToStagingDiff(Application $live): array
    {
        $staging = $live->stagings()->latest('id')->first();
        if ($staging === null) {
            throw ValidationException::withMessages(['application' => ['The project has no staging to push to.']]);
        }

        // A staging whose copy is still running or failed has nothing to
        // compare: the old panel answered Invalid action.
        if ($staging->stagingCreationPending()) {
            throw ValidationException::withMessages([self::INVALID_ACTION]);
        }

        return $this->pushDiff($live, $staging);
    }

    /**
     * The Engine `GET push/diff` for a source/target pair. The Engine refuses a dind project's `target` with `tables_not_applicable`,
     * which bubbles as a validation error (the CA then hides the table
     * selectors).
     *
     * The CA's push modal uses each entry as both the option label and value
     * (`InstanceActionsMixin.js:459-470` → `buildPushToAppFormFields`), and the
     * old `PushToAppRequest` treated the selections as strings, so the Engine's
     * `{database, name}` pairs become `database.name`; `pushTables()` turns them
     * back for the Engine.
     *
     * @return array{tables_structure_diff: list<string>, tables_data_diff: list<string>}
     */
    private function pushDiff(Application $source, Application $target): array
    {
        $diff = (new ProjectsApi($source->engine()))->pushDiff($source->engineProject(), $target->engine_username);

        return [
            'tables_structure_diff' => $this->tableSelections($diff['tables_structure_diff']),
            'tables_data_diff' => $this->tableSelections($diff['tables_data_diff']),
        ];
    }

    /**
     * Each Engine `{database, name}` pair as the `database.name` string the CA
     * round-trips through its multi-select (`OpenModalAction.js:143`).
     *
     * @param  list<array<string, mixed>>  $entries
     * @return list<string>
     */
    private function tableSelections(array $entries): array
    {
        $selections = [];
        foreach ($entries as $entry) {
            $database = Payload::nullableString($entry['database'] ?? null);
            $name = Payload::nullableString($entry['name'] ?? null);
            if ($database === null || $name === null) {
                continue;
            }
            $selections[] = $database.'.'.$name;
        }

        return $selections;
    }

    /**
     * `PUT /projects/{id}/push-to-staging` – the bound project is the **live**
     * one; push it onto its staging (old PushToStaging job).
     *
     * @param  array<string, mixed>  $params
     */
    public function pushToStaging(Application $live, array $params): void
    {
        $staging = $live->stagings()->latest('id')->first();
        if ($staging === null) {
            throw ValidationException::withMessages(['application' => ['The project has no staging to push to.']]);
        }

        // A staging whose copy is still running or failed has nothing to push
        // to: the old panel answered Invalid action.
        if ($staging->stagingCreationPending()) {
            throw ValidationException::withMessages([self::INVALID_ACTION]);
        }

        $this->push($live, $staging, 'user.instance.push_to_staging_finished', 'user.instance.push_to_staging_failed', $params);
    }

    /**
     * The old `PushToAppRequest` flags are forwarded to the Engine:
     * `overwrite_files` → `files`, `push_db` → `databases`, and the
     * CA's `structural_change_tables` + `datachange_tables` selections → `tables`.
     * `databases` is always present, so the Engine's new default (`true`) never
     * replaces a target database the user did not tick; when both flags are false
     * the Engine's `nothing_to_push` 422 reaches the CA as a clean validation
     * error. The push's top-level `task_id` drives the watcher.
     *
     * @param  array<string, mixed>  $params
     */
    private function push(Application $source, Application $target, string $finishedType, string $failedType, array $params): void
    {
        $flags = [
            'files' => (bool) ($params['overwrite_files'] ?? false),
            'databases' => (bool) ($params['push_db'] ?? false),
        ];
        $tables = $this->pushTables($params);
        if ($tables !== []) {
            $flags['tables'] = $tables;
        }

        // The 202 body is the **target** UserResource with `push = running`
        // (Engine User/StagingController.php:253-256): mirror it so a reload
        // immediately after the push already shows the running state, instead of
        // waiting for the watcher.
        $pushed = (new ProjectsApi($source->engine()))->push($source->engineProject(), $target->engineProject(), $flags);
        $target = $this->synchronizer->mirror($source->engine_id, $pushed['project']) ?? $target;

        // The Engine does the copy asynchronously and records it as a Task whose
        // id is the 202's top-level `task_id`; the CA is told when it ends, named
        // by the source. Follow that task, never the old untasked
        // `async_status.push` shape.
        WatchPushJob::dispatch($source->id, $target->id, $finishedType, $failedType, $pushed['task_id'] ?? 0)->onConnection('database');
    }

    /**
     * The CA's `structural_change_tables` and `datachange_tables` selections
     * (`database.name` strings the push dialog feeds back from `GET push/diff`),
     * merged and deduplicated into the Engine's `tables` shape (`{database,
     * name}`). Every entry must carry both parts: an unparseable one is a 422
     * on `tables`, never a silent drop.
     *
     * @param  array<string, mixed>  $params
     * @return list<array{database: string, name: string}>
     *
     * @throws ValidationException
     */
    private function pushTables(array $params): array
    {
        $tables = [];
        foreach (['structural_change_tables', 'datachange_tables'] as $key) {
            foreach (Payload::strings($params[$key] ?? null) as $selection) {
                $parsed = $this->tableSelection($selection);
                if ($parsed === null) {
                    throw ValidationException::withMessages(['tables' => [self::INVALID_TABLE_SELECTION]]);
                }
                $tables[$parsed['database']."\0".$parsed['name']] = $parsed;
            }
        }

        return array_values($tables);
    }

    /**
     * A `database.name` selection as the Engine's `{database, name}`, or null
     * when it is not exactly two non-empty parts. The Engine's diff returns the
     * pair joined by the one separator (`TableDiff` → `PushDiffResource`), and
     * neither a database nor a table name carries a dot, so an extra dot is a
     * malformed entry, not a name to keep.
     *
     * @return array{database: string, name: string}|null
     */
    private function tableSelection(string $selection): ?array
    {
        $parts = explode('.', $selection);
        if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
            return null;
        }

        return ['database' => $parts[0], 'name' => $parts[1]];
    }

    public static function stagingName(Application $parent, ?string ...$own): string
    {
        foreach ($own as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate !== '') {
                return $candidate;
            }
        }

        return '(staging) '.self::shownName($parent);
    }

    /**
     * The fields that link a copy to its live project. The copy is the same
     * site, so it is the live project's type too: the Engine reads a project's
     * WordPress in the main domain's document root only, and a copy of a
     * subdirectory install reads back as `php`.
     *
     * @return array<string, mixed>
     */
    public static function linkFields(Application $parent, string $name): array
    {
        $fields = [
            'staging_of_id' => $parent->id,
            'name' => $name,
        ];

        if ($parent->type === Application::TYPE_WORDPRESS) {
            $fields['type'] = Application::TYPE_WORDPRESS;
        }

        return $fields;
    }

    public static function displayName(Application $application): string
    {
        $name = trim((string) ($application->name ?? ''));
        if ($name !== '') {
            return $name;
        }

        if ($application->isStaging() && $application->stagingOf !== null) {
            return self::stagingName($application->stagingOf);
        }

        return self::shownName($application);
    }

    public static function shownName(Application $application): string
    {
        foreach ([$application->name, $application->engine_username, $application->domain] as $candidate) {
            $candidate = trim((string) ($candidate ?? ''));
            if ($candidate !== '') {
                return $candidate;
            }
        }

        return '';
    }

    /**
     * The Engine only accepts a non-empty string for `domain`/`new_username`;
     * anything else is dropped so `array_filter` does not send `null`.
     *
     * @param  mixed  $value
     */
    private function nonEmptyString($value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * Whether the name is in the PanelAlpha Online proxy zone. The Engine hands
     * a requested name there back unregistered (`CopyDomain` skips the
     * allocator), so only the names its allocator buys for a copy can answer.
     */
    public static function inOnlineZone(?string $domain): bool
    {
        $domain = strtolower(trim((string) $domain, " \t\n\r\0\x0B."));

        return $domain === self::ONLINE_ZONE || str_ends_with($domain, '.'.self::ONLINE_ZONE);
    }

    /**
     * @throws ValidationException
     */
    private function assertDomainCanBeServed(string $domain): void
    {
        if (self::inOnlineZone($domain)) {
            throw ValidationException::withMessages(['domain' => [self::ONLINE_DOMAIN_REFUSED]]);
        }
    }

    /**
     * What the staging modal checks before it lets the user continue (old
     * InstanceController::preCheckDiskUsage). The account figures come from
     * `GET usage`; since Engine 2.2.0 a WordPress project's sizes come from
     * Engine measurements instead of the former `wp eval du -sb` / `wp db
     * query` stopgap (legacy `WpCliStagingSizeProbe`, removed 2026-10-15):
     * the files from the synced project's `disk.files_bytes` (the install is
     * the project) and the database from `size_bytes` of its `DB_NAME` in
     * `GET mysql/databases`. The Engine measures no single directory, so the
     * uploads size is null (the CA shows "0 B" for it).
     *
     * @return array<string, mixed>
     */
    public function preCheck(Application $application): array
    {
        $data = [
            'account_usage' => null,
            'account_limit' => null,
            'wordpress_dir_usage' => null,
            'uploads_dir_usage' => null,
            'wordpress_db_usage' => null,
        ];

        try {
            $usage = (new UsageApi($application->engine()))->usage($application->engineProject());
            $storage = Payload::object($usage['storage'] ?? null);
            // Engine MB → CA bytes; -1 is "unlimited" → null.
            $data['account_usage'] = $this->bytes($storage['usage'] ?? null);
            $data['account_limit'] = $this->bytes($storage['maximum'] ?? null);
        } catch (EngineException $e) {
            report($e);

            return $data;
        }

        if ($application->type === Application::TYPE_WORDPRESS) {
            $disk = Payload::object(Payload::object($application->engine_payload)['disk'] ?? null);
            $data['wordpress_dir_usage'] = Payload::int($disk['files_bytes'] ?? null);
            $data['wordpress_db_usage'] = $this->wordPressDatabaseSize($application);
        }

        return $data;
    }

    /**
     * `size_bytes` of the install's `DB_NAME` database (Engine
     * `DatabaseController::index` measures each database); null when either
     * read fails or the database is not the project's (a container's own
     * database server) – the pre-check degrades, it never fails.
     */
    private function wordPressDatabaseSize(Application $application): ?int
    {
        try {
            $name = null;
            foreach (Payload::objects((new WordPressApi($application->engine(), $application->wordpressInstallPath()))->config($application->engineProject())) as $row) {
                if (Payload::nullableString($row['name'] ?? null) === 'DB_NAME') {
                    $name = Payload::nullableString($row['value'] ?? null);
                }
            }
            if ($name === null) {
                return null;
            }

            foreach ((new MysqlApi($application->engine()))->databases($application->engineProject()) as $database) {
                if (Payload::nullableString($database['database'] ?? null) === $name) {
                    return Payload::int($database['size_bytes'] ?? null);
                }
            }
        } catch (EngineException|EngineValidationException $e) {
            report($e);
        }

        return null;
    }

    private function assertCanCreate(Application $parent): void
    {
        if ($parent->isStaging()) {
            throw ValidationException::withMessages([self::CANNOT_CREATE_FROM_STAGING]);
        }
        if ($parent->stagings()->exists()) {
            throw ValidationException::withMessages([self::ALREADY_HAS_STAGING]);
        }
        if ($parent->status === 'pending') {
            // A freshly created project's Engine create task still runs; the old
            // "Invalid action" did not say why.
            throw ValidationException::withMessages([EngineText::STILL_PREPARING]);
        }
        if ($this->installationFailed($parent)) {
            throw ValidationException::withMessages([self::INVALID_ACTION]);
        }
    }

    /**
     * Old `Application::isFailed()`: a failed status or - the v1 equivalent of
     * the panel-owned `async_status.installation`, which the Engine never
     * writes - the project's install failed, read from its deploys
     *A failed redeploy never blocks staging.
     */
    private function installationFailed(Application $parent): bool
    {
        if ($parent->status === 'failed') {
            return true;
        }

        return $this->deploys->installationFailed($parent);
    }

    /**
     * Engine `usage.storage` is MB with -1 = unlimited; the CA reads bytes and
     * null (old `PanelAlpha/Account::usage`: × 1024², -1 → null).
     */
    private function bytes(mixed $megabytes): ?int
    {
        $megabytes = Payload::limit($megabytes);

        return $megabytes === null ? null : $megabytes * 1024 * 1024;
    }
}