<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * The moment-style date formats the panel offers, and the one it falls back to.
 * The Community settings endpoint (community) validates against
 * {@see self::ALL}; the host's `/home` payload, in every edition, runs the
 * stored `userapp.default-date-format` through {@see self::normalize()}.
 */
final class DateFormats
{
    public const DEFAULT = 'YYYY-MM-DD';

    /** @var list<string> */
    public const ALL = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];

    /**
     * An unknown or legacy value (a PHP-style `Y-m-d`, say) maps to the default.
     */
    public static function normalize(?string $value): string
    {
        return $value !== null && in_array($value, self::ALL, true) ? $value : self::DEFAULT;
    }
}
