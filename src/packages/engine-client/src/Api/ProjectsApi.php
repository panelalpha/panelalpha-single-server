<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineFeatures;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\EngineClient\Support\ProjectCreateBody;

/**
 * Engine project lifecycle and deploy endpoints:
 * rebuild, archive deploy, the deploy log/cancel pair and the git porcelain
 * that a redeploy needs.
 *
 * Thin and stateless: every method takes the project, builds its Engine
 * path and returns the Engine `data`. All Engine paths for this area live here
 * – no controller or service builds them.
 *
 * A method whose Engine route refuses a protected project
 * (`EnsureProjectNotProtected::REFUSED`) checks the project's `protected` flag
 * first and throws ProjectProtectedException without calling the Engine.
 */
final class ProjectsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Add the per-deploy `skip` list to a deploy body; an empty list adds
     * nothing, so a deploy without skipping sends exactly what it did before.
     *
     * @param  array<string, mixed>  $body
     * @param  list<string>  $skip
     * @return array<string, mixed>
     */
    private static function withSkip(array $body, array $skip): array
    {
        if ($skip !== []) {
            $body['skip'] = $skip;
        }

        return $body;
    }

    /**
     * Create a project (`POST /projects`, 202 + Task; `data.username` and
     * `data.details.domain` are final). `$flat` is the flat body every Engine
     * takes; an Engine that lists `project_source` gets it as the typed body
     * (Engine 2.3.0), whose refusals are renamed back to the flat
     * fields, so the caller handles both the same way.
     *
     * Engine: core/routes/api.php:457 -> UserController::storeAsync
     * (`ProjectCreateRequest`, `CreateShape::isTyped`).
     *
     * @param  array<string, mixed>  $flat
     */
    public function create(array $flat): Response
    {
        if (! EngineFeatures::supports($this->engine, EngineFeatures::PROJECT_SOURCE)) {
            return $this->engine->post('projects', $flat);
        }

        $nameField = ProjectCreateBody::nameField($flat);
        try {
            return $this->engine->post('projects', ProjectCreateBody::typed($flat));
        } catch (EngineValidationException $e) {
            throw $e->withFieldsRenamed(static fn (string $field): string => ProjectCreateBody::flatField($field, $nameField));
        }
    }

    /**
     * Whether this Engine copies a project as a create (`copy()`), not only
     * with the synchronous `clone()`.
     */
    public function copiesAsCreate(): bool
    {
        return EngineFeatures::supports($this->engine, EngineFeatures::PROJECT_SOURCE);
    }

    /**
     * Copy a project as a create with a `project` source (`POST /projects`
     * `{source: {type: project, from, copy_databases}}`, Engine 2.3.0). The
     * copy's account rows exist at the 202, so `data.username` is final; the
     * files and databases are copied by the answered `CopyProject` task, and
     * the Engine discards the copy when that task fails. Only on an Engine
     * that `copiesAsCreate()`. A refusal names `new_username`/`domain` as the
     * clone does.
     *
     * Engine: `CreateBody::refuseOnCopy` (only `name` and `domain.name` go
     * with a copy), `ProjectCopier::queue`.
     *
     * @param  array{name?: string, domain?: string}  $params
     */
    public function copy(EngineProject $project, bool $copyDatabases = true, array $params = []): Response
    {
        $body = ['source' => ['type' => 'project', 'from' => $project->username, 'copy_databases' => $copyDatabases]];
        $name = $params['name'] ?? '';
        if ($name !== '') {
            $body['name'] = $name;
        }
        $domain = $params['domain'] ?? '';
        if ($domain !== '') {
            $body['domain'] = ['name' => $domain];
        }

        try {
            return $this->engine->post('projects', $body);
        } catch (EngineValidationException $e) {
            throw $e->withFieldsRenamed(static fn (string $field): string => ProjectCreateBody::flatField($field, 'new_username'));
        }
    }

    /**
     * Whether this Engine attaches a source with `setSource()`.
     */
    public function setsSource(): bool
    {
        return EngineFeatures::supports($this->engine, EngineFeatures::PROJECT_SOURCE);
    }

    /**
     * Give an existing container project its source (`PUT
     * /projects/{u}/source`, Engine 2.3.0): a git source on one with none that
     * has not run an app yet, or an archive (`upload_id`, `url` or `path`)
     * that replaces `~/project`. 202 + Task (`RebuildProject`); 409 when the
     * project is busy or cannot take the source (`source_already_attached`,
     * `project_not_eligible`, `archive_on_git_project`). `build.env_vars`
     * merge onto the project's own. A refusal is renamed back to the flat
     * fields (`source.url` → `git_repo`…). Only on an Engine that
     * `setsSource()`.
     *
     * Engine: core/routes/api.php:190 -> ProjectSourceController::update.
     *
     * @param  array<string, mixed>  $source  the typed `source` object
     * @param  array<string, string|null>  $envVars
     */
    public function setSource(EngineProject $project, array $source, array $envVars = []): Response
    {
        // EnsureProjectNotProtected.php:54 `PUT /projects/{username}/source`.
        ProjectProtectedException::throwIfProtected($project);

        $body = ['source' => $source];
        if ($envVars !== []) {
            $body['build'] = ['env_vars' => $envVars];
        }

        try {
            return $this->engine->put($project->enginePath('source'), $body);
        } catch (EngineValidationException $e) {
            throw $e->withFieldsRenamed(static fn (string $field): string => ProjectCreateBody::flatField($field));
        }
    }

    /**
     * Rebuild a project from ~/project (optionally importing an archive first).
     * Answers 202 + Task, or 409 when a deploy is already queued/running.
     *
     * @param  array<string, mixed>  $payload
     * @param  list<string>  $skip  Engine step names to skip for this deploy
     *                              (`dependencies|assets|upgrade`); not sent when empty
     */
    public function rebuild(EngineProject $project, array $payload = [], array $skip = []): Response
    {
        // EnsureProjectNotProtected.php:45 `POST /projects/{username}/rebuild`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->post($project->enginePath('rebuild'), self::withSkip($payload, $skip));
    }

    /**
     * Delete the project on the Engine (`DELETE /projects/{u}`).
     * 409 while a task runs, 404 when it is already gone.
     */
    public function delete(EngineProject $project): Response
    {
        // EnsureProjectNotProtected.php:42 `DELETE /projects/{username}`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->delete($project->enginePath());
    }

    /**
     * The project resource (Engine `GET /projects/{u}`), for callers that need
     * the live state rather than the mirror.
     *
     * @return array<string, mixed>
     */
    public function show(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath())->json('data'));
    }

    /**
     * The login the Engine generated for the app (a recipe's `credentials:`,
     * e.g. listmonk's Super Admin): `{available, login_url, created_at,
     * fields: [{name, kind (username|email|password), value}]}`. `available` is
     * false for an app without generated credentials.
     *
     * Engine: core/app/Http/Controllers/User/AppCredentialsController.php -> show.
     *
     * @return array<string, mixed>
     */
    public function appCredentials(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('app-credentials'))->json('data'));
    }

    /**
     * Update the project (Engine `PUT /projects/{u}`): its resource limits
     * (`disk_space_limit`, `memory_limit`, `cpu_limit`, `device_read_bps`,
     * `device_write_bps`, `bandwidth_limit`, the `*_limit` counts), the
     * PHP-FPM/LSPHP/Redis settings, `email` or `domain`. Only the keys sent are
     * changed; an explicit null clears a limit. A new memory limit applies at
     * once, the others at the project's next rebuild. Returns the project
     * resource (`data`).
     *
     * Engine: core/app/Http/Controllers/UserController.php:1330 -> update
     * (UserUpdateRequest). The Engine refuses a protected project only when the
     * update renames the main domain (`EnsureProjectNotProtected.php:124`), so
     * only a `domain` is checked before the call.
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function update(EngineProject $project, array $params): array
    {
        if (is_string($params['domain'] ?? null) && $params['domain'] !== '') {
            ProjectProtectedException::throwIfProtected($project);
        }

        return Payload::object($this->engine->put($project->enginePath(), $params)->json('data'));
    }

    /**
     * Suspend the project (Engine `PUT /projects/{u}/suspend`): the Engine stops
     * serving its domains and answers the project resource (`data`, status
     * `suspended`) plus `reload_pending`. Only an unscoped token may call it,
     * and the Engine refuses a protected project
     * (`EnsureProjectNotProtected.php:47`), so the flag is checked first.
     *
     * Engine: core/app/Http/Controllers/UserController.php:1424 -> suspend.
     *
     * @return array<string, mixed>
     */
    public function suspend(EngineProject $project): array
    {
        ProjectProtectedException::throwIfProtected($project);

        return Payload::object($this->engine->put($project->enginePath('suspend'))->json('data'));
    }

    /**
     * Unsuspend the project (Engine `PUT /projects/{u}/unsuspend`): answers the
     * project resource (`data`, status `active`). Not refused for a protected
     * project.
     *
     * Engine: core/app/Http/Controllers/UserController.php:1467 -> unsuspend.
     *
     * @return array<string, mixed>
     */
    public function unsuspend(EngineProject $project): array
    {
        return Payload::object($this->engine->put($project->enginePath('unsuspend'))->json('data'));
    }

    /**
     * Push a project's state to another (`POST /projects/{u}/push`, 202). The
     * Engine copies the source's files and, on classic projects, its databases
     * asynchronously. The CA's push flags map one to one
     * (`overwrite_files` → `files`, `push_db` → `databases`, the selected tables
     * → `tables`), and `databases` is always sent so the Engine's new default
     * (`true`) cannot replace a target database the user did not tick.
     *
     * The 202 body is the **target** UserResource plus a top-level `task_id`
     * (`StagingController::push` `->additional(['task_id' => $task->id])`); the
     * caller follows the push with `EngineClient::task()`.
     *
     * The Engine refuses a push whose **target** is protected
     * (EnsureProjectNotProtected.php:55 with `ProjectFields.php:16`
     * `target`), so the target's mirrored flag is checked, not the source's.
     *
     * @param  array{files?: bool, databases?: bool, tables?: list<array{database: string, name: string}>}  $flags
     * @return array{project: array<string, mixed>, task_id: int|null}
     */
    public function push(EngineProject $project, EngineProject $target, array $flags = []): array
    {
        ProjectProtectedException::throwIfProtected($target);

        $response = $this->engine->post($project->enginePath('push'), array_merge(['target' => $target->username], $flags));

        return [
            'project' => Payload::object($response->json('data')),
            'task_id' => Payload::int($response->json('task_id')),
        ];
    }

    /**
     * The tables that differ between a project and its push target (Engine
     * `GET /projects/{u}/push/diff?target=`, `StagingController::pushDiff`,
     * `PushDiffResource`). Read-only, classic projects only (the Engine refuses
     * a dind project's `target` with `tables_not_applicable`). The names are the
     * source project's, ready to send back as a push's `tables`.
     *
     * @return array{tables_structure_diff: list<array<string, mixed>>, tables_data_diff: list<array<string, mixed>>}
     */
    public function pushDiff(EngineProject $project, string $target): array
    {
        $data = Payload::object($this->engine->get(
            $project->enginePath('push/diff'),
            ['target' => $target],
        )->json('data'));

        return [
            'tables_structure_diff' => Payload::objects($data['tables_structure_diff'] ?? null),
            'tables_data_diff' => Payload::objects($data['tables_data_diff'] ?? null),
        ];
    }

    /**
     * Create a linked staging mirror of a live project (Engine
     * `POST /projects/{u}/staging`, 202). The Engine copies files asynchronously
     * and answers the destination project's resource (`data`) plus the copy
     * task's top-level `task_id` (`StagingController::staging`
     * `->additional(['task_id' => $task->id])`); poll it until
     * `async_status.staging` is `completed`/`failed` - the task is the only
     * record of a failed copy, because the Engine deletes the destination.
     *
     * @param  array{new_username?: string, domain?: string, copy_databases?: bool}  $params
     * @return array{project: array<string, mixed>, task_id: int|null}
     */
    public function createStaging(EngineProject $project, array $params = []): array
    {
        $response = $this->engine->post($project->enginePath('staging'), $params);
        $taskId = Payload::int($response->json('task_id'));

        return [
            'project' => Payload::object($response->json('data')),
            'task_id' => $taskId,
        ];
    }

    /**
     * Clone a project (Engine `POST /projects/{u}/clone`, synchronous). The
     * Engine generates the new username and domain when they are omitted;
     * returns the new project's resource (`data`).
     *
     * @param  array{new_username?: string, domain?: string, copy_databases?: bool}  $params
     * @return array<string, mixed>
     */
    public function clone(EngineProject $project, array $params = []): array
    {
        return Payload::object($this->engine->post($project->enginePath('clone'), $params)->json('data'));
    }

    /**
     * Rename the project's main domain (Engine `PUT /projects/{u}` with a new
     * `domain`).
     *
     * @return array<string, mixed>
     */
    public function renameDomain(EngineProject $project, string $domain): array
    {
        // EnsureProjectNotProtected.php:43/138 `PUT /projects/{username}` with a
        // `domain`.
        ProjectProtectedException::throwIfProtected($project);

        return Payload::object($this->engine->put($project->enginePath(), ['domain' => $domain])->json('data'));
    }

    /**
     * Deploy an uploaded archive into a (container) project (dind only).
     * Answers 202 + Task.
     *
     * @param  array<string, string|null>  $envVars
     * @param  list<string>  $skip  Engine step names to skip (not sent when empty)
     */
    public function deployArchive(EngineProject $project, string $zipPath, array $envVars = [], array $skip = []): Response
    {
        // EnsureProjectNotProtected.php:46 `POST /projects/{username}/deploy-archive`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->post($project->enginePath('deploy-archive'), self::withSkip(array_filter([
            'zip_path' => $zipPath,
            'env_vars' => $envVars === [] ? null : $envVars,
        ], static fn ($value) => $value !== null), $skip));
    }

    /**
     * The current deploy log page: `{id, status, stage, stages, lines,
     * next_offset, more, error, started_at, finished_at, ...}`; `status` is
     * `none` when nothing has been deployed yet.
     *
     * @return array<string, mixed>
     */
    public function deployLog(EngineProject $project, int $offset = 0): array
    {
        return Payload::object($this->engine->get($project->enginePath('deploy-log'), ['offset' => max(0, $offset)])->json('data'));
    }

    /**
     * The deploys the project still keeps a log of, newest first (at most the
     * Engine's `DEPLOY_LOG_KEEP`, no paging): `{id, status, error, started_at,
     * finished_at, kind, source, branch, commit, trigger, action, task_id}`.
     * `status` is the deploy-log status or `unknown` for an older log without a
     * verdict; times are unix seconds.
     *
     * A project that is not a container project keeps no deploy log: Engine
     * 2.2.0 answered it an empty list, 2.3.0 a 403 (`ReadsDeployLogs`,
     * engine 0d1f6cc88). Both are no deploys here, so a caller that reads the
     * history of a classic project (the git onboarding of a domain-step
     * project, a change of branch) keeps working.
     *
     * Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index,
     * core/app/Lib/Deploy/DeployLog/DeployHistory.php:84-102 -> entry.
     *
     * @return list<array<string, mixed>>
     */
    public function deploys(EngineProject $project): array
    {
        try {
            return Payload::objects($this->engine->get($project->enginePath('deploys'))->json('data'));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 403) {
                return [];
            }

            throw $e;
        }
    }

    /**
     * One page of a kept deploy's log by its id: the deploy's history item plus
     * `lines` (`{ts, stage, level, msg}`), `next_offset` and `more`. A deploy the
     * Engine no longer keeps answers 404.
     *
     * Engine: core/app/Http/Controllers/User/DeployHistoryController.php:74-83 -> log.
     *
     * @return array<string, mixed>
     */
    public function deployLogOf(EngineProject $project, string $deployId, int $offset = 0): array
    {
        return Payload::object($this->engine->get(
            $project->enginePath('deploys/'.rawurlencode($deployId).'/log'),
            ['offset' => max(0, $offset)],
        )->json('data'));
    }

    /**
     * Cancel a running deploy. 409 (no running deploy) bubbles through.
     *
     * @return array<string, mixed>
     */
    public function cancelDeploy(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('deploy-cancel'))->json('data'));
    }

    /**
     * Pull the project's checkout. Answers 202 + Task on deploy-managed
     * (container) projects, else 200 with the git result.
     *
     * @param  array{path?: string, strategy?: string}  $params
     * @param  list<string>  $skip  Engine step names to skip (not sent when empty)
     */
    public function gitPull(EngineProject $project, array $params = [], array $skip = []): Response
    {
        // EnsureProjectNotProtected.php:48 `POST /projects/{username}/git/pull`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->post($project->enginePath('git/pull'), self::withSkip($params, $skip));
    }

    /**
     * Change the branch of a deploy-managed checkout. Answers 202 + Task.
     *
     * @param  list<string>  $skip  Engine step names to skip (not sent when empty)
     */
    public function gitChangeBranch(EngineProject $project, string $branch, ?string $path = null, array $skip = []): Response
    {
        // EnsureProjectNotProtected.php:49 `PUT /projects/{username}/git/change-branch`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->put($project->enginePath('git/change-branch'), self::withSkip(array_filter([
            'branch' => $branch,
            'path' => $path,
        ], static fn ($v) => $v !== null), $skip));
    }

    /**
     * @return array<string, mixed>
     */
    public function gitStatus(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('git/status'))->json('data'));
    }

    // ---- Section E: git porcelain ---------------------------------------

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function gitConnect(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->post($project->enginePath('git/connect'), $params)->json('data'));
    }

    /**
     * Show or generate the project's SSH deploy key (idempotent). `host[:port]`
     * is sent only for a self-hosted forge, which the Engine scans once; the
     * well-known forges are pinned from its own known_hosts.
     *
     * @return array<string, mixed>  `created`, `public_key`, `fingerprint`, `hosts`
     */
    public function gitDeployKey(EngineProject $project, ?string $host = null): array
    {
        return Payload::object($this->engine->post(
            $project->enginePath('git/deploy-key'),
            $host !== null ? ['host' => $host] : [],
        )->json('data'));
    }

    /**
     * The project's stored deploy key without creating one, or null when the
     * Engine's own 404 says it has none. Every other failure is rethrown,
     * including the answers of an Engine that does not offer this read yet
     * (see `lacksDeployKeyRead()`).
     *
     * @return array<string, mixed>|null  `public_key`, `fingerprint`, `hosts`
     */
    public function gitShowDeployKey(EngineProject $project): ?array
    {
        try {
            return Payload::object($this->engine->get($project->enginePath('git/deploy-key'))->json('data'));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404 && ! self::lacksDeployKeyRead($e)) {
                return null;
            }

            throw $e;
        }
    }

    /**
     * An Engine that has no read of a project's deploy key: a 405 from the
     * create's path, a 404 without a message, or Laravel's own 404 `Not Found`
     * from its fallback route. The Engine's 404 for a project without a key
     * carries its own sentence instead.
     */
    public static function lacksDeployKeyRead(EngineRequestException $e): bool
    {
        if ($e->engineStatus === 405) {
            return true;
        }
        if ($e->engineStatus !== 404) {
            return false;
        }

        $message = $e->engineMessage ?? '';

        return $message === '' || $message === 'Not Found';
    }

    /**
     * Remove the project's deploy key. An Engine 404 (no key) is not an error.
     */
    public function gitDeleteDeployKey(EngineProject $project): void
    {
        try {
            $this->engine->delete($project->enginePath('git/deploy-key'));
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function gitDisconnect(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('git/disconnect'))->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function gitPush(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('git/push'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function gitRevert(EngineProject $project, array $params = []): Response
    {
        // EnsureProjectNotProtected.php:50 `POST /projects/{username}/git/revert`.
        ProjectProtectedException::throwIfProtected($project);

        return $this->engine->post($project->enginePath('git/revert'), $params);
    }

    /**
     * @param  array{token?: string|null, path?: string}  $params
     * @return array<string, mixed>
     */
    public function gitUpdateCredentials(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->put($project->enginePath('git/update-credentials'), $params)->json('data'));
    }

    /**
     * @return list<array<string, mixed>|string>  Engine `git/branches` rows or bare names
     */
    public function gitBranches(EngineProject $project): array
    {
        return Payload::objectsOrStrings($this->engine->get($project->enginePath('git/branches'))->json('data'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function gitCommits(EngineProject $project, ?string $branch = null, ?int $limit = null): array
    {
        return Payload::objects($this->engine->get($project->enginePath('git/commits'), array_filter([
            'branch' => $branch,
            'limit' => $limit,
        ], static fn ($v) => $v !== null))->json('data'));
    }

    /**
     * Register the Engine-side deploy hook for push-to-deploy (create).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function createDeployHook(EngineProject $project, array $params = []): array
    {
        return Payload::object($this->engine->post($project->enginePath('git/deploy-hook'), $params)->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function showDeployHook(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('git/deploy-hook'))->json('data'));
    }

    /**
     * Replace the deploy hook's URL and secret (the secret is shown once).
     * 404 when the checkout has no hook.
     *
     * @return array<string, mixed>
     */
    public function rotateDeployHook(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('git/deploy-hook/rotate'))->json('data'));
    }

    public function deleteDeployHook(EngineProject $project): Response
    {
        return $this->engine->delete($project->enginePath('git/deploy-hook'));
    }

    /**
     * Create a directory inside the project home (used for the archive upload
     * staging folder). The Engine confines the path to home.
     */
    public function mkdir(EngineProject $project, string $path, bool $parents = true): Response
    {
        return $this->engine->post($project->enginePath('files/mkdir'), [
            'path' => $path,
            'parents' => $parents,
        ]);
    }

    /**
     * Upload an archive (multipart `file`) into a home-relative `path`.
     *
     * @param  resource|string  $contents  the raw request body stream
     */
    public function uploadFile(EngineProject $project, string $path, $contents, string $filename): Response
    {
        return $this->engine->upload($project->enginePath('files/upload'), ['path' => $path], [
            'name' => 'file',
            'contents' => $contents,
            'filename' => $filename,
        ]);
    }

    /**
     * Inspect an existing project's checkout: the detected application (label,
     * runtime, platform, database, deployable, commands, stages), its services,
     * the last deployment snapshot (status, warnings, branch, commit) and the
     * drift between what was deployed and what is detected now
     * (GET /projects/{u}/inspect, SourceInspectionController::project). A
     * project without a `~/project` checkout is a 422.
     *
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    public function inspect(EngineProject $project, array $query = []): array
    {
        return Payload::object($this->engine->get($project->enginePath('inspect'), $query)->json('data'));
    }

    /**
     * Inspect a source (git repo / directory) before a project exists: stack,
     * ports, services, expected env variable names and marker files
     * (POST /source/inspect). `source` must be the repository URL or a path.
     *
     * @param  array{source: string, type?: string, branch?: string, subdirectory?: string, git_token?: string}  $params
     * @return array<string, mixed>
     */
    public function inspectSource(array $params): array
    {
        return Payload::object($this->engine->post('source/inspect', array_filter(
            $params,
            static fn (?string $v): bool => $v !== null && $v !== '',
        ))->json('data'));
    }

    /**
     * List a remote repository's branches and tags before a project exists
     * (POST /source/refs, SourceRefsController::refs). `repository` must be the
     * canonical URL; `git_token` is a literal token or a `vault:<id>` reference.
     *
     * @return array<string, mixed>
     */
    public function sourceRefs(string $repository, ?string $token = null, ?int $limit = null): array
    {
        return Payload::object($this->engine->post('source/refs', array_filter([
            'repository' => $repository,
            'git_token' => $token,
            'limit' => $limit,
        ], static fn ($v) => $v !== null && $v !== ''))->json('data'));
    }

    /**
     * Store a git source on an existing (empty dind) project and queue the
     * source rebuild (POST /projects/{u}/source, 202 + TaskResource,
     * UserController::attachSource). A project that already deploys or cannot
     * take a source answers 409 and bubbles. An Engine that `setsSource()`
     * gets the same attach as `PUT /projects/{u}/source` with a git source
     * (the same 409 codes; a 422 is renamed back to these fields).
     *
     * @param  array{git_repo: string, git_branch?: string|null, git_token?: string|null, env_vars?: array<string, string|null>}  $params
     * @return int|null the queued Engine task id
     */
    public function attachSource(EngineProject $project, array $params): ?int
    {
        if ($this->setsSource()) {
            $source = ['type' => 'git', 'url' => $params['git_repo']];
            $branch = $params['git_branch'] ?? null;
            if ($branch !== null && $branch !== '') {
                $source['branch'] = $branch;
            }
            $token = $params['git_token'] ?? null;
            if ($token !== null && $token !== '') {
                $source['auth'] = ['type' => 'token', 'token' => $token];
            }

            return Payload::int($this->setSource($project, $source, $params['env_vars'] ?? [])->json('data.id'));
        }

        // EnsureProjectNotProtected.php:47 `POST /projects/{username}/source`.
        ProjectProtectedException::throwIfProtected($project);

        $body = array_filter([
            'git_repo' => $params['git_repo'],
            'git_branch' => $params['git_branch'] ?? null,
            'git_token' => $params['git_token'] ?? null,
        ], static fn ($v) => $v !== null && $v !== '');

        $envVars = $params['env_vars'] ?? [];
        if ($envVars !== []) {
            $body['env_vars'] = $envVars;
        }

        $response = $this->engine->post($project->enginePath('source'), $body);

        return Payload::int($response->json('data.id'));
    }

    /**
     * Run Lighthouse against a URL hosted on this Engine and return the report.
     * `summary` keeps the payload to scores + audit titles (what the CA needs).
     *
     * @return array<string, mixed>
     */
    public function lighthouseReport(string $url, bool $desktop = true, bool $summary = true): array
    {
        return Payload::object($this->engine->post('lighthouse/generate-report', [
            'url' => $url,
            'desktop_preset' => $desktop,
            'summary' => $summary,
        ])->json('data'));
    }
}
