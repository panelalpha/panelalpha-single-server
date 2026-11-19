<?php

namespace Tests\Feature\Docs\EngineContract;

use RuntimeException;

/**
 * The Engine 2.3.0 OpenAPI document (`openapi-2.3.0.json`): operations by
 * method and path, and the schema of each documented answer.
 */
final class OpenApiSpec
{
    private static ?self $instance = null;

    /** @var array<string, mixed> */
    private array $document;

    /** @var list<array{method: string, path: string, regex: string, literals: int, operation: array<string, mixed>}> */
    private array $operations = [];

    private function __construct()
    {
        $json = file_get_contents(__DIR__.'/openapi-2.3.0.json');
        $document = is_string($json) ? json_decode($json, true) : null;
        if (! is_array($document)) {
            throw new RuntimeException('openapi-2.3.0.json is not valid JSON.');
        }
        $this->document = $document;

        foreach ($document['paths'] as $path => $methods) {
            $segments = explode('/', trim($path, '/'));
            $regex = [];
            $literals = 0;
            foreach ($segments as $segment) {
                if (str_starts_with($segment, '{')) {
                    $regex[] = '[^/]+';
                } else {
                    $regex[] = preg_quote($segment, '#');
                    $literals++;
                }
            }
            foreach ($methods as $method => $operation) {
                $this->operations[] = [
                    'method' => strtoupper($method),
                    'path' => $path,
                    'regex' => '#^/'.implode('/', $regex).'$#',
                    'literals' => $literals,
                    'operation' => $operation,
                ];
            }
        }
    }

    public static function load(): self
    {
        return self::$instance ??= new self();
    }

    public function operationCount(): int
    {
        return count($this->operations);
    }

    /**
     * The operations a request path (below `/api`, no query) can be, the one
     * with the most literal segments first. Engine serves every `/projects/...`
     * path at the same `/users/...` path (deprecated alias).
     *
     * @return list<array{method: string, path: string, regex: string, literals: int, operation: array<string, mixed>, exact?: bool}>
     */
    public function candidates(?string $method, string $path): array
    {
        // A trailing `*` is an open URL: the request may go to a longer path.
        $open = str_ends_with($path, '*');
        $path = '/'.trim(rtrim($path, '*'), '/');
        $paths = [$path];
        if (str_starts_with($path, '/users/') || $path === '/users') {
            $paths[] = '/projects'.substr($path, 6);
        }

        $found = [];
        foreach ($this->operations as $operation) {
            if ($method !== null && $operation['method'] !== strtoupper($method)) {
                continue;
            }
            foreach ($paths as $candidate) {
                if (preg_match($operation['regex'], $candidate) === 1
                    || ($open && self::startsWithPath($operation['path'], $candidate))
                ) {
                    $found[] = $operation + ['exact' => preg_match($operation['regex'], $candidate) === 1];
                    break;
                }
            }
        }
        // A literal segment wins over a `{parameter}` that would also take it
        // (`/projects/all` is not `/projects/{username}`), per method.
        $most = [];
        foreach ($found as $operation) {
            if ($operation['exact']) {
                $most[$operation['method']] = max($most[$operation['method']] ?? 0, $operation['literals']);
            }
        }
        $found = array_values(array_filter($found, static fn (array $operation): bool => ! $operation['exact'] || $operation['literals'] === $most[$operation['method']]));
        usort($found, static fn (array $a, array $b): int => [(int) ($b['exact'] ?? 0), $b['literals']] <=> [(int) ($a['exact'] ?? 0), $a['literals']]);

        return $found;
    }

    /**
     * Whether a spec path template begins with the given concrete path.
     */
    private static function startsWithPath(string $template, string $prefix): bool
    {
        $segments = explode('/', trim($prefix, '/'));
        $parts = explode('/', trim($template, '/'));
        if (count($parts) < count($segments)) {
            return false;
        }
        foreach ($segments as $index => $segment) {
            if (! str_starts_with($parts[$index], '{') && $parts[$index] !== $segment) {
                return false;
            }
        }

        return true;
    }

    /**
     * The statuses an operation documents, as ints (`default` is kept as the string).
     *
     * @param  array<string, mixed>  $operation
     * @return list<int|string>
     */
    public function statuses(array $operation): array
    {
        return array_map(static fn (int|string $code): int|string => is_numeric($code) ? (int) $code : $code, array_keys($operation['responses'] ?? []));
    }

    /**
     * The JSON schema of an operation's answer for a status, or null when the
     * answer has no JSON body in the document.
     *
     * @param  array<string, mixed>  $operation
     * @return array<string, mixed>|null
     */
    public function responseSchema(array $operation, int $status): ?array
    {
        $response = $operation['responses'][(string) $status] ?? $operation['responses']['default'] ?? null;

        return $response['content']['application/json']['schema'] ?? null;
    }

    public function hasStatus(array $operation, int $status): bool
    {
        return isset($operation['responses'][(string) $status]) || isset($operation['responses']['default']);
    }

    /**
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    public function resolve(array $schema): array
    {
        $guard = 0;
        while (isset($schema['$ref']) && $guard++ < 20) {
            $name = substr((string) $schema['$ref'], strlen('#/components/schemas/'));
            $schema = $this->document['components']['schemas'][$name] ?? [];
        }

        return $schema;
    }
}
