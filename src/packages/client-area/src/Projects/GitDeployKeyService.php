<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Http\Presenters\GitPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * The project's SSH deploy key: show or generate it, read the current one, and
 * remove it for a rotation (the UI deletes, then generates). The single place
 * that turns a repository URL into the Engine's `host` argument and guards
 * that host.
 */
final class GitDeployKeyService
{
    /** Engine 422 codes of a self-hosted forge that cannot be pinned. */
    private const HOST_CODES = ['host_invalid', 'host_unreachable'];

    public function __construct(
        private readonly HostGuard $hosts,
        private readonly GitPresenter $presenter,
    ) {}

    /**
     * @return array{public_key: string, fingerprint: string, created: bool, hosts: list<array{host: string, pinned: string}>}
     *
     * @throws ValidationException a repo_url that is not an SSH address, a blocked
     *                             host, or a host the Engine cannot pin
     */
    public function show(Application $application, ?string $repoUrl = null): array
    {
        $host = $this->pinHost($repoUrl);

        try {
            $key = (new ProjectsApi($application->engine()))->gitDeployKey($application->engineProject(), $host);
        } catch (EngineValidationException $e) {
            if ($this->refusesHost($e)) {
                throw ValidationException::withMessages(['repo_url' => [EngineErrors::message($e)]]);
            }

            throw $e;
        }

        return $this->presenter->deployKey($key);
    }

    /**
     * The current key, or null when the project has none or cannot have one and
     * the Engine has no read of it yet. On an Engine without the read, an SSH
     * project's key is read through the idempotent create; any other project
     * answers null without sending a create (which would make a key).
     *
     * @return array{public_key: string, fingerprint: string, created: bool, hosts: list<array{host: string, pinned: string}>}|null
     */
    public function current(Application $application): ?array
    {
        try {
            $key = (new ProjectsApi($application->engine()))->gitShowDeployKey($application->engineProject());
        } catch (EngineRequestException $e) {
            if (! ProjectsApi::lacksDeployKeyRead($e)) {
                throw $e;
            }

            return $this->isSshRepository($application) ? $this->show($application) : null;
        }

        return $key === null ? null : $this->presenter->deployKey($key);
    }

    public function delete(Application $application): void
    {
        (new ProjectsApi($application->engine()))->gitDeleteDeployKey($application->engineProject());
    }

    /**
     * The `host[:port]` to pin for a self-hosted forge, or null when the URL is
     * absent or names a forge the Engine already knows.
     *
     * @throws ValidationException a URL that is not an SSH address or a blocked host
     */
    public function pinHost(?string $repoUrl): ?string
    {
        $repoUrl = Payload::string($repoUrl);
        if ($repoUrl === '') {
            return null;
        }

        $parsed = RepositoryUrl::parse($repoUrl);
        if ($parsed === null) {
            throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
        }
        if (! RepositoryUrl::isSsh($parsed['canonical'])) {
            throw ValidationException::withMessages(['repo_url' => ['A deploy key is only used with an SSH repository address.']]);
        }

        $this->hosts->assertAllowed($parsed['host']);

        return RepositoryUrl::pinHost($parsed['canonical']);
    }

    /**
     * Whether the project's stored repository is an SSH address: only such a
     * project is reached with a deploy key.
     */
    private function isSshRepository(Application $application): bool
    {
        $repoUrl = $application->gitRepositoryUrl();
        if ($repoUrl === null || $repoUrl === '') {
            return false;
        }

        $parsed = RepositoryUrl::parse($repoUrl);

        return $parsed !== null && RepositoryUrl::isSsh($parsed['canonical']);
    }

    private function refusesHost(EngineValidationException $e): bool
    {
        foreach ($e->problems as $problem) {
            if (in_array($problem['code'] ?? null, self::HOST_CODES, true)) {
                return true;
            }
        }

        return false;
    }
}
