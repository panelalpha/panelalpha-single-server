<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Http\Request;

/**
 * Reads a query parameter the Client Area sends as a plain string. Stateless
 * and I/O-free: a missing value or an array
 * reads as `''` (the array is ignored), so controllers never cast
 * an array to string.
 */
final class QueryString
{
    public static function from(Request $request, string $key): string
    {
        $value = $request->query($key);

        return is_string($value) ? $value : '';
    }
}
