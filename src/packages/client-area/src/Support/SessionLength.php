<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Support\Carbon;

/**
 * The CA's session-time chart (`visits_length`) from the Engine's
 * `session_length` (Engine 2.2.0 `7074a6238`): `records` is the
 * estimated average session length per day in seconds, null for a day without
 * sessions, and `average` the average over every session in the range.
 *
 * The CA keys `visits_length.records` by the chart's dates and reads `total`
 * and `previous_total` as seconds (`General.vue:264-293`, the old Matomo
 * `avg_time_on_site`). Shared by the Client Area's and the Admin Area's
 * reports.
 */
final class SessionLength
{
    /**
     * One value per chart interval: a day's own average, or for a month the
     * average of its days that had sessions; 0 for an interval without any.
     *
     * @param  list<string>  $intervals  the chart keys, in `$format`
     * @return array<string, int>
     */
    public static function records(mixed $sessionLength, array $intervals, string $format): array
    {
        $daily = Payload::object(Payload::object($sessionLength)['records'] ?? null);

        $byInterval = [];
        foreach (array_keys($daily) as $date) {
            $seconds = Payload::int($daily[$date]);
            // A day without sessions is null: it does not lower the month's average.
            if ($seconds === null || $date === '') {
                continue;
            }
            $byInterval[Carbon::parse($date)->format($format)][] = $seconds;
        }

        $records = [];
        foreach ($intervals as $key) {
            $values = $byInterval[$key] ?? [];
            $records[$key] = $values === [] ? 0 : (int) round(array_sum($values) / count($values));
        }

        return $records;
    }

    /**
     * The range's average session length in seconds; 0 without sessions.
     */
    public static function average(mixed $sessionLength): int
    {
        return Payload::int(Payload::object($sessionLength)['average'] ?? null) ?? 0;
    }
}
