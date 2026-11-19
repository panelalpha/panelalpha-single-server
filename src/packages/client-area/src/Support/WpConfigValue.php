<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * The value of a `wp-config.php` constant or variable. The Engine's read of the
 * file (`Config::list`, what every WordPress page of the project loads) fails
 * from 4095 bytes on, so the cap counts bytes and not characters: `ą` is two of
 * them, `€` three.
 */
final class WpConfigValue
{
    /** The longest value the Engine reads back. */
    public const int MAX_BYTES = 4094;

    /** The value field's refusal, the same words in both requests that write a value. */
    public const string REFUSAL = 'The value is too long: it can be at most 4094 bytes, fewer characters when a character is not plain ASCII.';

    public static function isTooLong(mixed $value): bool
    {
        return is_string($value) && strlen($value) > self::MAX_BYTES;
    }
}
