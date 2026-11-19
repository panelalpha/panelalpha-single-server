<?php

namespace Tests\Unit;

use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Support\Payload as EnginePayload;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * The PHPStan level 9 / Psalm errorLevel 1 pass narrows `mixed`
 * with {@see Payload} instead of a precise `@var` shape on decoded JSON. These
 * tests pin the runtime behaviour of the readers the Engine API layer relies on,
 * so the narrowing cannot silently drop or invent data.
 */
class PayloadTest extends TestCase
{
    public function test_object_keeps_every_json_entry(): void
    {
        $this->assertSame(['id' => 1, 'name' => 'site'], Payload::object(['id' => 1, 'name' => 'site']));
    }

    public function test_object_rejects_a_non_array_like_the_removed_is_array_guard(): void
    {
        // The pre-refactor guards were `is_array($v) ? $v : []`,
        // so a scalar must stay an empty object, not become `['v']`.
        $this->assertSame([], Payload::object('v'));
        $this->assertSame([], Payload::object(null));
    }

    public function test_object_keeps_integer_like_keys_as_integers(): void
    {
        // PHP coerces numeric string keys, so `array<string, mixed>` is an
        // approximation: a `"0"` key arrives as int 0.
        $object = Payload::object(['0' => 'zero', '1.5' => 'one-five', 'name' => 'site']);

        $this->assertSame([0, '1.5', 'name'], array_keys($object));
        $this->assertIsInt(array_key_first($object));
    }

    public function test_list_readers_reject_a_non_array_value(): void
    {
        // `objects`/`objectsOrStrings`/`strings` replaced
        // `array_values((array) $data)`/`is_array(…) ? … : []`; a non-array
        // payload must produce an empty list, never a one-entry list.
        $this->assertSame([], Payload::objects('v'));
        $this->assertSame([], Payload::objects(null));
        $this->assertSame([], Payload::objectsOrStrings('v'));
        $this->assertSame([], Payload::strings('v'));
    }

    public function test_objects_keeps_the_array_entries_of_a_malformed_list(): void
    {
        $this->assertSame(
            [['id' => 1], ['id' => 2]],
            Payload::objects([['id' => 1], 'skipped', 7, ['id' => 2], null]),
        );
    }

    public function test_objects_or_strings_keeps_both_documented_shapes(): void
    {
        $this->assertSame(
            [['name' => 'main'], 'develop', ['name' => 'release']],
            Payload::objectsOrStrings([['name' => 'main'], 'develop', 7, ['name' => 'release']]),
        );
    }

    public function test_strings_keeps_the_string_entries_of_a_malformed_list(): void
    {
        $this->assertSame(['a', 'b'], Payload::strings(['a', 1, true, 'b', null]));
    }

    public function test_array_or_string_reads_both_documented_shapes(): void
    {
        $this->assertSame(['preset' => 'all'], Payload::arrayOrString(['preset' => 'all']));
        $this->assertSame('8.2', Payload::arrayOrString('8.2'));
    }

    public function test_string_reads_a_scalar_and_rejects_null_and_arrays(): void
    {
        $this->assertSame('8.2', Payload::string('8.2'));
        $this->assertSame('7', Payload::string(7));
        $this->assertSame('', Payload::string(null));
        $this->assertSame('', Payload::string(['x']));
    }

    public function test_nullable_string_keeps_only_a_real_string(): void
    {
        $this->assertSame('public_html', Payload::nullableString('public_html'));
        $this->assertNull(Payload::nullableString(1));
        $this->assertNull(Payload::nullableString(null));
    }

    public function test_int_reads_an_int_and_a_numeric_string(): void
    {
        $this->assertSame(12, Payload::int(12));
        $this->assertSame(12, Payload::int('12'));
        $this->assertNull(Payload::int('12x'));
        $this->assertNull(Payload::int(null));
    }

    /**
     * Engine 2.2.0 answers an unlimited limit as -1 and a never-set one as
     * null; the CA shows `∞` only for null.
     */
    public function test_limit_is_null_for_unlimited_and_never_set(): void
    {
        $this->assertNull(Payload::limit(-1));
        $this->assertNull(Payload::limit(-1048576));
        $this->assertNull(Payload::limit('-1'));
        $this->assertNull(Payload::limit(null));
        $this->assertNull(Payload::limit('x'));
        $this->assertSame(0, Payload::limit(0));
        $this->assertSame(4096, Payload::limit(4096));
        $this->assertSame(4096, Payload::limit('4096'));
    }

    public function test_bool_keeps_only_a_real_bool(): void
    {
        $this->assertTrue(Payload::bool(true));
        $this->assertFalse(Payload::bool(false));
        $this->assertNull(Payload::bool(1));
        $this->assertNull(Payload::bool(null));
    }

    public function test_object_keeps_numeric_keys_as_ints(): void
    {
        // PHP renumbers numeric string keys, so a JSON `{"1":"a"}` keeps the
        // int key 1 – an accepted cast difference.
        $this->assertSame([1 => 'a', 'x' => 'b'], Payload::object(['1' => 'a', 'x' => 'b']));
    }

    public function test_string_stringifies_a_scalar_like_the_wp_config_map(): void
    {
        // The wp-config `configMap` stringifies a raw boolean/number: true → '1'
        // (`WP_DEBUG` still reads as on), false → ''.
        $this->assertSame('1', Payload::string(true));
        $this->assertSame('', Payload::string(false));
        $this->assertSame('8.2', Payload::string(8.2));
    }

    /**
     * Panelalpha/engine-client requires no panel package, so it
     * keeps its own copy of these readers. The copy must stay the same code,
     * method for method, or the Engine client and the Client Area would narrow
     * the same Engine answer differently.
     */
    public function test_the_engine_client_copy_is_the_same_code(): void
    {
        $this->assertSame($this->methodSources(Payload::class), $this->methodSources(EnginePayload::class));
    }

    /**
     * @param  class-string  $class
     * @return array<string, string>
     */
    private function methodSources(string $class): array
    {
        $reflection = new ReflectionClass($class);
        $lines = file((string) $reflection->getFileName()) ?: [];
        $sources = [];
        foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            $sources[$method->getName()] = implode('', array_slice(
                $lines,
                (int) $method->getStartLine() - 1,
                (int) $method->getEndLine() - (int) $method->getStartLine() + 1,
            ));
        }
        ksort($sources);

        return $sources;
    }
}
