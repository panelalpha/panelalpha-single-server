<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Support\Carbon;

/**
 * A project's transfer this calendar month, as the Engine measures and puts it
 * on the project resource (Engine 2.2.0): `bandwidth {month,
 * used_bytes, limit_bytes, measured_at}`, null until the first measurement.
 * The sync mirrors it in `engine_payload`, so every list and page reads it
 * without an Engine call.
 *
 * The Engine refreshes it daily (AWStats import): a measurement of an earlier
 * month means nothing was transferred this month yet, so its usage is 0. The
 * limit is -1 when unlimited (`Payload::limit()` → null).
 */
final class MeasuredBandwidth
{
    /**
     * `{usage, maximum}` in bytes, or null when the Engine has not measured it.
     *
     * @param  array<string, mixed>  $payload  the mirrored Engine project
     * @return array{usage: int, maximum: int|null}|null
     */
    public static function of(array $payload): ?array
    {
        $bandwidth = $payload['bandwidth'] ?? null;
        if (! is_array($bandwidth)) {
            return null;
        }
        $bandwidth = Payload::object($bandwidth);

        $thisMonth = Payload::nullableString($bandwidth['month'] ?? null) === Carbon::now('UTC')->format('Y-m');

        return [
            'usage' => $thisMonth ? (Payload::int($bandwidth['used_bytes'] ?? null) ?? 0) : 0,
            'maximum' => Payload::limit($bandwidth['limit_bytes'] ?? null),
        ];
    }
}
