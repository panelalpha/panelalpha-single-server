<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * Files-source onboarding: the domain step already created
 * the DinD project, so the CA uploads its archive into that project and starts
 * the install deploy. The upload answers the home-relative `remote_filepath`
 * the deploy expects; the deploy follows the accepted install with the
 * `installation_*` notifications the CA waits for (`DeployState::follow()`).
 *
 * Git-source onboarding: the domain step already created
 * the container project, so the CA attaches the repository with
 * `POST /projects/{u}/source` and the source rebuild is watched like any other
 * install. The `POST /projects/deploy` answer keeps the old InstanceResource
 * shape (the project), while the followed install carries the
 * `installation_*` notifications the CA waits for.
 */
final class OnboardingDeployService
{
    /**
     * Extra seconds over two Engine call timeouts before the deploy lock expires.
     */
    public const DEPLOY_LOCK_MARGIN_SECONDS = 30;

    private const NOTIFY_FINISHED = 'user.instance.installation_finished';

    private const NOTIFY_FAILED = 'user.instance.installation_failed';

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly DeployService $deploys,
        private readonly HostGuard $hosts,
        private readonly ApplicationProvisioner $provisioner,
        private readonly GitSourceAttacher $attacher,
        private readonly DeployState $deployState,
    ) {}

    /**
     * The per-application lock key that refuses a second concurrent onboarding
     * deploy. Public so a test can hold the lock
     * and prove the refusal.
     */
    public static function deployLockKey(int $applicationId): string
    {
        return "user-application:onboarding-deploy:{$applicationId}";
    }

    /**
     * The deploy lock TTL: the Engine `files/exists` check and the
     * `deploy-archive` call each get `engine_timeout`, so the lock must outlast
     * both with a margin – otherwise it could expire mid-call and let a second
     * deploy in.
     */
    public static function deployLockSeconds(): int
    {
        return 2 * (Payload::int(config('client-area.engine_timeout')) ?? 0) + self::DEPLOY_LOCK_MARGIN_SECONDS;
    }

    /**
     * Upload the raw request body into the bound project (Engine files/upload).
     *
     * @param  array<string, mixed>  $params  validated UploadFilesRequest body
     * @param  resource|string  $contents  the raw request body
     * @return array{remote_filepath: string}
     */
    public function uploadFiles(Authenticatable $user, array $params, $contents): array
    {
        $application = $this->applications->findForUser($user, Payload::int($params['domain_id'] ?? null) ?? 0);
        $this->assertStillOnboarding($application);

        // Reuse the redeploy upload: it sanitises the filename, confines the
        // write to the project home and returns the same `{remote_filepath}`.
        // The CA may send a large archive, so the upload gets the long Engine
        // timeout.
        return $this->deploys->uploadArchive(
            $application,
            ['filename' => Payload::string($params['filename'] ?? null)],
            $contents,
            EngineClient::LONG_TIMEOUT_SECONDS,
        );
    }

    /**
     * Start the install deploy of a files-source project.
     *
     * @param  array<string, mixed>  $params  validated ProjectDeployRequest body (the controller
     *                                        routes a git `source_type` to {@see self::deployFromGit})
     * @return Application the project, to present in the old InstanceResource shape
     *
     * @throws ValidationException a missing or foreign archive
     */
    public function deployFromFiles(Authenticatable $user, array $params): Application
    {
        $application = $this->applications->findForUser($user, Payload::int($params['domain_id'] ?? null) ?? 0);
        $this->assertStillOnboarding($application);

        // One deploy per application at a time: a second concurrent onboarding
        // deploy would start a second watcher and a second Engine rebuild. The
        // TTL outlasts the two Engine calls the lock covers.
        $lock = Cache::lock(self::deployLockKey($application->id), self::deployLockSeconds());
        if (! $lock->get()) {
            throw ValidationException::withMessages([
                'domain_id' => ['A deploy is already starting for this project. Try again in a moment.'],
            ]);
        }

        try {
            // The pre-lock row can be stale: a deploy that held the lock just
            // before this request may have cleared the marker. Re-read it now
            // that the lock is ours.
            $application = $application->refresh();
            $this->assertStillOnboarding($application);

            $archive = $this->archivePath($application, $params);
            $this->assertReceived($application, $archive);

            try {
                $response = (new ProjectsApi($application->engine()))->deployArchive(
                    $application->engineProject(),
                    $archive,
                    self::envVars($params['env_vars'] ?? null),
                );
            } catch (EngineValidationException|EngineException $e) {
                // A refused deploy (Engine 4xx, no task) leaves no watcher to
                // delete the archive; the 422's message is sanitised on the way
                // out.
                $this->deploys->deleteStagedArchiveIfNoTask($application, $archive, $e);

                throw $e;
            }

            // The watcher starts once the marker clear commits.
            $this->recordAcceptedDeploy($application, $response, $archive);
        } finally {
            $lock->release();
        }

        return $application;
    }

    /**
     * Start a git-source onboarding.
     *
     * The CA's default git path has no domain step
     * (`OnboardingModalWrapper.vue:533`), so `POST /projects/deploy` creates the
     * container project with the repository in **one** Engine call and follows
     * its create task like the files deploy. When the CA does send a
     * `domain_id` (`OnboardingModalWrapper.vue:612-624`), the repository is
     * attached to that container project with `POST /projects/{u}/source`; if
     * the domain-step create task is still preparing, the Engine answers its
     * busy 409 and the attach job (`AttachGitSourceJob`) retries the attach
     * so the CA gets the old-style accepted answer and never the busy 409.
     *
     * @param  array<string, mixed>  $params  validated ProjectDeployRequest body
     * @return Application the project, to present in the old InstanceResource shape
     *
     * @throws ValidationException a missing/invalid repository or a foreign project
     */
    public function deployFromGit(Authenticatable $user, array $params): Application
    {
        $repoUrl = Payload::nullableString($params['repo_url'] ?? null);
        if ($repoUrl === null || $repoUrl === '') {
            throw ValidationException::withMessages(['repo_url' => ['The repository URL is required.']]);
        }

        // The Engine clones a user URL: guard the host and send a canonical URL
        // (the raw string never crosses).
        $parsed = RepositoryUrl::parse($repoUrl);
        if ($parsed === null) {
            throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
        }
        $this->hosts->assertAllowed($parsed['host']);

        /** @var array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>} $source */
        $source = [
            'git_repo' => $parsed['canonical'],
            'git_branch' => Payload::nullableString($params['branch'] ?? null),
            'git_token' => Payload::nullableString($params['token'] ?? null),
            'env_vars' => self::envVars($params['env_vars'] ?? null),
        ];

        $domainId = Payload::int($params['domain_id'] ?? null);
        if ($domainId === null || $domainId <= 0) {
            return $this->createGitProject($user, $source, Payload::int($params['service_id'] ?? null));
        }

        return $this->attachGitSource($user, $source, $domainId);
    }

    /**
     * The CA's default git path: create the container project with the
     * repository in one `POST /projects` (`template: dind` + `git_repo`). The
     * create task is followed by the deploy watcher, so the CA reads the old
     * accepted answer and `installation_*` when it ends.
     *
     * @param  array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>}  $source
     * @param  int|null  $serviceId  the hosting service the project joins (the request's checked `service_id`)
     */
    private function createGitProject(Authenticatable $user, array $source, ?int $serviceId): Application
    {
        $result = $this->provisioner->provision($user, new ProvisionRequest(
            template: 'dind',
            gitRepo: $source['git_repo'],
            gitBranch: $source['git_branch'],
            gitToken: $source['git_token'],
            envVars: $source['env_vars'],
            serviceId: $serviceId,
        ));

        GitSourceRecord::store($result->application, $source['git_repo'], $source['git_token']);
        $this->recordAcceptedGitDeploy($result->application, $result->taskId);

        return $result->application;
    }

    /**
     * Start the git onboarding of a project the CA already named with a
     * `domain_id`.
     *
     * The per-application deploy lock is held around the attach; a project
     * already following a git install answers the same accepted state,
     * and the {@see GitSourceAttacher} seam decides between the plain
     * `POST source` and the classic-onboarding replacement.
     *
     * @param  array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>}  $source
     *
     * @throws ValidationException a foreign project, a concurrent deploy or a
     *                             project that cannot take a git source
     */
    private function attachGitSource(Authenticatable $user, array $source, int $domainId): Application
    {
        $application = $this->applications->findForUser($user, $domainId);

        // One deploy per application at a time, like the files step: the lock
        // covers the source attach call and the row write.
        $lock = Cache::lock(self::deployLockKey($application->id), self::deployLockSeconds());
        if (! $lock->get()) {
            throw ValidationException::withMessages([
                'domain_id' => ['A deploy is already starting for this project. Try again in a moment.'],
            ]);
        }

        try {
            $application = $application->refresh();

            // A git install the Engine lists (running or succeeded) means this
            // onboarding was already accepted; answer the same accepted state
            // without another Engine attach (read from the Engine's deploys).
            if ($this->deployState->hasGitInstall($application)) {
                return $application;
            }

            $result = $this->attacher->attach($application, $source, self::NOTIFY_FINISHED, self::NOTIFY_FAILED);
        } finally {
            $lock->release();
        }

        if ($result->accepted) {
            GitSourceRecord::store($application, $source['git_repo'], $source['git_token']);
            $this->recordAcceptedGitDeploy($application, $result->taskId);
        }

        return $application;
    }

    /**
     * Follow the accepted git attach as an install, with the `installation_*`
     * notifications the CA waits for (no panel row).
     */
    private function recordAcceptedGitDeploy(Application $application, ?int $taskId): void
    {
        $this->deployState->follow($application, $taskId, new DeployWatch(self::NOTIFY_FINISHED, self::NOTIFY_FAILED), DeployState::SOURCE_GIT);
    }

    /**
     * Leave files onboarding and follow the accepted deploy: the marker clear and
     * the watcher are one transaction (the watcher starts after commit), so a
     * failed clear keeps the project in onboarding and the CA can retry.
     * On a failed clear the error is reported and the deploy is still
     * followed, so the CA spinner ends.
     */
    private function recordAcceptedDeploy(Application $application, Response $response, string $archive): void
    {
        $watch = new DeployWatch(self::NOTIFY_FINISHED, self::NOTIFY_FAILED, $archive);

        try {
            DB::transaction(function () use ($application, $response, $watch): void {
                // The first accepted deploy leaves files onboarding.
                $application->forceFill(['onboarding_files_at' => null])->save();
                $this->deployState->follow($application, $this->taskIdOf($response), $watch, DeployState::SOURCE_FILES);
            });
        } catch (Throwable $e) {
            report($e);

            $this->deployState->follow($application, $this->taskIdOf($response), $watch, DeployState::SOURCE_FILES);
        }
    }

    /**
     * Onboarding upload/deploy act only on a project still in **files**
     * onboarding – one the domain step marked after the Engine create task
     * finished. The old "no install
     * row" test matched every live git/WordPress/staging project (only files
     * onboarding and retry-install write install rows), so onboarding work could
     * flip a live site's installation state. Every other
     * project goes through `/projects/{id}/deploy/upload` + `redeploy` with
     * `general.redeploy`.
     *
     * A project the repository hides never reaches this method: `findForUser()`
     * throws a 404 first (the "cannot see" case).
     *
     * @throws ValidationException  when the project is not in files onboarding;
     *                              keyed `domain_id`, the field the old onboarding
     *                              routes reported the project under
     */
    private function assertStillOnboarding(Application $application): void
    {
        if ($application->onboarding_files_at === null) {
            throw ValidationException::withMessages([
                'domain_id' => ['This project is not in files onboarding. Use the project deploy instead.'],
            ]);
        }
    }

    /**
     * The one archive path the deploy uses. The old panel supported a single
     * archive (`DeployInstance`: "only single file currently supported") and it
     * had to come from the upload folder, so an arbitrary project file cannot be
     * deployed.
     *
     * @param  array<string, mixed>  $params
     */
    private function archivePath(Application $application, array $params): string
    {
        $paths = self::archivePaths($params['remote_filepath'] ?? null);

        if (count($paths) !== 1) {
            throw ValidationException::withMessages([
                'remote_filepath' => ['Exactly one uploaded archive is required to deploy from files.'],
            ]);
        }

        $dir = $application->archiveUploadDir();
        $archive = $paths[0];
        if ($dir === null || ! str_starts_with($archive, $dir.'/') || str_contains($archive, '..') || str_contains($archive, "\0")) {
            throw ValidationException::withMessages([
                'remote_filepath' => ['The archive path is invalid.'],
            ]);
        }

        if (! DeployService::isAllowedArchiveName(basename($archive))) {
            throw ValidationException::withMessages([
                'remote_filepath' => [DeployService::ONLY_ARCHIVES],
            ]);
        }

        return $archive;
    }

    /**
     * The non-empty archive paths of an uploaded-archives list.
     *
     * @return list<string>
     */
    private static function archivePaths(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $paths = [];
        foreach (Payload::strings($value) as $path) {
            if (trim($path) !== '') {
                $paths[] = $path;
            }
        }

        return $paths;
    }

    /**
     * The archive must be one this project received: it exists in the bound
     * project's home (the upload put it there). A failed existence check is not
     * treated as absent.
     */
    private function assertReceived(Application $application, string $archive): void
    {
        $data = (new FilesApi($application->engine()))->exists($application->engineProject(), $archive);

        if ($data['exists'] !== true) {
            throw ValidationException::withMessages([
                'remote_filepath' => ['The archive has not been uploaded to this project.'],
            ]);
        }
    }

    /**
     * The Engine `env_vars` map as string values (documented shape).
     *
     * @return array<string, string|null>
     */
    private static function envVars(mixed $value): array
    {
        $vars = [];
        $object = Payload::object($value);
        foreach (array_keys($object) as $key) {
            $vars[$key] = Payload::nullableString($object[$key]);
        }

        return $vars;
    }

    /**
     * The Engine 202 Task id, when present.
     */
    private function taskIdOf(Response $response): ?int
    {
        return Payload::int($response->json('data.id'));
    }
}
