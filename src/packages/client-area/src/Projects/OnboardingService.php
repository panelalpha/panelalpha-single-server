<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Pre-project source inspection for the onboarding "deploy from git" flow:
 * test a repository URL, list its branches and preview
 * the expected env variables.
 *
 * The old panel ran `git ls-remote` on the panel host (no git in the v1 image);
 * v1 asks the Engine. `gitBranches()` and `testGitUrl()` use POST /source/refs
 * (SourceRefsController::refs), which lists a repository's refs before any
 * project exists; `previewEnvExample()` still uses
 * POST /source/inspect for the `.env.example` variable names.
 */
final class OnboardingService
{
    /**
     * Never surface the Engine's transport/git error.
     */
    private const GENERIC_ERROR = 'Could not read the repository.';

    /**
     * The Engine for pre-project source inspection. A project does not exist
     * yet, so the default Engine connection is used through the resolver
     * (edition-agnostic; Community/Pro have one Engine).
     */
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly HostGuard $hosts,
    ) {}

    /**
     * Is the repository reachable (old GitRepository::isAccessible)? The answer
     * names what to fix: the panel's own refusal (unparsable address, a host it
     * must not reach) and the Engine's three repository codes say which thing is
     * wrong, any other refusal keeps the generic text.
     *
     * @return array{success: bool, error_message: string|null}
     */
    public function testGitUrl(string $repoUrl, ?string $token = null): array
    {
        try {
            $source = $this->canonicalRepo($repoUrl);
            $this->api()->sourceRefs($source, $token);
        } catch (ValidationException $e) {
            return ['success' => false, 'error_message' => (string) (array_values($e->errors())[0][0] ?? self::GENERIC_ERROR)];
        } catch (EngineValidationException $e) {
            return ['success' => false, 'error_message' => self::refusalMessage($e, $token !== null && $token !== '')];
        } catch (EngineException) {
            return ['success' => false, 'error_message' => self::GENERIC_ERROR];
        }

        return ['success' => true, 'error_message' => null];
    }

    /**
     * The Engine's refusal of the refs read in the customer's words: the three
     * codes a repository can fail with have their own sentence, an internal
     * address is the panel guard's refusal, and any other refusal stays generic.
     * A remote that asks for credentials the panel did not send (`authentication_failed`
     * without a token) is the not-found sentence: the address is wrong or the
     * repository is private, and the token could not be blamed.
     */
    private static function refusalMessage(EngineValidationException $e, bool $tokenGiven): string
    {
        $codes = [];
        foreach ($e->problems as $problem) {
            $code = Payload::nullableString($problem['code'] ?? null);
            if ($code !== null) {
                $codes[$code] = true;
            }
        }

        return match (true) {
            isset($codes['authentication_failed']) => $tokenGiven
                ? GitService::TOKEN_REFUSED_MESSAGE
                : GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE,
            isset($codes['repository_not_found']) => GitService::TOKEN_REPOSITORY_NOT_FOUND_MESSAGE,
            isset($codes['host_refused']) => HostGuard::REFUSAL,
            default => self::GENERIC_ERROR,
        };
    }

    /**
     * Branch list (old GitRepository::listBranches) from the Engine's remote
     * refs read (POST /source/refs, `sortedBranches()`/`defaultBranch`).
     *
     * @return array{success: bool, error_message: string|null, branches: list<string>, default_branch: string|null}
     */
    public function gitBranches(string $repoUrl, ?string $token = null): array
    {
        try {
            $source = $this->canonicalRepo($repoUrl);
            $refs = $this->api()->sourceRefs($source, $token);
        } catch (EngineException|EngineValidationException|ValidationException $e) {
            return [
                'success' => false,
                'error_message' => self::GENERIC_ERROR,
                'branches' => [],
                'default_branch' => null,
            ];
        }

        $default = Payload::nullableString($refs['default_branch'] ?? null);
        if ($default === '') {
            $default = null;
        }

        return [
            'success' => true,
            'error_message' => null,
            'branches' => Payload::strings($refs['branches'] ?? null),
            'default_branch' => $default,
        ];
    }

    /**
     * The expected environment variable names of a source (old
     * previewEnvExample). The Engine reports names only, never values, so every
     * value is empty – exactly what the CA's env form needs (keys to fill in).
     *
     * @param  array{repo_url?: string|null, token?: string|null, branch?: string|null}  $params
     * @return array{has_example: bool, branch: string|null, variables: list<array{key: string, value: string}>, error_message: string|null, variables_truncated: bool}
     */
    public function previewEnvExample(array $params): array
    {
        $branch = $params['branch'] ?? null;
        $repoUrl = $params['repo_url'] ?? null;

        if ($repoUrl === null || $repoUrl === '') {
            return [
                'has_example' => false,
                'branch' => is_string($branch) ? $branch : null,
                'variables' => [],
                'error_message' => null,
                'variables_truncated' => false,
            ];
        }

        try {
            $source = $this->canonicalRepo($repoUrl);
            /** @var array{source: string, type?: string, branch?: string, subdirectory?: string, git_token?: string} $params */
            $params = array_filter([
                'source' => $source,
                'type' => 'git',
                'branch' => $branch,
                'git_token' => $params['token'] ?? null,
            ], static fn ($v) => $v !== null && $v !== '');
            $report = $this->api()->inspectSource($params);
        } catch (EngineException|EngineValidationException|ValidationException $e) {
            return [
                'has_example' => false,
                'branch' => is_string($branch) ? $branch : null,
                'variables' => [],
                'error_message' => self::GENERIC_ERROR,
                'variables_truncated' => false,
            ];
        }

        $environment = Payload::object($report['environment'] ?? null);
        $variables = [];
        foreach (Payload::strings($environment['variables'] ?? null) as $key) {
            if ($key !== '') {
                $variables[] = ['key' => $key, 'value' => ''];
            }
        }

        return [
            'has_example' => $variables !== [],
            'branch' => is_string($branch) ? $branch : null,
            'variables' => $variables,
            'error_message' => null,
            'variables_truncated' => (bool) ($environment['variables_truncated'] ?? false),
        ];
    }

    /**
     * Reject a repository host the Engine must not clone from:
     * internal addresses and the Engine's own host.
     *
     * @throws ValidationException
     */
    /**
     * Validate a repository URL, guard its host and return the canonical URL the
     * Engine receives (the raw string never crosses).
     *
     * @throws ValidationException
     */
    private function canonicalRepo(string $repoUrl): string
    {
        $parsed = RepositoryUrl::parse($repoUrl);
        if ($parsed === null) {
            throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
        }

        $this->hosts->assertAllowed($parsed['host']);

        return $parsed['canonical'];
    }

    private function api(): ProjectsApi
    {
        return new ProjectsApi($this->engines->forEngine($this->engines->defaultEngineId()));
    }
}
