<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Http\Client\Response;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\ProtectedProject;
use Throwable;

/**
 * Container-project deploys: redeploy from git or from an
 * uploaded archive.
 *
 * Mirrors the old panel's RedeployController/DeployLog flow: a redeploy is
 * refused with 409 while the Engine runs another, validates everything, asks the
 * Engine for a 202 Task and only then follows the accepted deploy
 * (`DeployState::follow()` – the panel keeps no deploy row,
 * the history is the Engine's). The old
 * `mode` (overwrite/replace) is accepted for compatibility; the Engine applies
 * the archive itself. `skip` (panel categories, see {@see DeploySkip}) leaves
 * steps out of this one deploy and is refused 422 `deploy_skip_unsupported`
 * for a category the project's inspect does not announce as skippable.
 *
 * Deploy-log/deploy-cancel/rebuild are container (DinD) only on the Engine
 *Its `deploy-archive` answers 422 for a classic project
 * and `rebuild` ignores `zip_path` there, so both a git redeploy and a files
 * redeploy are refused 422 up front on a classic project.
 */
final class DeployService
{
    private const NOTIFY_FINISHED = 'user.instance.redeploy_finished';

    private const NOTIFY_FAILED = 'user.instance.redeploy_failed';

    private const ARCHIVE_RETRY_REFUSED = 'This project deploys from an uploaded archive, and that archive is deleted when its deploy ends. Upload the archive again to retry.';

    /** The Engine's refusal of a git action on a checkout that is not there. */
    private const NO_CHECKOUT = 'No git repository at path';

    public function __construct(
        private readonly DeployState $state,
        private readonly WordPressInstallService $wordpressInstalls,
        private readonly ProjectSourceReport $sourceReport,
    ) {}

    /**
     * @param  array<string, mixed>  $params  validated RedeployRequest body
     * @return array{deploy_log_id: null, target_id: int}
     *
     * @throws ValidationException  unsupported source / missing input / wrong kind
     * @throws EngineRequestException 409 while another deploy runs (bubbles through)
     */
    public function redeploy(Application $viewed, array $params): array
    {
        $target = $this->resolveTarget($viewed, (bool) ($params['deploy_staging'] ?? false));
        // The Engine's archive deploy (`deploy-archive`) is Dind-only and
        // `rebuild` ignores `zip_path` for a classic project, so neither the
        // git porcelain nor a files archive can deploy a classic project;
        // refuse up front.
        $this->assertContainer($target);
        $source = $this->sourceType($target);

        $this->assertNotRunning($target);

        // Validate the source-specific input before touching the Engine.
        $archive = null;
        if ($source === DeployState::SOURCE_GIT) {
            $params['branch'] = $this->requiredBranch($params);
        } else {
            $archive = $this->archivePath($params);
        }

        try {
            $skip = $this->engineSkip($target, $params);
        } catch (ValidationException $e) {
            // Refused before any Engine call: the staged archive has no deploy.
            $this->deleteStagedArchive($target, $archive);

            throw $e;
        }

        $api = new ProjectsApi($target->engine());
        try {
            $response = $source === DeployState::SOURCE_GIT
                ? $this->gitRedeploy($api, $target, $params, $skip)
                : $api->rebuild($target->engineProject(), ['zip_path' => $archive], $skip);
        } catch (EngineValidationException|EngineException $e) {
            // No 202 means no deploy task, so nothing else will delete the
            // staged archive.
            $this->deleteStagedArchiveIfNoTask($target, $archive, $e);

            throw $e;
        }

        // The Engine accepted (2xx/202): only now is there a deploy to follow.
        // The Source card and the alert must show it as running, not the cached
        // answer of before.
        ProjectSourceReport::forget($target);
        $this->state->follow($target, $this->taskIdOf($response), new DeployWatch(self::NOTIFY_FINISHED, self::NOTIFY_FAILED, $archive), $source);

        // The panel row id the CA stores and never reads
        // (`GitRedeployModal.vue:611`, `FilesUploadVersionModal.vue:524`): the
        // panel writes no row.
        return ['deploy_log_id' => null, 'target_id' => $target->id];
    }

    /**
     * Retry a failed deploy of a container project: rebuild from the files
     * already in `~/project` (old InstanceController::retryInstall). Only a
     * project whose last deploy failed may retry, and the CA waits for an
     * `installation_*` notification, not `redeploy_*`.
     *
     * `$clientAreaRetry`: the Client Area asks for a gone archive and re-clones a
     * missing checkout; the Admin Area keeps the rebuild and the pull.
     *
     * @return Application the application, whose latest deploy can be followed
     *
     * @throws ValidationException when the project is not a container, its
     *                             installation did not fail (old `cannot_retry_installation`),
     *                             or `$clientAreaRetry` and it was installed from an archive
     * @throws EngineRequestException 409 while another deploy runs
     */
    public function retryInstall(Application $application, bool $clientAreaRetry = false): Application
    {
        // "Install WordPress" on a classic project is the panel's own job:
        // a failed one re-runs with its recorded form.
        if ($application->wordpressInstall !== null) {
            if (! $this->wordpressInstalls->retry($application)) {
                // Old custom_validation.cannot_retry_installation text, key 0.
                throw ValidationException::withMessages(['Cannot retry installation on this instance.']);
            }

            return $application;
        }

        $this->assertContainer($application);
        $this->assertNotRunning($application);

        // The Engine has no `async_status.installation`; the project's deploy
        // outcome decides, as the presenter shows it: a failed
        // redeploy after a successful install never counts, and a
        // cancelled install is a failed one.
        if (! $this->state->installationFailed($application)) {
            // Old custom_validation.cannot_retry_installation text, key 0.
            throw ValidationException::withMessages(['Cannot retry installation on this instance.']);
        }

        $source = $this->sourceType($application);

        if ($clientAreaRetry && $source === DeployState::SOURCE_FILES) {
            throw ValidationException::withMessages([self::ARCHIVE_RETRY_REFUSED]);
        }

        // Rebuild first (follow-after-accept). A files project rebuilds from
        // what is already in ~/project; a git project pulls its checkout.
        $api = new ProjectsApi($application->engine());
        $response = match (true) {
            $source !== DeployState::SOURCE_GIT => $api->rebuild($application->engineProject()),
            $clientAreaRetry => $this->gitRetry($api, $application),
            default => $api->gitPull($application->engineProject()),
        };

        $this->state->follow(
            $application,
            $this->taskIdOf($response),
            new DeployWatch('user.instance.installation_finished', 'user.instance.installation_failed'),
            $source,
        );

        return $application;
    }

    /**
     * Pull, or rebuild (a fresh clone) when a failed first deploy left no checkout.
     *
     * @throws EngineValidationException|EngineRequestException a refusal that is
     *                                                          not the missing checkout
     */
    private function gitRetry(ProjectsApi $api, Application $application): Response
    {
        try {
            return $api->gitPull($application->engineProject());
        } catch (EngineValidationException $e) {
            if (! str_contains($e->getMessage(), self::NO_CHECKOUT)) {
                throw $e;
            }

            return $api->rebuild($application->engineProject());
        }
    }

    /**
     * Stage an uploaded archive in the project's application directory and
     * return the home-relative path the redeploy accepts (old
     * RedeployController::upload). The CA posts the raw body with `?filename=`;
     * the Engine confines the write to home.
     *
     * @param  array<string, mixed>  $params
     * @param  resource|string  $contents  the raw request body stream
     * @param  int|null  $timeout  per-call Engine HTTP timeout; defaults to
     *                             EngineClient::LONG_TIMEOUT_SECONDS (a large
     *                             archive over a slow link)
     * @return array{remote_filepath: string}
     */
    public function uploadArchive(Application $viewed, array $params, $contents, ?int $timeout = EngineClient::LONG_TIMEOUT_SECONDS): array
    {
        $target = $this->resolveTarget($viewed, (bool) ($params['deploy_staging'] ?? false));
        // The archive only feeds a redeploy (`rebuild`), which the Engine refuses
        // on a protected project: refuse before staging it.
        ProtectedProject::refuse($target->engineProject());

        $dir = $target->archiveUploadDir();
        if ($dir === null) {
            // A classic project (the Engine's archive deploy is Dind-only) or a
            // project with no application directory: the Engine's archive
            // deploy cannot read an upload there, so refuse before writing
            // anything.
            throw ValidationException::withMessages([
                'filename' => ['This project has no directory an archive deploy can read.'],
            ]);
        }

        $filename = basename(str_replace('\\', '/', Payload::string($params['filename'] ?? null)));
        if (! self::isAllowedArchiveName($filename)) {
            throw ValidationException::withMessages([
                'filename' => [self::ONLY_ARCHIVES],
            ]);
        }

        $this->assertNotRunning($target);

        $client = $target->engine();
        if ($timeout !== null) {
            $client = $client->withTimeout($timeout);
        }
        $api = new ProjectsApi($client);

        try {
            $api->mkdir($target->engineProject(), $dir);
        } catch (EngineException $e) {
            // Folder usually already exists; anything else is a real failure.
            report($e);
        }

        $api->uploadFile($target->engineProject(), $dir, $contents, $filename);

        return ['remote_filepath' => $dir.'/'.$filename];
    }

    /**
     * Delete a staged archive after an Engine refusal that left no task. Public
     * so the onboarding deploy can reuse it. A failed delete must
     * not hide the Engine's refusal.
     */
    public function deleteStagedArchiveIfNoTask(Application $application, ?string $archive, EngineValidationException|EngineException $e): void
    {
        if ($this->refusedWithoutTask($e)) {
            $this->deleteStagedArchive($application, $archive);
        }
    }

    /**
     * Delete the archive a client uploaded to the project's staging folder when
     * v1's own validation refuses the deploy that would have used it: the Engine pre-validated nothing here, so the refused deploy used to
     * leave the archive behind until the next deploy or the project's deletion.
     *
     * Only a path inside the project's archive upload directory is touched; a
     * malformed or foreign path is ignored (the deploy would have refused it too),
     * so a validation failure can never become an arbitrary `files/remove`.
     *
     * @param  mixed  $paths  the raw `remote_filepath` input (a string or a list)
     */
    public function discardRefusedArchive(Application $application, mixed $paths): void
    {
        $dir = $application->archiveUploadDir();
        if ($dir === null) {
            return;
        }

        foreach ($this->candidateArchives($paths, $dir) as $archive) {
            $this->deleteStagedArchive($application, $archive);
        }
    }

    /**
     * The candidate paths of the raw input that live inside the upload directory.
     *
     * @return list<string>
     */
    private function candidateArchives(mixed $paths, string $dir): array
    {
        $values = is_array($paths) ? array_values($paths) : [$paths];
        $archives = [];
        foreach ($values as $value) {
            if (! is_string($value) || $value === '') {
                continue;
            }
            if (str_contains($value, '..') || str_contains($value, "\0")) {
                continue;
            }
            if (! str_starts_with($value, $dir.'/')) {
                continue;
            }
            $archives[] = $value;
        }

        return array_values(array_unique($archives));
    }

    /**
     * Delete a staged archive from the project home. A failed delete must not
     * hide the Engine's refusal.
     */
    private function deleteStagedArchive(Application $application, ?string $archive): void
    {
        if ($archive === null || $archive === '') {
            return;
        }

        try {
            (new FilesApi($application->engine()))->remove($application->engineProject(), $archive);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Whether the Engine refused the request before creating a task: a 422 (the
     * CA's validation error) or another 4xx. A 5xx or a connection error is not
     * proof that no task started, so the archive is left for the watcher.
     */
    private function refusedWithoutTask(EngineValidationException|EngineException $e): bool
    {
        if ($e instanceof EngineValidationException) {
            return true;
        }

        return $e instanceof EngineRequestException
            && $e->engineStatus >= 400
            && $e->engineStatus < 500;
    }

    /**
     * A deploy targeting the staging project of a live one when `deploy_staging`
     * is set, else the project itself (old RedeployStoreRequest::resolveTarget).
     */
    private function resolveTarget(Application $viewed, bool $deployStaging): Application
    {
        if ($viewed->isStaging() || ! $deployStaging) {
            return $viewed;
        }

        $newest = $viewed->stagings()->orderByDesc('id')->first();
        if ($newest === null) {
            throw ValidationException::withMessages([
                'deploy_staging' => ['There is no staging project to deploy to.'],
            ]);
        }

        return $newest;
    }

    /**
     * Which kind of source the project deploys from: `git` when the Engine
     * mirror has a repository, else `files`.
     */
    private function sourceType(Application $app): string
    {
        return $app->gitRepositoryUrl() !== null ? DeployState::SOURCE_GIT : DeployState::SOURCE_FILES;
    }

    /**
     * A git redeploy: switch branch (which itself pulls + rebuilds) when the
     * requested branch differs, else pull the current one (old
     * RedeployInstance::applyGitRedeploy).
     *
     * @param  array<string, mixed>  $params
     * @param  list<string>  $skip  Engine step names to skip
     */
    private function gitRedeploy(ProjectsApi $api, Application $target, array $params, array $skip): \Illuminate\Http\Client\Response
    {
        $branch = Payload::string($params['branch'] ?? null);

        if ($target->gitBranch() !== null && $branch !== $target->gitBranch()) {
            return $api->gitChangeBranch($target->engineProject(), $branch, null, $skip);
        }

        $strategy = Payload::nullableString($params['strategy'] ?? null);

        return $api->gitPull($target->engineProject(), $strategy === null ? [] : ['strategy' => $strategy], $skip);
    }

    /**
     * The Engine `skip` list for the requested panel categories; empty when
     * nothing is skipped. A category the target does not announce as skippable
     * is a 422 `deploy_skip_unsupported`.
     *
     * @param  array<string, mixed>  $params
     * @return list<string>
     *
     * @throws ValidationException
     */
    private function engineSkip(Application $target, array $params): array
    {
        $requested = array_values(array_unique(Payload::strings($params['skip'] ?? null)));
        if ($requested === []) {
            return [];
        }

        $steps = Payload::object(Payload::object($this->sourceReport->fresh($target))['deploy_steps'] ?? null);
        $unsupported = array_values(array_filter(
            $requested,
            static fn (string $category): bool => (Payload::object($steps[$category] ?? null)['skippable'] ?? false) !== true,
        ));
        if ($unsupported !== []) {
            $message = 'This project cannot skip: '.implode(', ', $unsupported).'.';

            $exception = ValidationException::withMessages(['skip' => [$message]]);
            // The CA reads `error_code` (Api.getErrorCode).
            $exception->response = response()->json([
                'message' => $message,
                'errors' => ['skip' => [$message]],
                'error_code' => 'deploy_skip_unsupported',
            ], 422);

            throw $exception;
        }

        return DeploySkip::toEngine($requested);
    }

    /**
     * The 202 Task id, when the Engine answered with one (0.0 when absent).
     *
     * @param  \Illuminate\Http\Client\Response  $response
     */
    private function taskIdOf($response): ?int
    {
        return Payload::int($response->json('data.id'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function requiredBranch(array $params): string
    {
        $branch = trim(Payload::string($params['branch'] ?? null));
        if ($branch === '') {
            throw ValidationException::withMessages([
                'branch' => ['A branch is required to redeploy from git.'],
            ]);
        }

        return $branch;
    }

    /**
     * The home-relative archive path a files redeploy uses, validated before it
     * reaches the Engine (which re-checks with realpath).
     *
     * @param  array<string, mixed>  $params
     */
    private function archivePath(array $params): string
    {
        $archive = Payload::string($params['remote_filepath'] ?? null);
        if (trim($archive) === '') {
            throw ValidationException::withMessages([
                'remote_filepath' => ['An uploaded archive path is required to redeploy from files.'],
            ]);
        }

        if ($this->pathEscapesHome($archive)) {
            throw ValidationException::withMessages([
                'remote_filepath' => ['The archive path is invalid.'],
            ]);
        }

        if (! self::isAllowedArchiveName(basename($archive))) {
            throw ValidationException::withMessages([
                'remote_filepath' => [self::ONLY_ARCHIVES],
            ]);
        }

        return $archive;
    }

    public const ONLY_ARCHIVES = 'Only .zip and .tar.gz archives are supported.';

    /**
     * Only the archive types the Engine can deploy (old FilesArchive).
     */
    public static function isAllowedArchiveName(string $filename): bool
    {
        $base = strtolower($filename);
        if ($base === '' || str_contains($base, '..')) {
            return false;
        }

        return str_ends_with($base, '.zip') || str_ends_with($base, '.tar.gz');
    }

    /**
     * Reject paths that try to leave the project home before the Engine ever
     * sees them (the Engine re-checks with realpath).
     */
    private function pathEscapesHome(string $path): bool
    {
        if (str_contains($path, '..') || str_contains($path, "\0")) {
            return true;
        }

        return ! str_starts_with($path, '/') && ! preg_match('#^[A-Za-z0-9._/-]+$#', $path);
    }

    /**
     * Deploy-log/deploy-cancel/rebuild are container-only on the Engine; refuse
     * a classic project here instead of retrying a 403.
     */
    private function assertContainer(Application $application): void
    {
        if (! $application->isContainer()) {
            throw ValidationException::withMessages([
                'deploy' => ['Deploys are only available for container projects.'],
            ]);
        }
    }

    /**
     * 409 while the Engine runs another deploy of the project – the old panel
     * refused a second deploy until the first finished (the Engine's newest
     * deploy; deploys started outside the panel count too).
     */
    private function assertNotRunning(Application $target): void
    {
        if ($this->state->isDeployRunning($target)) {
            throw new EngineRequestException(409, 'A deploy of this project is already running.');
        }
    }
}
