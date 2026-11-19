<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\WordPressApi;

/**
 * The wp-config constants that hold a credential: the database user and password
 * and the WordPress keys and salts. Their value never travels in a normal answer – the
 * config list and the installation details carry {@see MASK} instead – and is
 * read only through `POST /projects/{id}/secrets/reveal`, which confirms the
 * password and logs every request.
 */
final class ProjectSecrets
{
    /** The value a masked secret reads as, so the response keeps its key and type. */
    public const MASK = '********';

    /** Every secret the reveal endpoint answers for one of its names. */
    private const NAMES = [
        'DB_USER',
        'DB_PASSWORD',
        'AUTH_KEY',
        'SECURE_AUTH_KEY',
        'LOGGED_IN_KEY',
        'NONCE_KEY',
        'AUTH_SALT',
        'SECURE_AUTH_SALT',
        'LOGGED_IN_SALT',
        'NONCE_SALT',
        'WP_CACHE_KEY_SALT',
    ];

    /**
     * @return list<string>
     */
    public static function names(): array
    {
        return self::NAMES;
    }

    public static function isSecret(?string $name): bool
    {
        return $name !== null && in_array($name, self::NAMES, true);
    }

    /**
     * The real value of one wp-config constant, or null when the project has no
     * such constant.
     */
    public function reveal(Application $application, string $name): ?string
    {
        if (! self::isSecret($name)) {
            return null;
        }

        foreach (Payload::objects((new WordPressApi($application->engine(), $application->wordpressInstallPath()))->config($application->engineProject())) as $row) {
            if (Payload::nullableString($row['name'] ?? null) === $name) {
                return Payload::nullableString($row['value'] ?? null);
            }
        }

        return null;
    }
}
