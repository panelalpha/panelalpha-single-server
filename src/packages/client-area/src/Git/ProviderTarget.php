<?php

namespace PanelAlpha\ClientArea\Git;

use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Where a repository lives: the panel registers the auto-deploy push webhook at
 * the provider, so it needs the provider API base and the
 * owner/repo the URL names. Ported from the old
 * `App\Lib\Helpers\GitRepository::resolveRepoFromUrl()`.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's `app/Lib/Helpers/GitRepository.php`.
 */
final readonly class ProviderTarget
{
    public const GITHUB = RepositoryUrl::PROVIDER_GITHUB;

    public const GITLAB = RepositoryUrl::PROVIDER_GITLAB;

    public const BITBUCKET = RepositoryUrl::PROVIDER_BITBUCKET;

    public function __construct(
        public string $provider,
        public string $host,
        public string $apiBase,
        public string $owner,
        public string $repo,
        public string $projectPath,
    ) {}

    /**
     * The provider a canonical repository URL (see {@see RepositoryUrl}) names,
     * or null when the URL does not identify one. The provider itself is
     * {@see RepositoryUrl::provider()}'s answer, so the `git_provider` the
     * controller stores on connect and this target always agree.
     */
    public static function fromUrl(string $repoUrl): ?self
    {
        $provider = RepositoryUrl::provider($repoUrl);
        $parts = parse_url(trim($repoUrl));
        if ($provider === null || ! is_array($parts)) {
            return null;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = trim((string) ($parts['path'] ?? ''), '/');
        $path = preg_replace('/\.git$/', '', $path) ?? $path;
        $segments = array_values(array_filter(explode('/', $path)));

        if ($host === '' || count($segments) < 2) {
            return null;
        }

        if ($provider === self::GITHUB) {
            return new self(
                self::GITHUB,
                $host,
                $host === 'github.com' ? 'https://api.github.com' : 'https://'.$host.'/api/v3',
                $segments[0],
                $segments[1],
                '',
            );
        }

        if ($provider === self::BITBUCKET) {
            return new self(self::BITBUCKET, $host, 'https://api.bitbucket.org/2.0', $segments[0], $segments[1], '');
        }

        // Everything else is GitLab, including self-hosted instances.
        $repo = array_pop($segments);
        $owner = implode('/', $segments);

        return new self(self::GITLAB, $host, 'https://'.$host.'/api/v4', $owner, $repo, $owner.'/'.$repo);
    }

    /**
     * Where an application's connected repository lives, for the provider API
     * the panel calls on auto-deploy; null when no repository is
     * recorded. Moved from the controller's `Application::gitTarget()`.
     */
    public static function of(Application $application): ?self
    {
        $url = $application->gitRepositoryUrl();

        return $url === null ? null : self::fromUrl($url);
    }

    /**
     * The host the provider API is on: api.github.com / api.bitbucket.org for
     * those two, the repo host for GitLab. The HostGuard resolves and pins this
     * host, never the repository host.
     */
    public function apiHost(): string
    {
        return (string) parse_url($this->apiBase, PHP_URL_HOST);
    }
}
