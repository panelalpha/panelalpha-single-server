<?php

namespace PanelAlpha\ClientArea\Sync;

use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\ClientArea\Contracts\MirrorDeletionScope;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Events\ProjectMirrored;
use PanelAlpha\ClientArea\Events\ProjectsUnmirrored;
use PanelAlpha\ClientArea\Jobs\Application\WatchStagingJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\EngineSyncState;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\SelfProject;
use Throwable;

/**
 * Mirrors one Engine's project list into the `applications` table.
 *
 * Shared by every edition. The Engine is the source of truth for what exists;
 * the table adds stable panel ids and panel-only state. Ownership is NOT
 * decided here – Pro/Multi link users to applications in their own tables.
 *
 * Projects that disappeared from the Engine are deleted locally (cascading to
 * panel-only state). /projects/all is a complete list, so this is safe as long
 * as the call succeeded.
 *
 * The project type (`applications.type`) is the Engine's: every list and show
 * answer carries it as `app.type` (Engine develop-2-3-0 – a classic
 * project's stored `wordpress` or `php`, a container's template kind). Every
 * mirror copies it: `wordpress` is WordPress, any other kind is custom, and a
 * missing or `null` one (not read yet) leaves the stored type as it is.
 */
final class ApplicationSynchronizer
{
    /**
     * @param  iterable<MirrorDeletionScope>  $deletionScopes  the tagged keep-row scopes
     */
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly Cache $cache,
        private readonly iterable $deletionScopes = [],
    ) {}

    /**
     * Sync now.
     *
     * @return array{upserted: int, deleted: int, inserted: list<string>} `inserted` are
     *         the usernames seen for the first time.
     *
     * @throws EngineException
     */
    public function sync(int $engineId): array
    {
        $projects = $this->engines->forEngine($engineId)->listProjects();

        // The panel's own project is not a customer project: it is never
        // mirrored, so no route can resolve it.
        // No project that runs a panel is, whoever installed it (see
        // Application::payloadRunsPanel). Dropping them here also makes the
        // delete step below remove a row a previous version imported.
        $projects = array_values(array_filter(
            $projects,
            static fn (array $project): bool => ! SelfProject::matches(Payload::nullableString($project['username'] ?? null))
                && ! Application::payloadRunsPanel($project),
        ));

        $now = Carbon::now();
        $stillCreating = $this->stillCreating($engineId);

        $result = DB::transaction(function () use ($engineId, $projects, $now, $stillCreating) {
            $existing = Application::query()
                ->where('engine_id', $engineId)
                ->pluck('engine_username')
                ->all();

            $rows = [];
            $types = [];
            foreach ($projects as $project) {
                $username = Payload::string($project['username'] ?? '');
                if ($username === '') {
                    continue;
                }
                $type = self::engineType($project);
                if ($type !== null) {
                    $types[$type][] = $username;
                }
                $createdAt = Payload::nullableString($project['created_at'] ?? null);
                $rows[$username] = [
                    'engine_id' => $engineId,
                    'engine_username' => $username,
                    'engine_project_id' => Payload::int($project['id'] ?? null),
                    'name' => $project['name'] ?? null,
                    'domain' => $project['domain'] ?? null,
                    // A row the panel created stays `pending` while the Engine
                    // still runs a task for it (see stillCreating()).
                    'status' => isset($stillCreating[$username]) ? 'pending' : Payload::string($project['status'] ?? 'active'),
                    'engine_payload' => json_encode($project),
                    // An Engine `created_at` may carry a UTC offset; store the
                    // instant as UTC so the datetime cast cannot drop it.
                    'engine_created_at' => $createdAt !== null ? Carbon::parse($createdAt)->utc() : null,
                    'synced_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if ($rows !== []) {
                Application::query()->upsert(
                    array_values($rows),
                    ['engine_id', 'engine_username'],
                    // `name` / `site_name` are panel-owned (set by the WP site
                    // name action) and must not be overwritten on sync.
                    ['engine_project_id', 'domain', 'status', 'engine_payload', 'engine_created_at', 'synced_at', 'updated_at'],
                );
            }

            foreach ($types as $type => $usernames) {
                self::storeType(
                    Application::query()->where('engine_id', $engineId)->whereIn('engine_username', $usernames),
                    $type,
                );
            }

            $delete = Application::query()
                ->where('engine_id', $engineId)
                ->whereNotIn('engine_username', array_keys($rows))
                // A staging whose copy is still running or whose creation the
                // Engine confirmed failed stays in the list until the user
                // retries or deletes it, even after the Engine dropped the
                // destination. A creating marker
                // older than the watcher cap plus its maximum backoff is stale
                // (the watcher was lost) and no longer keeps the row. The boundary is inclusive: at
                // exactly STALE_AFTER_SECONDS the sync drops the row, matching
                // Application::isStagingCreating.
                ->where(function (Builder $query): void {
                    $query->whereNull('staging_of_id')
                        ->orWhere(function (Builder $query): void {
                            $query->whereNull('staging_create_failed_at')
                                ->where(function (Builder $query): void {
                                    $query->whereNull('staging_creating_at')
                                        ->orWhere('staging_creating_at', '<=', now()->subSeconds(WatchStagingJob::STALE_AFTER_SECONDS));
                                });
                        });
                });

            // Mirror-deletion scopes: a tagged scope keeps a
            // row the Engine no longer lists (the classic-onboarding replace).
            foreach ($this->deletionScopes as $scope) {
                $scope->apply($delete);
            }

            $deleted = Payload::int($delete->delete()) ?? 0;

            $this->linkStagings($engineId, $projects);

            // A staging copy is the live project's type (see
            // inheritStagingType()); after the link, so the Engine's list order
            // cannot matter.
            self::stagingCopiesOfWordpress(Application::query()->where('engine_id', $engineId))
                ->update(['type' => Application::TYPE_WORDPRESS]);

            // A successful sync is recorded even when the Engine has zero
            // projects – the persistent "never synced" marker.
            EngineSyncState::query()->updateOrCreate(
                ['engine_id' => $engineId],
                ['synced_at' => $now],
            );

            // `array_keys()` turns a numeric Engine username into an int key;
            // cast the fresh names back to strings so `announceMirrored()`'s
            // strict comparison against the string `engine_username` column
            // still marks the row created.
            $inserted = array_values(array_map(
                static fn (mixed $username): string => Payload::string($username),
                array_diff(array_keys($rows), Payload::strings($existing)),
            ));

            return ['upserted' => count($rows), 'deleted' => $deleted, 'inserted' => $inserted];
        });

        // Announce every mirrored row; the Connect AI scopes follow a new one.
        $this->announceMirrored($engineId, $result['inserted']);

        // Rows the Engine no longer lists leave their owners' Connect AI scopes
        //Announced after the transaction, like the mirror.
        if ($result['deleted'] > 0) {
            ProjectsUnmirrored::dispatch($engineId);
        }

        $this->cache->put($this->freshnessKey($engineId), $now->getTimestamp(), $this->ttl());

        return $result;
    }

    /**
     * Mirror one Engine project (the response of `POST /projects` or
     * `/projects/{u}/clone`) without a full list sync, so a just-created project
     * has a local row the CA can be answered with.
     *
     * `$panelCreated` records that the panel asked the Engine for this project;
     * a row that exists keeps the recording it has.
     *
     * @param  array<string, mixed>  $project
     */
    public function mirror(int $engineId, array $project, bool $panelCreated = false): ?Application
    {
        $username = Payload::string($project['username'] ?? '');
        if ($username === '') {
            return null;
        }

        $exists = Application::query()
            ->where('engine_id', $engineId)
            ->where('engine_username', $username)
            ->exists();

        $now = Carbon::now();
        $createdAt = Payload::nullableString($project['created_at'] ?? null);

        Application::query()->upsert(
            [[
                'engine_id' => $engineId,
                'engine_username' => $username,
                'engine_project_id' => Payload::int($project['id'] ?? null),
                'name' => $project['name'] ?? null,
                'domain' => $project['domain'] ?? null,
                'status' => Payload::string($project['status'] ?? 'active'),
                'engine_payload' => json_encode($project),
                // Mirrored like sync(): an Engine offset is converted to UTC
                // before the datetime cast.
                'engine_created_at' => $createdAt !== null ? Carbon::parse($createdAt)->utc() : null,
                'panel_created_at' => $panelCreated ? $now : null,
                'synced_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['engine_id', 'engine_username'],
            ['engine_project_id', 'domain', 'status', 'engine_payload', 'engine_created_at', 'synced_at', 'updated_at'],
        );

        $type = self::engineType($project);
        if ($type !== null) {
            self::storeType(
                Application::query()->where('engine_id', $engineId)->where('engine_username', $username),
                $type,
            );
        }

        $application = Application::query()
            ->where('engine_id', $engineId)
            ->where('engine_username', $username)
            ->first();

        if ($application !== null) {
            self::inheritStagingType($application);
            ProjectMirrored::dispatch($application->id, ! $exists);
        }

        return $application;
    }

    /**
     * Whether a successful `sync()` was ever recorded for this Engine – not
     * "the user has no projects": the marker
     * is written even for an Engine with zero projects, unlike
     * `applications.synced_at`.
     */
    public function hasSynced(int $engineId): bool
    {
        return EngineSyncState::query()
            ->where('engine_id', $engineId)
            ->whereNotNull('synced_at')
            ->exists();
    }

    /**
     * Sync unless a sync for this Engine happened within config('client-area.sync_ttl').
     *
     * A failed refresh is reported and the cached rows are served, so one
     * flaky Engine does not take the project list down. It is rethrown only
     * when there is nothing cached to fall back to.
     *
     * @return array{upserted: int, deleted: int, inserted: list<string>}|null null when the TTL skipped it
     *
     * @throws EngineException
     */
    public function syncIfStale(int $engineId): ?array
    {
        if ($this->ttl() > 0 && $this->cache->has($this->freshnessKey($engineId))) {
            return null;
        }

        try {
            return $this->sync($engineId);
        } catch (EngineException $e) {
            if (! $this->hasSynced($engineId)) {
                throw $e;
            }
            report($e);

            return null;
        }
    }

    /**
     * @param  list<array<string, mixed>>  $projects
     */
    private function linkStagings(int $engineId, array $projects): void
    {
        $ids = Application::query()->where('engine_id', $engineId)->pluck('id', 'engine_username');

        foreach ($projects as $project) {
            $username = Payload::string($project['username'] ?? '');
            if (! isset($ids[$username])) {
                continue;
            }
            $parent = Payload::nullableString($project['staging_of'] ?? null);
            Application::query()->whereKey($ids[$username])->update([
                'staging_of_id' => $parent !== null && isset($ids[$parent]) ? Payload::int($ids[$parent]) : null,
            ]);
        }
    }

    /**
     * Tell the listeners which rows this sync mirrored, and which are new.
     *
     * @param  list<string>  $inserted
     */
    private function announceMirrored(int $engineId, array $inserted): void
    {
        $mirrored = Application::query()
            ->where('engine_id', $engineId)
            ->get(['id', 'engine_username']);

        foreach ($mirrored as $application) {
            $applicationId = Payload::int($application->getAttribute('id'));
            if ($applicationId === null) {
                continue;
            }

            // A numeric Engine username would arrive as an int array key, so
            // read the column and guard the type instead of casting (the
            // inserted list is a list of strings).
            $username = Payload::nullableString($application->getAttribute('engine_username'));
            $created = $username !== null && in_array($username, $inserted, true);
            ProjectMirrored::dispatch($applicationId, $created);
        }
    }

    /**
     * The usernames of `pending` rows the Engine still runs a task for.
     *
     * A project's Engine `status` is its suspension state – `active` from the
     * moment the row exists (Engine `users.status`, default `active`) – so it
     * says nothing about the create. A panel-created row (`pending`) would turn
     * `active` on the first sync while the create task is still bringing the
     * account up; calls in that window failed (cron 502 `service "php" is not
     * running`, PHP settings "Document root does not exist" – live API suite,
     * 2026-11-04, Engine #1527). Such a row stays `pending` until the Engine has
     * no queued or running task for it.
     *
     * One read per pending row, and only while a pending row exists: the Engine's
     * `username` filter takes one name (`TaskListRequest.php:34-36`,
     * `sometimes|string`; no array, no comma list) and `per_page=1` is the whole
     * answer to "does this project have an active task". The former single
     * unfiltered `per_page=200` read only matched page 1, so on a busy Engine a
     * pending row whose create task sat on page 2 flipped `active` in the window
     * above; a filtered read cannot be cut off that way, since page 1 of it holds
     * at most the tasks of the one project asked about.
     *
     * A failed first read keeps the previous behaviour (no row is held back, the
     * failure is reported): a permanently failing task read – a token that lost
     * `scope=all`, an Engine without the endpoint – would otherwise pin every
     * pending row for ever. A failure after a row was answered is different: the
     * rows this run could not ask about stay `pending` rather than flip `active`
     * on missing data.
     *
     * Engine: core/app/Http/Controllers/TaskController.php:91-135 -> index
     * (`status=active` = queued+running, `scope=all`, `username` filter,
     * paginated `{data, links, meta}` – `TaskSummaryCollection`).
     *
     * @return array<string, true>
     */
    private function stillCreating(int $engineId): array
    {
        $pending = array_values(array_filter(
            Payload::strings(Application::query()
                ->where('engine_id', $engineId)
                ->where('status', 'pending')
                ->pluck('engine_username')
                ->all()),
            static fn (string $username): bool => $username !== '',
        ));
        if ($pending === []) {
            return [];
        }

        $api = new TasksApi($this->engines->forEngine($engineId));
        $busy = [];
        foreach ($pending as $asked => $username) {
            try {
                $answer = $api->list([
                    'status' => 'active',
                    'scope' => 'all',
                    'username' => $username,
                    'per_page' => 1,
                ]);
            } catch (Throwable $e) {
                report($e);
                if ($asked === 0) {
                    return [];
                }

                // The first answer proved nothing is truncated for the rows it
                // covered; these were never asked about, so they stay pending.
                foreach (array_slice($pending, $asked) as $unconfirmed) {
                    $busy[$unconfirmed] = true;
                }

                return $busy;
            }

            if ($answer['tasks'] !== []) {
                $busy[$username] = true;
            }
        }

        return $busy;
    }

    /**
     * The panel type of the Engine's `app.type`: WordPress or custom, or null
     * while the Engine names none.
     *
     * @param  array<string, mixed>  $project
     */
    private static function engineType(array $project): ?string
    {
        $type = Payload::nullableString(Payload::object($project['app'] ?? null)['type'] ?? null);
        if ($type === null || $type === '') {
            return null;
        }

        return $type === Application::TYPE_WORDPRESS ? Application::TYPE_WORDPRESS : Application::TYPE_CUSTOM;
    }

    /**
     * Store the Engine's type, except that a project with a finished install the
     * panel made is `wordpress` whatever the Engine reads there: it detects
     * WordPress in the main domain's document root only, so an install into a
     * subdirectory reads back as `php`.
     *
     * @param  Builder<Application>  $query
     */
    private static function storeType(Builder $query, string $type): void
    {
        if ($type === Application::TYPE_WORDPRESS) {
            $query->update(['type' => $type]);

            return;
        }

        $installed = static fn (Builder $install): Builder => $install->where('status', WordPressInstall::FINISHED);

        (clone $query)->whereHas('wordpressInstall', $installed)->update(['type' => Application::TYPE_WORDPRESS]);
        $query->whereDoesntHave('wordpressInstall', $installed)->update(['type' => $type]);
    }

    /**
     * A staging copy is the live project's files and database, so it is the live
     * project's type too: the Engine reads a project's WordPress in the main
     * domain's document root only, so a copy of a subdirectory install reads
     * back as `php`.
     */
    private static function inheritStagingType(Application $application): void
    {
        if (! $application->isStaging()) {
            return;
        }

        $updated = self::stagingCopiesOfWordpress(Application::query()->whereKey($application->getKey()))
            ->update(['type' => Application::TYPE_WORDPRESS]);

        if ($updated > 0) {
            // The caller answers with this instance, not with a fresh read.
            $application->forceFill(['type' => Application::TYPE_WORDPRESS]);
        }
    }

    /**
     * The rows in `$query` that are a staging copy of a WordPress project.
     *
     * @param  Builder<Application>  $query
     * @return Builder<Application>
     */
    private static function stagingCopiesOfWordpress(Builder $query): Builder
    {
        return $query
            ->where(static function (Builder $copy): void {
                $copy->whereNull('type')->orWhere('type', '!=', Application::TYPE_WORDPRESS);
            })
            ->whereHas('stagingOf', static fn (Builder $live): Builder => $live->where('type', Application::TYPE_WORDPRESS));
    }

    private function freshnessKey(int $engineId): string
    {
        return "user-application:engine:{$engineId}:synced-at";
    }

    private function ttl(): int
    {
        return Payload::int(config('client-area.sync_ttl', 15)) ?? 15;
    }
}
