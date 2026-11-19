<?php

namespace Tests\Feature\Docs\EngineContract;

/**
 * A small validator for the OpenAPI 3.0 subset the Engine document uses:
 * `$ref`, `type`, `nullable`, `properties`, `required`, `additionalProperties`,
 * `items`, `enum`, `oneOf`, `anyOf`, `allOf`. A property the schema does not
 * list is a difference when the schema lists any property (an object schema
 * without `properties` is free-form).
 *
 * Differences are returned as `<field path>: <kind>` with array indexes written
 * as `[]`, so the same mistake in many items is one difference.
 */
final class SchemaValidator
{
    public function __construct(private readonly OpenApiSpec $spec)
    {
    }

    /**
     * @param  array<string, mixed>  $schema
     * @return list<string>
     */
    public function validate(array $schema, mixed $value, string $path = ''): array
    {
        if ($value instanceof Unknown) {
            return [];
        }

        $schema = $this->spec->resolve($schema);
        $differences = [];

        if (isset($schema['allOf'])) {
            foreach ($schema['allOf'] as $part) {
                $differences = array_merge($differences, $this->validate($part, $value, $path));
            }
            $schema = array_diff_key($schema, ['allOf' => true]);
        }
        foreach (['oneOf', 'anyOf'] as $keyword) {
            if (isset($schema[$keyword])) {
                $best = null;
                foreach ($schema[$keyword] as $option) {
                    $found = $this->validate($option, $value, $path);
                    if ($found === []) {
                        $best = [];
                        break;
                    }
                    if ($best === null || count($found) < count($best)) {
                        $best = $found;
                    }
                }
                $differences = array_merge($differences, $best ?? []);
                $schema = array_diff_key($schema, [$keyword => true]);
            }
        }

        if ($value === null) {
            return ($schema['nullable'] ?? false) === true || ! isset($schema['type'])
                ? $differences
                : array_merge($differences, [$this->at($path).': null-not-allowed']);
        }

        $type = $schema['type'] ?? null;
        if ($type !== null && ! $this->isType($type, $value)) {
            return array_merge($differences, [$this->at($path).': wrong-type (expected '.$type.', got '.$this->typeOf($value).')']);
        }

        if (isset($schema['enum']) && ! in_array($value, $schema['enum'], true)) {
            $differences[] = $this->at($path).': not-in-enum';
        }

        if (is_array($value) && ($type === 'array' || (($type === null) && array_is_list($value) && isset($schema['items'])))) {
            foreach ($value as $item) {
                if (isset($schema['items'])) {
                    $differences = array_merge($differences, $this->validate($schema['items'], $item, $path.'[]'));
                }
            }
        } elseif (is_array($value) && ($type === 'object' || $type === null) && ! ($value !== [] && array_is_list($value))) {
            $properties = $schema['properties'] ?? [];
            foreach ($schema['required'] ?? [] as $name) {
                if (! array_key_exists($name, $value)) {
                    $differences[] = $this->at($path === '' ? $name : $path.'.'.$name).': missing-required';
                }
            }
            $additional = $schema['additionalProperties'] ?? null;
            foreach ($value as $name => $item) {
                $child = $path === '' ? (string) $name : $path.'.'.$name;
                if (isset($properties[$name])) {
                    $differences = array_merge($differences, $this->validate($properties[$name], $item, $child));
                } elseif (is_array($additional)) {
                    $differences = array_merge($differences, $this->validate($additional, $item, $path.'.*'));
                } elseif ($properties !== [] && $additional !== true) {
                    $differences[] = $this->at($child).': unknown-field';
                }
            }
        }

        return array_values(array_unique($differences));
    }

    private function isType(string $type, mixed $value): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'integer' => is_int($value),
            'number' => is_int($value) || is_float($value),
            'boolean' => is_bool($value),
            'array' => is_array($value) && array_is_list($value),
            // PHP cannot tell an empty list from an empty object.
            'object' => is_array($value) && ($value === [] || ! array_is_list($value)),
            default => true,
        };
    }

    private function typeOf(mixed $value): string
    {
        if (is_array($value)) {
            return $value === [] || array_is_list($value) ? 'array' : 'object';
        }

        return get_debug_type($value);
    }

    private function at(string $path): string
    {
        return $path === '' ? '(body)' : $path;
    }
}
