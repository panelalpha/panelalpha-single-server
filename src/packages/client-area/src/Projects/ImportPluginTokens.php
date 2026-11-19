<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Session\Session;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The migrator plugin tokens a user downloaded in this session (the manual
 * method, Engine 2.2.0). Each `GET import/download-plugin` asks the Engine
 * for a new package, so the token baked into the zip the user installed is one
 * of these; the connection test tries them newest first and remembers the one
 * the source plugin accepted for the import start.
 *
 * The Engine's package link is valid 24 h, and a token the user installed
 * stays valid on the source for as long as the plugin is installed, so only the
 * newest few are kept. The session is the container's store, the one the
 * Client Area's cookie session (Sanctum's `StartSession`) loads.
 */
final class ImportPluginTokens
{
    public const string KEY = 'client-area.wordpress_import.plugin_tokens';

    public const string VERIFIED_KEY = 'client-area.wordpress_import.verified_token';

    /** How many downloads are remembered. */
    public const int KEEP = 5;

    public function __construct(private readonly Session $session) {}

    public function remember(string $token): void
    {
        $tokens = array_values(array_filter($this->all(), static fn (string $known): bool => $known !== $token));
        array_unshift($tokens, $token);
        $this->session->put(self::KEY, array_slice($tokens, 0, self::KEEP));
    }

    /**
     * Newest first.
     *
     * @return list<string>
     */
    public function all(): array
    {
        $tokens = $this->session->get(self::KEY);
        if (! is_array($tokens)) {
            return [];
        }

        return array_values(array_filter($tokens, static fn (mixed $token): bool => is_string($token)
            && preg_match('/^[0-9a-f]{64}$/', $token) === 1));
    }

    /**
     * Record the token the source accepted for this source URL.
     */
    public function verify(string $url, string $token): void
    {
        $this->session->put(self::VERIFIED_KEY, ['url' => self::normalized($url), 'token' => $token]);
    }

    /**
     * The token the connection test verified for this source URL, else the
     * newest download.
     */
    public function forUrl(string $url): ?string
    {
        $verified = Payload::object($this->session->get(self::VERIFIED_KEY));
        if (($verified['url'] ?? null) === self::normalized($url)
            && is_string($verified['token'] ?? null)
            && in_array($verified['token'], $this->all(), true)) {
            return $verified['token'];
        }

        return $this->all()[0] ?? null;
    }

    private static function normalized(string $url): string
    {
        return strtolower(rtrim(trim($url), '/'));
    }
}
