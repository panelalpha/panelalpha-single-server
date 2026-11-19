<?php

namespace Tests\Browser\Support;

use RuntimeException;

/**
 * Reads the environment the Dusk suite needs. Nothing is
 * hard-coded: the base URL, the WebDriver endpoint and the test-user file all
 * come from the process environment so the same suite runs against any panel
 * and never carries credentials in git.
 *
 * The suite targets a **live** v1 panel that is already provisioned and
 * connected to a real Engine; it never boots the app's
 * own database, so it does not create users or instances itself.
 */
final class DuskEnvironment
{
    public const BASE_URL = 'DUSK_BASE_URL';

    public const DRIVER_URL = 'DUSK_DRIVER_URL';

    public const USER_FILE = 'DUSK_USER_FILE';

    public static function baseUrl(): string
    {
        return self::value(self::BASE_URL);
    }

    public static function driverUrl(): string
    {
        return self::value(self::DRIVER_URL);
    }

    public static function userFile(): string
    {
        return self::value(self::USER_FILE);
    }

    public static function user(): DuskUser
    {
        return DuskUser::fromFile(self::userFile());
    }

    /**
     * Read one required value from the process environment. A missing or blank
     * value names the variable but never a value that was present.
     */
    private static function value(string $name): string
    {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);

        if (! is_string($value) || trim($value) === '') {
            throw new RuntimeException(
                "The {$name} environment variable is required to run the Dusk suite."
            );
        }

        return trim($value);
    }
}
