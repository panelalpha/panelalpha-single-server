<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Git\Providers\ProviderFactory;
use PanelAlpha\ClientArea\Git\Providers\TokenRefusedException;
use PanelAlpha\ClientArea\Git\ProviderTarget;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Http\Presenters\GitPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Provisioning\ProvisionWaiter;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * The Git page of a project. Every Engine call goes to
 * the native `E:/git/*` endpoints through ProjectsApi; the panel stores the
 * little the Engine does not keep (last deployed commit).
 */
final class GitService
{
    /**
     * Old `api/messages.git_webhook_registration_failed` text; the old panel
     * raised it with `ValidationException::withMessages([...])`, so key `0`.
     */
    public const WEBHOOK_REGISTRATION_FAILED = 'Could not register a webhook with the Git provider. Check that your token can manage webhooks for this repository.';

    /**
     * Old `api/messages.git_nothing_to_push`; the CA shows the message of a
     * skipped operation in the git log (`GitLogsTable.vue:347`). v1 records a
     * nothing-to-push push as `skipped`, which the old panel marked success –
     * so the old text must ride on it.
     */
    public const PUSH_NOTHING_MESSAGE = 'There are no file changes on this site to send to the repository.';

    /**
     * Old `api/messages.git_already_up_to_date`; the old `GitAutoDeploy` job's
     * `markSkipped` message for an auto-deploy that queued nothing.
     */
    public const ALREADY_UP_TO_DATE_MESSAGE = 'The site is already up to date with the repository. Nothing to deploy.';

    /** The Engine's fast-forward pull (`WorkTree::STRATEGY_FF`), which keeps local changes. */
    private const STRATEGY_FF = 'ff';

    /**
     * The token check before a credentials update:
     * the repository refused the token, or could not be reached to ask it.
     */
    public const TOKEN_REFUSED_MESSAGE = 'The repository refused this token. Check the token and that it can read this repository.';

    public const TOKEN_UNCHECKED_MESSAGE = 'The repository could not be reached to check the token. Try again later.';

    /**
     * A recorded repository address the panel cannot parse: it is never sent
     * to the Engine, so the token cannot be checked. Not a passing failure, so
     * no "try again later".
     */
    public const TOKEN_ADDRESS_UNREADABLE_MESSAGE = 'The panel cannot check a token against this project\'s repository address, so the token was not saved.';

    /**
     * The Engine found no repository at the address (`SourceRefsController.php:109`
     * -> `problems[].code: repository_not_found`). A forge does not admit that a
     * private repository exists to a caller it has not authenticated, so "not
     * found" also covers a token without access to it (`GitRemoteProbe.php:418`);
     * the text asks for both.
     */
    public const TOKEN_REPOSITORY_NOT_FOUND_MESSAGE = 'The repository was not found. Check the repository address and that the token can read it if the repository is private.';

    /**
     * The Engine refuses to fetch from the address at all
     * (`RepositoryAddress.php:20-40` through `SourceRefsController.php:97-103`,
     * `problems[].code: host_refused` – an internal or unresolvable
     * host), so the token was never tried.
     */
    public const TOKEN_ADDRESS_REFUSED_MESSAGE = 'The repository address is not allowed. Check the repository address; the token was not tested.';

    /** The Client Area's sentence for a required Access token. */
    public const ACCESS_TOKEN_REQUIRED_MESSAGE = 'Access token is required';

    /** The Engine's `git_repository_unreachable` sentence, for a branch read that gets no answer. */
    public const REPOSITORY_UNREACHABLE_MESSAGE = 'Could not reach %s, so the repository cannot be read and nothing was connected. Check the address, and that this server can reach it.';

    /** A repository with no branch yet: the Engine would refuse the connect on a field the form does not have. */
    public const REPOSITORY_EMPTY_MESSAGE = 'The repository has no branch to connect yet. Push a commit to it first, then connect again.';

    /**
     * The Engine's `git/connect` refuses a repository it cannot read with a
     * `problems[].code`, and the CA answers the case the token check already
     * has a sentence for in the same words. The Engine's other codes keep its
     * own text, which names what to change (the host it could not reach, git's
     * reason).
     *
     * @var array<string, array{0: string, 1: string}>  code => [field, message]
     */
    private const CONNECT_REFUSALS = [
        'git_token_refused' => ['token', self::TOKEN_REFUSED_MESSAGE],
        'git_repository_not_found' => ['repo_url', self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE],
    ];

    /**
     * git's own words for a credential the remote refused (`WorkTree::failure()`
     * on a 400, before the Engine named the cause in `problems[].code`).
     */
    private const AUTHENTICATION_OUTPUT = '/askpass|could not read (?:Username|Password)|authentication failed|terminal prompts disabled|http basic: access denied|invalid username or (?:password|token)|permission denied \(publickey/i';

    /**
     * The Engine's `source/inspect` answer for a repository it cannot read
     * (`SourceResolver::cloneRepository()`, `InspectException::toProblem()`).
     * A private repository and a missing one answer it alike.
     */
    private const SOURCE_UNREADABLE = 'source_unreadable';

    public function __construct(
        private readonly HostGuard $hosts,
        private readonly GitPresenter $presenter,
        private readonly GitOperationRecorder $operations,
        private readonly GitAutoDeployHooks $autoDeploy,
        private readonly DeployState $deploys,
        private readonly ProvisionWaiter $waiter,
        private readonly ProviderFactory $providers,
    ) {}

    /**
     * @return array<string, mixed>  the CA git payload
     */
    public function show(Application $application): array
    {
        $api = new ProjectsApi($application->engine());

        // Degrade only on absence (no git repository): an unreachable Engine
        // must bubble, not look like "not connected".
        $status = [];
        try {
            $status = $api->gitStatus($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }
        }

        $hook = [];
        if (($status['connected'] ?? false) === true) {
            try {
                $hook = $api->showDeployHook($application->engineProject());
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
            }
        }

        return $this->presenter->present($application, $status, $hook);
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function connect(Application $application, array $params): array
    {
        // Guard the host and send the Engine a URL rebuilt from parsed parts
        // – never the raw user string.
        $canonical = null;
        $repoUrl = Payload::string($params['repo_url'] ?? null);
        if ($repoUrl === '' && isset($params['git_repository_id'])) {
            // Reuse the repository already recorded for this project or its
            // pair (the CA sends the pair's `git_repository_id`).
            $repoUrl = (string) ($this->reuseRepositoryUrl($application) ?? '');
            if ($repoUrl === '') {
                throw ValidationException::withMessages([
                    'repo_url' => ['The repository is not available any more.'],
                ]);
            }
        }
        if ($repoUrl !== '') {
            $parsed = RepositoryUrl::parse($repoUrl);
            if ($parsed === null) {
                throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
            }
            $this->hosts->assertAllowed($parsed['host']);
            $canonical = $parsed['canonical'];
        }

        $ssh = $canonical !== null && RepositoryUrl::isSsh($canonical);
        $repair = ($params['repair'] ?? false) === true;

        // An SSH repository is reached with the project's deploy key: no token.
        $token = $ssh ? null : Payload::nullableString($params['token'] ?? null);
        if (! $ssh && self::asksForToken($params) && self::isBlank($token)) {
            throw ValidationException::withMessages(['token' => [self::ACCESS_TOKEN_REQUIRED_MESSAGE]]);
        }

        // The Engine's clone reads a public repository anonymously and accepts any token.
        if ($token !== null && $token !== '' && $canonical !== null) {
            $this->assertProviderAcceptsToken($canonical, $token);
        }

        // The Engine requires a `branch`; the CA does not always send one, so
        // default it from the mirror or `POST source/inspect`.
        // Over SSH `source/inspect` cannot read the repository: the branch
        // comes from the request or the mirror.
        $branch = trim(Payload::string($params['branch'] ?? null));
        if ($branch === '') {
            $branch = $ssh
                ? (string) ($application->gitBranch() ?? '')
                : (string) ($application->gitBranch()
                    ?? $this->inspectBranch($application, $canonical, $token, ! $repair)
                    ?? '');
        }
        if ($ssh && ! $repair && $branch === '') {
            throw ValidationException::withMessages(['branch' => ['Enter the branch to deploy.']]);
        }

        $payload = array_filter([
            'repo_url' => $canonical,
            'branch' => $branch !== '' ? $branch : null,
            'token' => $token,
            'auth_type' => $ssh ? null : ($params['auth_type'] ?? null),
            'repair' => $repair ? true : null,
        ], static fn ($v) => $v !== null && $v !== '');

        // The Engine clones inside this call, up to its own clone budget.
        $engine = $application->engine()->withTimeout(EngineClient::LONG_TIMEOUT_SECONDS);

        if ($ssh) {
            // A busy 409 may make the connect wait for the create task: the
            // budget runs from the request start.
            $deadline = now()->getTimestamp() + EngineClient::LONG_TIMEOUT_SECONDS;
            [$application, $connected] = $this->connectSsh($engine, $application, $payload, $deadline);
        } else {
            $connected = $this->connectHttps($engine, $application, $payload);
            if (! $repair) {
                $this->refuseAnEmptyCheckout($application, $connected);
            }
        }

        // A repair re-adopts the existing checkout: keep the panel's record of
        // what it last deployed and the provider token. A fresh connect starts
        // the deploy record over, but a public repository has no token to keep
        // (the token is stored encrypted, never sent to the CA).
        $provider = $canonical !== null ? RepositoryUrl::provider($canonical) : null;
        $wasConnected = $application->gitRepositoryUrl() !== null;

        $application->forceFill([
            'git_source' => $canonical,
            'git_provider' => $repair && $application->git_provider !== null
                ? $application->git_provider
                : $provider,
            'git_token' => $repair
                ? $application->gitToken()
                : $token,
            'git_last_commit_hash' => $repair ? $application->git_last_commit_hash : null,
            'git_last_commit_message' => $repair ? $application->git_last_commit_message : null,
            'git_last_commit_at' => $repair ? $application->git_last_commit_at : null,
        ])->save();

        // The Engine connect performs the initial clone; the recorder logs it
        // (only the first connect is a clone – a repair or a reconnect is not).
        if (! $repair && ! $wasConnected) {
            $this->operations->recordClone($application);
        }

        $result = $this->show($application);

        // The connect itself worked, but the Engine could not fetch the branch
        // (it answers 200 + `sync_error` after a good SSH probe): the checkout
        // is empty and the customer has to pick another branch.
        if ($ssh && Payload::string($connected['sync_error'] ?? null) !== '') {
            $result['branch_missing'] = true;
        }

        return $result;
    }

    /**
     * A fresh checkout whose fetch failed is undone and refused, not connected.
     *
     * @param  array<string, mixed>  $connected  the Engine `data`
     *
     * @throws ValidationException
     */
    private function refuseAnEmptyCheckout(Application $application, array $connected): void
    {
        if (Payload::string($connected['sync_error'] ?? null) === '') {
            return;
        }

        Log::warning('Git connect left the checkout empty.', [
            'project' => $application->engine_username,
            'message' => Payload::string($connected['sync_error'] ?? null),
        ]);

        $this->undoConnect($application);

        throw ValidationException::withMessages(['repo_url' => [self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE]]);
    }

    /** Best-effort: the Engine stored a connection the panel refuses, so it goes again. */
    private function undoConnect(Application $application): void
    {
        try {
            (new ProjectsApi($application->engine()))->gitDisconnect($application->engineProject());
        } catch (Throwable $e) {
            Log::warning('Undoing a Git connect that fetched nothing failed.', [
                'project' => $application->engine_username,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Engine connect for an HTTPS repository. The Engine refuses a repository
     * it cannot read with a 422 whose `problems[].code` names the cause, and an
     * Engine before those codes with a 400 whose message is git's own stderr –
     * neither is what the customer should read.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>  the Engine `data`
     *
     * @throws ValidationException
     */
    private function connectHttps(EngineClient $engine, Application $application, array $payload): array
    {
        try {
            return (new ProjectsApi($engine))->gitConnect($application->engineProject(), $payload);
        } catch (EngineValidationException $e) {
            foreach ($e->problems as $problem) {
                $refusal = self::CONNECT_REFUSALS[Payload::string($problem['code'] ?? null)] ?? null;
                if ($refusal !== null) {
                    throw ValidationException::withMessages([$refusal[0] => [$refusal[1]]]);
                }
            }

            throw $e;
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            $message = $e->engineMessage ?? $e->getMessage();
            Log::warning('Git connect failed.', [
                'engine_status' => $e->engineStatus,
                'message' => $message,
            ]);

            throw ValidationException::withMessages(
                preg_match(self::AUTHENTICATION_OUTPUT, $message) === 1
                    ? ['token' => [self::TOKEN_REFUSED_MESSAGE]]
                    : ['repo_url' => [self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE]],
            );
        }
    }

    /**
     * Engine connect for an SSH repository. While the create task of a project
     * the wizard just made still runs the Engine answers a busy 409 with the
     * task id: wait for it and retry once. Engine refusals become one of two
     * user-safe sentences on `repo_url`.
     *
     * @param  array<string, mixed>  $payload
     * @param  int  $deadline  unix time the create-task wait must end by
     * @return array{0: Application, 1: array<string, mixed>}  the (re-mirrored) application and the Engine `data`
     *
     * @throws ValidationException
     */
    private function connectSsh(EngineClient $engine, Application $application, array $payload, int $deadline): array
    {
        try {
            try {
                $connected = (new ProjectsApi($engine))->gitConnect($application->engineProject(), $payload);
            } catch (EngineRequestException $e) {
                $taskId = $this->busyTaskId($application, $e);
                if ($taskId === null) {
                    throw $e;
                }

                $application = $this->waiter->waitForTask($application, $taskId, $deadline);
                $connected = (new ProjectsApi($engine))->gitConnect($application->engineProject(), $payload);
            }
        } catch (EngineValidationException $e) {
            /** @var list<string> $codes */
            $codes = array_values(array_filter(array_map(
                static fn (array $problem): mixed => $problem['code'] ?? null,
                $e->problems,
            ), 'is_string'));
            $code = Payload::nullableString($e->response?->json('code'));
            if ($code !== null) {
                $codes[] = $code;
            }

            // The panel's own refusal of an internal address keeps its text.
            if (in_array('host_refused', $codes, true)) {
                throw $e;
            }

            throw $this->sshFailure($codes);
        } catch (EngineRequestException $e) {
            // 404 (project gone), the busy 409 and 5xx keep their handling.
            if ($e->engineStatus !== 400) {
                throw $e;
            }

            /** @var list<string> $codes */
            $codes = array_values(array_filter(array_merge(
                [$e->engineCode],
                array_map(static fn (array $problem): mixed => $problem['code'] ?? null, $e->problems),
            ), 'is_string'));

            throw $this->sshFailure($codes);
        }

        return [$application, $connected];
    }

    /**
     * The Engine create task a busy 409 names, when this project is still
     * `pending` (just created by the wizard); null for every other 409.
     */
    private function busyTaskId(Application $application, EngineRequestException $e): ?int
    {
        if ($e->engineStatus !== 409 || $application->status !== 'pending') {
            return null;
        }

        $taskId = Payload::int($e->response?->json('task_id') ?? $e->response?->json('data.task_id'));

        return $taskId !== null && $taskId > 0 ? $taskId : null;
    }

    /**
     * @param  list<string>  $codes  Engine error codes of the refusal
     */
    private function sshFailure(array $codes): ValidationException
    {
        return ValidationException::withMessages([
            'repo_url' => [in_array('git_ssh_key_refused', $codes, true)
                ? EngineText::SSH_KEY_REFUSED
                : EngineText::SSH_CONNECT_FAILED],
        ]);
    }

    /**
     * The repository URL of this project or of its pair (parent/staging), as
     * the Engine mirror records it – the panel-side stand-in for the old
     * shared `git_repository` row.
     */
    private function reuseRepositoryUrl(Application $application): ?string
    {
        $pair = $application->isStaging()
            ? $application->stagingOf
            : $application->stagings()->latest('id')->first();

        foreach ([$application, $pair] as $candidate) {
            if ($candidate instanceof Application) {
                $url = $candidate->gitRepositoryUrl();
                if ($url !== null) {
                    return $url;
                }
            }
        }

        return null;
    }

    /**
     * The branch a repository reports (Engine `POST source/inspect` →
     * `source.git.branch`), or null when the Engine cannot read it.
     *
     * A source the Engine cannot read (`problems[].code: source_unreadable`) is
     * the CA's own refusal, as `git/connect` answers it – the Engine's sentence
     * instructs the API caller ("Pass git_token to read a private HTTPS
     * repository"). Any other 422, such as a truncated token, names what to
     * change and stays the Engine's. An address the Engine cannot read at all
     * (no answer in time) is the unreachable sentence, and the connect is not
     * attempted. A read that names no branch is the empty-repository sentence
     * when the connect needs one (`$branchRequired`; a repair does not).
     *
     * @throws ValidationException
     */
    private function inspectBranch(Application $application, ?string $repoUrl, ?string $token, bool $branchRequired): ?string
    {
        if ($repoUrl === null || $repoUrl === '') {
            return null;
        }

        try {
            /** @var array{source: string, type?: string, branch?: string, subdirectory?: string, git_token?: string} $source */
            $source = array_filter([
                'source' => $repoUrl,
                'type' => 'git',
                'git_token' => $token,
            ], static fn ($v) => $v !== null && $v !== '');
            $report = (new ProjectsApi($application->engine()))->inspectSource($source);
        } catch (EngineValidationException $e) {
            foreach ($e->problems as $problem) {
                if (Payload::nullableString($problem['code'] ?? null) !== self::SOURCE_UNREADABLE) {
                    continue;
                }

                throw ValidationException::withMessages($token !== null && $token !== ''
                    ? ['token' => [self::TOKEN_REFUSED_MESSAGE]]
                    : ['repo_url' => [self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE]]);
            }

            throw $e;
        } catch (EngineUnavailableException $e) {
            Log::warning('Git source read failed.', [
                'message' => $e->getMessage(),
            ]);

            $host = RepositoryUrl::parse($repoUrl)['host'] ?? '';

            throw ValidationException::withMessages([
                'repo_url' => [sprintf(self::REPOSITORY_UNREACHABLE_MESSAGE, $host !== '' ? $host : 'the repository host')],
            ]);
        } catch (EngineException $e) {
            return null;
        }

        $git = Payload::object(Payload::object($report['source'] ?? null)['git'] ?? null);
        $branch = Payload::nullableString($git['branch'] ?? null);
        if ($branch !== null && $branch !== '') {
            return $branch;
        }

        if ($branchRequired) {
            throw ValidationException::withMessages(['repo_url' => [self::REPOSITORY_EMPTY_MESSAGE]]);
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function disconnect(Application $application): array
    {
        try {
            (new ProjectsApi($application->engine()))->gitDisconnect($application->engineProject());
        } catch (EngineRequestException $e) {
            // Already disconnected is absence; any other failure must not clear
            // the local mirror.
            if ($e->engineStatus !== 404) {
                throw $e;
            }
        }

        // The provider webhook is ours to remove; the Engine's gitDisconnect
        // removes the Engine hook. Then clear the local state, but only after
        // the Engine accepted (or there was nothing to disconnect).
        $this->autoDeploy->deleteProviderWebhook($application);

        $application->forceFill([
            'git_source' => null,
            'git_last_commit_hash' => null,
            'git_last_commit_message' => null,
            'git_last_commit_at' => null,
            'git_provider' => null,
            'git_token' => null,
            'git_webhook_id' => null,
        ])->save();

        return $this->show($application);
    }

    /**
     * @return array<string, mixed>
     */
    public function repair(Application $application): array
    {
        $repoUrl = $application->gitRepositoryUrl();
        if ($repoUrl === null) {
            throw ValidationException::withMessages([
                'repo_url' => ['The repository is not available any more.'],
            ]);
        }

        return $this->connect($application, ['repo_url' => $repoUrl, 'repair' => true]);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function pull(Application $application, array $params): void
    {
        $strategy = Payload::nullableString($params['strategy'] ?? null);

        // The Engine's fast-forward answers 200 and keeps local changes.
        if ($strategy === null || $strategy === self::STRATEGY_FF) {
            $this->assertCleanWorkingTree($application);
        }

        $this->operations->record($application, GitOperationRecorder::ACTION_PULL, function () use ($application, $strategy): Response {
            try {
                return (new ProjectsApi($application->engine()))
                    ->gitPull($application->engineProject(), $strategy === null ? [] : ['strategy' => $strategy]);
            } catch (EngineRequestException $e) {
                throw $this->operationFailure($e, 'pull');
            }
        });
    }

    /**
     * `git log` of a branch the checkout has not fetched: the Engine answers
     * `fatal: ambiguous argument '<branch>': unknown revision …` (the branch
     * list reads the remote, the checkout fetches one branch only). An empty
     * list says so, so the CA offers the redeploy that fetches it.
     *
     * @return array{commits: list<array<string, mixed>>, from: string|null, to: string|null, total: int, branch_fetched: bool}
     */
    public function commits(Application $application, ?string $branch, ?int $limit): array
    {
        try {
            $commits = (new ProjectsApi($application->engine()))->gitCommits($application->engineProject(), $branch, $limit);
        } catch (EngineRequestException $e) {
            if ($branch === null || $branch === '' || ! self::isUnfetchedBranch($e)) {
                throw $e;
            }

            Log::warning('Git commits: the branch is not in the checkout yet.', [
                'application_id' => $application->id,
                'branch' => $branch,
                'message' => $e->engineMessage ?? $e->getMessage(),
            ]);
            $result = $this->presenter->commits($application, []);

            return [...$result, 'branch_fetched' => false];
        }

        return [...$this->presenter->commits($application, $commits), 'branch_fetched' => true];
    }

    /**
     * The Engine's own `git` stderr for a ref it cannot resolve. Only that one
     * refusal becomes an empty list: every other failure still bubbles.
     */
    private static function isUnfetchedBranch(EngineRequestException $e): bool
    {
        return str_contains((string) $e->engineMessage, 'unknown revision');
    }

    /**
     * A git operation the Engine could not perform: its answer is the raw `git`
     * stderr ("fatal: repository … not found", an askpass prompt), which names
     * the transport, not the customer's problem. The
     * customer – and the panel git log, which keeps the returned message – gets
     * the panel's own sentence for a repository it cannot read; the detail
     * stays in the server log. A 404 and a busy 409 keep their own meaning.
     */
    private function operationFailure(EngineRequestException $e, string $operation): EngineRequestException
    {
        if (in_array($e->engineStatus, [404, 409], true)) {
            return $e;
        }

        Log::warning('Git operation failed.', [
            'operation' => $operation,
            'engine_status' => $e->engineStatus,
            'message' => $e->engineMessage ?? $e->getMessage(),
        ]);

        return new EngineRequestException($e->engineStatus, self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE);
    }

    /**
     * @return array<string, mixed>
     */
    public function push(Application $application): array
    {
        return $this->operations->record($application, GitOperationRecorder::ACTION_PUSH, function () use ($application): array {
            return (new ProjectsApi($application->engine()))->gitPush($application->engineProject());
        }, static fn (mixed $result): string => is_array($result) && ($result['nothing_to_push'] ?? false) === true
            ? GitOperationRecorder::STATUS_SKIPPED
            : GitOperationRecorder::STATUS_SUCCESS, self::PUSH_NOTHING_MESSAGE);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function revert(Application $application, array $params): void
    {
        $this->operations->record($application, GitOperationRecorder::ACTION_REVERT, fn (): Response => (new ProjectsApi($application->engine()))
            ->gitRevert($application->engineProject(), array_filter([
                'ref' => $params['ref'] ?? null,
            ], static fn ($v) => $v !== null && $v !== '')));
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function updateCredentials(Application $application, array $params): array
    {
        $token = array_key_exists('token', $params)
            ? Payload::nullableString($params['token'])
            : null;

        if (self::asksForToken($params) && self::isBlank($token)) {
            throw ValidationException::withMessages(['token' => [self::ACCESS_TOKEN_REQUIRED_MESSAGE]]);
        }

        if ($token !== null && $token !== '') {
            $this->assertTokenReadsRepository($application, $token);
        }

        (new ProjectsApi($application->engine()))->gitUpdateCredentials(
            $application->engineProject(),
            array_key_exists('token', $params) ? ['token' => $token] : [],
        );

        // Keep the rotated token for the provider API calls; encrypted at rest
        // and never returned.
        if (array_key_exists('token', $params)) {
            $application->forceFill(['git_token' => $token])->save();
        }

        // A rotated credential or a leaked secret invalidates the Engine hook:
        // rotate it and re-register the provider webhook, or switch auto-deploy
        // off cleanly when that fails.
        if ($application->git_webhook_id !== null) {
            try {
                $this->autoDeploy->rotate($application);
            } catch (Throwable $e) {
                report($e);

                // A failed rotate must reach the CA: auto-deploy is left off and
                // the request answers the old registration-failed 422 –
                // but only when the Engine hook really went away. With the
                // Engine down the provider keeps calling a hook the panel could
                // not delete, so the marker stays and the Engine error answers.
                try {
                    $this->autoDeploy->disable($application);
                } catch (Throwable $cleanup) {
                    report($cleanup);

                    throw $cleanup;
                }

                throw ValidationException::withMessages([self::WEBHOOK_REGISTRATION_FAILED]);
            }
        }

        // The CA reads the git status payload, not the Engine's raw reply.
        return $this->show($application);
    }

    /**
     * The Engine reads the repository with the new token before anything is
     * stored (`POST /source/refs`, `git ls-remote`; the old panel's
     * `testRemoteAccess` ran after it had saved the token). A refusal is
     * a 422 on `token`. git sends the token only when the host asks for
     * credentials, so the provider's API is asked with the token as well. An SSH repository
     * uses its key.
     *
     * The URL comes from the Engine mirror, not from the request, and the Engine
     * reports the repository it stored: an Engine `git_repo` may be a remote
     * `RepositoryUrl::parse()` refuses (its `GitRepoInput` takes a scp remote
     * whose host holds a `_` or an IPv6 literal, `GitRepoInput.php:14-16`), so
     * the URL is parsed and host-checked here as well. One
     * the panel cannot parse is never sent anywhere and the token is refused
     * unchecked – no unverified token is stored.
     */
    private function assertTokenReadsRepository(Application $application, #[\SensitiveParameter] string $token): void
    {
        $url = $application->gitRepositoryUrl();
        if ($url === null) {
            // Nothing recorded to check against: a files project's credentials
            // write is the Engine's own answer.
            return;
        }

        $parsed = RepositoryUrl::parse($url);
        if ($parsed === null) {
            throw ValidationException::withMessages(['token' => [self::TOKEN_ADDRESS_UNREADABLE_MESSAGE]]);
        }
        if (RepositoryUrl::isSsh($parsed['canonical'])) {
            return;
        }

        $this->hosts->assertAllowed($parsed['host']);

        try {
            (new ProjectsApi($application->engine()))->sourceRefs($parsed['canonical'], $token, 1);
        } catch (EngineValidationException $e) {
            throw ValidationException::withMessages(['token' => [$this->tokenRefusalMessage($e)]]);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 502) {
                throw $e;
            }

            throw ValidationException::withMessages(['token' => [self::TOKEN_UNCHECKED_MESSAGE]]);
        }

        $this->assertProviderAcceptsToken($parsed['canonical'], $token);
    }

    /**
     * Whether the request connects or saves a token for a private repository.
     *
     * @param  array<string, mixed>  $params
     */
    private static function asksForToken(array $params): bool
    {
        return Payload::string($params['auth_type'] ?? null) === 'pat';
    }

    /** A token the request trimming left empty (or absent). */
    private static function isBlank(?string $token): bool
    {
        return $token === null || trim($token) === '';
    }

    /** Only the provider's 401 refuses the token, whatever the repository's visibility. */
    private function assertProviderAcceptsToken(string $url, #[\SensitiveParameter] string $token): void
    {
        $target = ProviderTarget::fromUrl($url);
        if ($target === null) {
            return;
        }

        try {
            $this->providers->for($target, $token)->checkToken();
        } catch (TokenRefusedException) {
            throw ValidationException::withMessages(['token' => [self::TOKEN_REFUSED_MESSAGE]]);
        } catch (Throwable $e) {
            Log::warning('Git token check at the provider did not answer.', [
                'provider' => $target->provider,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * The Engine's refusal of the refs read, said in the CA's `token` field. The
     * endpoint answers three codes the caller can act on
     * (`SourceRefsController.php:106-119`, `RepositoryAddress.php:20-40`,
     * rendered as `problems[]` beside `errors`, `Handler.php:194-208`): the token
     * was refused, the repository was not found, or the address itself is not
     * fetched from. Any other refusal – a token shaped like an `Authorization`
     * header, a URL the Engine will not clone – keeps the Engine's own sentence,
     * presented like every other Engine 422.
     */
    private function tokenRefusalMessage(EngineValidationException $e): string
    {
        $codes = [];
        foreach ($e->problems as $problem) {
            $code = Payload::nullableString($problem['code'] ?? null);
            if ($code !== null) {
                $codes[$code] = true;
            }
        }

        return match (true) {
            isset($codes['authentication_failed']) => self::TOKEN_REFUSED_MESSAGE,
            isset($codes['repository_not_found']) => self::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE,
            isset($codes['host_refused']) => self::TOKEN_ADDRESS_REFUSED_MESSAGE,
            default => EngineErrors::message($e),
        };
    }

    /**
     * @return list<string>  sorted branch names
     */
    public function branches(Application $application): array
    {
        return $this->presenter->branches((new ProjectsApi($application->engine()))->gitBranches($application->engineProject()));
    }

    /**
     * PUT /projects/{id}/change-branch – an async deploy on deploy-managed
     * projects (the CA follows the task).
     *
     * The Engine starts a rebuild and answers 202 + Task; the panel follows it
     * with the redeploy notifications (`DeployState::follow()`), and the Engine's
     * history lists it in `GET deploy-logs` and the live log. The switch is a git operation of the panel's log like pull
     * and revert, so the CA's Deployment log lists it, with the branches it
     * switched between (the Engine's checkout keeps only the current one).
     */
    public function changeBranch(Application $application, string $branch): void
    {
        // A checkout that was never deployed still has the Engine's untracked
        // welcome files, which make it refuse the switch.
        if (! $this->deploys->hasGitInstall($application)) {
            $this->settleCheckout($application, now()->getTimestamp() + EngineClient::LONG_TIMEOUT_SECONDS);
        }

        $this->assertCleanWorkingTree($application);

        try {
            $response = $this->operations->record($application, GitOperationRecorder::ACTION_BRANCH_CHANGE, fn (): Response => (new ProjectsApi($application->engine()))
                ->gitChangeBranch($application->engineProject(), $branch), null, null, array_filter([
                    'branch_from' => $application->gitBranch(),
                    'branch_to' => $branch,
                ], static fn (?string $name): bool => $name !== null && $name !== ''));
        } catch (EngineValidationException $e) {
            if (self::isWorkingTreeDirty($e)) {
                throw new WorkingTreeDirtyException;
            }

            throw $e;
        }

        if ($response->status() !== 202) {
            return;
        }

        $this->deploys->follow(
            $application,
            Payload::int($response->json('data.id')),
            new DeployWatch('user.instance.redeploy_finished', 'user.instance.redeploy_failed'),
            DeployState::SOURCE_GIT,
        );
    }

    /**
     * Rebuild the unchanged checkout and wait for it: the Engine then lists its
     * own files in `.git/info/exclude`, so they stop counting as changes when
     * the branch is switched.
     *
     * @param  int  $deadline  unix time the wait must end by
     *
     * @throws ValidationException the rebuild failed or took too long
     */
    public function settleCheckout(Application $application, int $deadline): void
    {
        $response = (new ProjectsApi($application->engine()))->rebuild($application->engineProject());

        try {
            $this->waiter->waitForTask(
                $application,
                Payload::int($response->json('data.id')),
                $deadline,
            );
        } catch (ValidationException $e) {
            throw ValidationException::withMessages(['branch' => [$e->getMessage()]]);
        }
    }

    /**
     * PUT /projects/{id}/auto-deploy – enable/disable the Engine deploy hook
     * through the auto-deploy seam (the route itself is registered by
     * `client-area-legacy`).
     *
     * @return array<string, mixed>
     */
    public function toggleAutoDeploy(Application $application, bool $enabled): array
    {
        if ($enabled) {
            $this->autoDeploy->enable($application);
        } else {
            $this->autoDeploy->disable($application);
        }

        return $this->show($application);
    }

    /**
     * Delete only the provider webhook through the auto-deploy seam. Kept on
     * GitService as the controller-facing entry point ({@see ProjectService}
     * uses it when a project is deleted); the implementation lives in
     * `client-area-legacy`.
     */
    public function deleteProviderWebhook(Application $application): void
    {
        $this->autoDeploy->deleteProviderWebhook($application);
    }

    /**
     * A missing project or repository is left to the operation itself to answer.
     *
     * @throws WorkingTreeDirtyException
     */
    private function assertCleanWorkingTree(Application $application): void
    {
        // The Engine client refuses a protected project before any call.
        if ($application->isProtected()) {
            return;
        }

        try {
            $status = (new ProjectsApi($application->engine()))->gitStatus($application->engineProject());
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 404) {
                return;
            }

            throw $e;
        }

        if (Payload::bool($status['dirty'] ?? null) === true) {
            throw new WorkingTreeDirtyException;
        }
    }

    /** The Engine's `Working tree is dirty.` 422 carries no problem code of its own. */
    private static function isWorkingTreeDirty(EngineValidationException $e): bool
    {
        foreach ($e->errors as $messages) {
            $text = implode("\n", array_map(
                static fn (mixed $message): string => is_string($message) ? $message : '',
                $messages,
            ));

            if (stripos($text, 'working tree is dirty') !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * POST /projects/{id}/git/drift/ignore – panel-side; nothing to call.
     */
    public function ignoreDrift(Application $application): void
    {
        // The Engine never reports drift to v1 (no drift key), so this is a no-op
        // kept for CA compatibility.
    }
}
