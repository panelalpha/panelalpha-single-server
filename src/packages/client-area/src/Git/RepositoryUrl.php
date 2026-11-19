<?php

namespace PanelAlpha\ClientArea\Git;

use Illuminate\Validation\ValidationException;

/**
 * Parses and canonicalises a git repository URL before it reaches the Engine
 *The Engine only accepts a canonical `https`/`ssh`/scp
 * form, so the panel sends the URL **rebuilt from its parsed parts** – never the
 * raw user string (no `\`, whitespace or embedded credentials).
 */
final class RepositoryUrl
{
    /**
     * @return array{host: string, canonical: string}|null
     */
    public static function parse(string $url): ?array
    {
        $url = trim($url);
        if ($url === '' || str_contains($url, '\\') || preg_match('/\s/', $url) === 1) {
            return null;
        }

        // scp-like `[user@]host:path` (no scheme). The user is the ssh login
        // (`git@`), not a credential, so it is kept (Engine
        // core/app/Lib/Deploy/Source/GitUrl.php:148 keeps it too).
        if (! str_contains($url, '://') && preg_match('/^(?:([^@\/]+)@)?([^\/:@]+):([^\/].*)$/', $url, $m) === 1) {
            $host = self::normalizeHost($m[2]);
            if ($host === null) {
                return null;
            }

            $user = self::normalizeUser($m[1]);
            if ($user === false) {
                return null;
            }

            $path = ltrim($m[3], '/');

            return ['host' => $host, 'canonical' => 'ssh://'.($user !== null ? $user.'@' : '').$host.'/'.$path];
        }

        $withScheme = str_contains($url, '://') ? $url : 'https://'.$url;
        $parts = parse_url($withScheme);
        if (! is_array($parts) || ! isset($parts['host'])) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        if (! in_array($scheme, ['https', 'http', 'ssh'], true)) {
            return null;
        }

        $host = self::normalizeHost((string) $parts['host']);
        if ($host === null) {
            return null;
        }

        $path = (string) ($parts['path'] ?? '');
        if ($path === '') {
            return null;
        }

        $port = isset($parts['port']) ? ':'.(int) $parts['port'] : '';
        $user = self::normalizeUser((string) ($parts['user'] ?? ''));
        if ($user === false) {
            return null;
        }

        // https/http userinfo (user and password) is a credential: dropped.
        // ssh keeps its login user and drops only a password.
        $canonical = 'https' === $scheme || 'http' === $scheme
            ? 'https://'.$host.$port.$path
            : 'ssh://'.($user !== null ? $user.'@' : '').$host.$port.$path;

        return ['host' => $host, 'canonical' => $canonical];
    }

    /**
     * Hosts the Engine pins from its own known_hosts: a deploy key for one of
     * them needs no `host` argument.
     */
    private const array KNOWN_FORGE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

    /**
     * Whether a canonical URL (from {@see parse()}) is an SSH one.
     */
    public static function isSsh(string $canonical): bool
    {
        return str_starts_with($canonical, 'ssh://');
    }

    /**
     * The `host` or `host:port` the Engine pins for an SSH canonical URL, or
     * null when there is nothing to pin: not an SSH URL, or a forge the Engine
     * already knows (github.com, gitlab.com, bitbucket.org).
     */
    public static function pinHost(string $canonical): ?string
    {
        if (! self::isSsh($canonical)) {
            return null;
        }

        $parts = parse_url($canonical);
        if (! is_array($parts) || ! isset($parts['host']) || $parts['host'] === '') {
            return null;
        }

        $host = strtolower($parts['host']);
        if (in_array($host, self::KNOWN_FORGE_HOSTS, true)) {
            return null;
        }

        return isset($parts['port']) ? $host.':'.$parts['port'] : $host;
    }

    /**
     * @throws ValidationException
     */
    public static function assertValid(string $url): void
    {
        if (self::parse($url) === null) {
            throw ValidationException::withMessages(['repo_url' => ['Invalid repository URL.']]);
        }
    }

    public const string PROVIDER_GITHUB = 'github';

    public const string PROVIDER_GITLAB = 'gitlab';

    public const string PROVIDER_BITBUCKET = 'bitbucket';

    /**
     * The git hosting provider a canonical repository URL names – GitHub
     * (github.com and GitHub Enterprise `*.github.com`), Bitbucket
     * (bitbucket.org) or GitLab (every other host, self-hosted included) – or
     * null when the URL names no host or no owner/repository path. Ported from
     * the old `App\Lib\Helpers\GitRepository::resolveRepoFromUrl()`; the
     * panel stores it in `git_provider` on connect, and the
     * auto-deploy provider client builds on the same answer.
     */
    public static function provider(string $url): ?string
    {
        $parts = parse_url(trim($url));
        if (! is_array($parts)) {
            return null;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = trim((string) ($parts['path'] ?? ''), '/');
        $path = preg_replace('/\.git$/', '', $path) ?? $path;
        $segments = array_values(array_filter(explode('/', $path)));

        if ($host === '' || count($segments) < 2) {
            return null;
        }

        if ($host === 'github.com' || str_ends_with($host, '.github.com')) {
            return self::PROVIDER_GITHUB;
        }

        if ($host === 'bitbucket.org') {
            return self::PROVIDER_BITBUCKET;
        }

        return self::PROVIDER_GITLAB;
    }

    private static function normalizeHost(string $host): ?string
    {
        $host = strtolower(trim($host, '[]'));
        if ($host === '' || ! preg_match('/^[a-z0-9.-]+$/', $host)) {
            return null;
        }

        return $host;
    }

    /**
     * null = no user, false = invalid characters, string = the login user.
     */
    private static function normalizeUser(string $user): string|null|false
    {
        $user = trim($user);
        if ($user === '') {
            return null;
        }

        return preg_match('/^[a-zA-Z0-9._-]+$/', $user) === 1 ? $user : false;
    }
}
