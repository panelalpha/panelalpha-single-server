<?php

namespace App\Support;

/**
 * Minimal user-agent → {browser, device} parser for the device list (section B).
 * The old panel used matomo/device-detector; v1 only needs the two labels the
 * Client Area shows (browser icon + OS name), so this avoids a dependency. A
 * label is null when the agent names no browser or system (API clients, curl);
 * the Client Area prints its own fallback for that.
 */
final class UserAgent
{
    /**
     * @return array{browser: ?string, device: ?string}
     */
    public static function parse(?string $userAgent): array
    {
        $ua = (string) $userAgent;

        return [
            'browser' => self::browser($ua),
            'device' => self::device($ua),
        ];
    }

    private static function browser(string $ua): ?string
    {
        return match (true) {
            stripos($ua, 'Edg/') !== false || stripos($ua, 'Edge/') !== false => 'Edge',
            stripos($ua, 'OPR/') !== false || stripos($ua, 'Opera') !== false => 'Opera',
            stripos($ua, 'Chrome/') !== false || stripos($ua, 'CriOS') !== false => 'Chrome',
            stripos($ua, 'Firefox/') !== false || stripos($ua, 'FxiOS') !== false => 'Firefox',
            stripos($ua, 'Safari/') !== false => 'Safari',
            default => null,
        };
    }

    private static function device(string $ua): ?string
    {
        return match (true) {
            stripos($ua, 'Windows') !== false => 'Windows',
            stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false => 'iOS',
            stripos($ua, 'Android') !== false => 'Android',
            stripos($ua, 'Mac OS X') !== false || stripos($ua, 'Macintosh') !== false => 'Mac',
            stripos($ua, 'Linux') !== false => 'Linux',
            default => null,
        };
    }
}
