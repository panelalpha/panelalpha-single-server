<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * Typed readers for untrusted Engine/HTTP payloads: the analysers
 * run at PHPStan level 9 / Psalm errorLevel 1, where every value decoded from a
 * response is `mixed`. These helpers narrow that `mixed` with real runtime
 * checks instead of a precise `@var` shape, so a payload that does not match the
 * documented contract is normalised rather than trusted (external data is
 * untrusted).
 *
 * They are deliberately behaviour-preserving for the shape the Engine documents:
 * `object()` keeps every entry of a JSON object (a non-array payload is treated
 * as empty, exactly like the legacy `is_array(...) ? ... : []` guard),
 * `objects()` keeps the array entries of a JSON list, and `strings()` keeps the
 * string entries of a JSON string list.
 */
final class Payload
{
    /**
     * A JSON object as an array. A non-array value (null, a scalar) is treated
     * as an empty object, matching the legacy `is_array` guard. The declared
     * `array<string, mixed>` is exact for the string keys the Engine sends;
     * numeric keys (`"0"`, `"1"`) come back as PHP **integer** keys because PHP
     * coerces them, so a caller must not assume every key is a string.
     *
     * @return array<string, mixed>
     */
    public static function object(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $keys = array_map(static fn (mixed $key): string => (string) $key, array_keys($array));

        $object = array_combine($keys, array_values($array));

        return $object;
    }

    /**
     * A JSON list of objects; non-array entries of a malformed list are dropped,
     * because the callers only ever read object keys.
     *
     * @return list<array<string, mixed>>
     */
    public static function objects(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $objects = [];
        foreach (array_keys($array) as $key) {
            if (is_array($array[$key])) {
                $objects[] = self::object($array[$key]);
            }
        }

        return $objects;
    }

    /**
     * A JSON list whose entries are objects or bare strings (the Engine's
     * `git/branches` rows; the old v1 parser also accepted bare branch names).
     *
     * @return list<array<string, mixed>|string>
     */
    public static function objectsOrStrings(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $rows = [];
        foreach (array_keys($array) as $key) {
            if (is_array($array[$key])) {
                $rows[] = self::object($array[$key]);
            } elseif (is_string($array[$key])) {
                $rows[] = $array[$key];
            }
        }

        return $rows;
    }

    /**
     * A JSON list of strings; non-string entries of a malformed list are dropped.
     *
     * @return list<string>
     */
    public static function strings(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $strings = [];
        foreach (array_keys($array) as $key) {
            if (is_string($array[$key])) {
                $strings[] = $array[$key];
            }
        }

        return $strings;
    }

    /**
     * A scalar rendered as a string, or '' for null/array/object. Engine string
     * `data` (a PHP version, a privilege preset) is a string or null; the legacy
     * `(string)` defensive branch is reproduced for scalars.
     */
    public static function string(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    public static function nullableString(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }

    /**
     * An integer, accepting the numeric strings the Engine sometimes sends, or
     * null. Mirrors the legacy `is_numeric($v) ? (int) $v : null`.
     */
    public static function int(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        return is_numeric($value) ? (int) $value : null;
    }

    /**
     * An Engine limit as the CA reads it: null is unlimited (the CA shows `∞`
     * only for a null `maximum`). Engine 2.2.0 answers every unlimited limit as
     * -1 (`ResourceLimit::UNLIMITED`; before it, `null` or a scaled
     * `-1048576`), and null means never set, so any negative value and a
     * missing one are null.
     */
    public static function limit(mixed $value): ?int
    {
        $limit = self::int($value);

        return $limit === null || $limit < 0 ? null : $limit;
    }

    public static function bool(mixed $value): ?bool
    {
        return is_bool($value) ? $value : null;
    }

    /**
     * A JSON list of integers, dropping entries that are not numeric (a
     * request's `servers[]`, a stored id list).
     *
     * @return list<int>
     */
    public static function ints(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $ints = [];
        foreach (array_keys($array) as $key) {
            $int = self::int($array[$key]);
            if ($int !== null) {
                $ints[] = $int;
            }
        }

        return $ints;
    }

    /**
     * A JSON value that the Engine documents as either an object or a scalar
     * string (a PHP version, a privilege preset); the legacy callers accepted
     * both shapes.
     *
     * @return array<string, mixed>|string
     */
    public static function arrayOrString(mixed $value): array|string
    {
        return is_array($value) ? self::object($value) : self::string($value);
    }
}
