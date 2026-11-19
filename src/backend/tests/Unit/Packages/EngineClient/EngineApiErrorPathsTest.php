<?php

namespace Tests\Unit\Packages\EngineClient;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use ReflectionParameter;
use ReflectionUnionType;
use Tests\TestCase;
use Throwable;

/**
 * Every public method of every `Api` class of engine-client, driven by
 * reflection against the same failures: an Engine 500, an Engine 422, a
 * transport failure and a 200 that is not JSON. A method must never answer a
 * failure with a value, and never fail with a PHP error on an answer it did
 * not expect. No database.
 */
final class EngineApiErrorPathsTest extends TestCase
{
    private const URL = 'https://engine.example.com/api';

    /** Methods that make no Engine call or return the raw response by design. */
    private const NO_ERROR_MAPPING = [
        'McpApi::mcpUrl' => 'builds a URL, makes no call',
        'McpApi::proxyMcp' => 'passes the Engine answer through raw (EngineClient::proxy)',
        'ProjectsApi::copiesAsCreate' => 'feature probe: a failed system/info reads as "no features"',
        'ProjectsApi::setsSource' => 'feature probe: a failed system/info reads as "no features"',
        'WordPressMigrationsApi::openPluginPackage' => 'refuses a foreign link without a call',
    ];

    /** A 200 that is not JSON is refused by these, by design: key => the status they throw. */
    private const REFUSES_NON_JSON = [
        'FilesApi::exists' => 400,
        'WordPressMigrationsApi::pluginPackage' => 502,
        'WordPressMigrationsApi::openPluginPackage' => 502,
    ];

    /** Methods that take a project but call an Engine route that is not under `/projects/{u}`. */
    private const NOT_PROJECT_SCOPED = [
        'DomainsApi::phpVersion' => 'the Engine route is keyed by domain name (core/routes/api.php:500)',
        'DomainsApi::setPhpVersion' => 'the Engine route is keyed by domain name (core/routes/api.php:501)',
        'DomainsApi::phpDirectives' => 'the Engine route is keyed by domain name (core/routes/api.php:502)',
        'DomainsApi::setPhpDirectives' => 'the Engine route is keyed by domain name (core/routes/api.php:503)',
        'ProjectsApi::copy' => 'a copy is a create: POST /projects with the source named in the body',
    ];

    /**
     * @return array<string, array{0: class-string}>
     */
    public static function apiClasses(): array
    {
        $classes = [];
        foreach (glob(dirname(__DIR__, 5).'/packages/engine-client/src/Api/*.php') ?: [] as $file) {
            $name = basename($file, '.php');
            $classes[$name] = ['PanelAlpha\\EngineClient\\Api\\'.$name];
        }
        ksort($classes);

        return $classes;
    }

    private function api(string $class): object
    {
        return new $class(new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::URL, '1|token')));
    }

    /**
     * @param  class-string  $class
     * @return list<ReflectionMethod>
     */
    private function calls(string $class): array
    {
        return array_values(array_filter(
            (new ReflectionClass($class))->getMethods(ReflectionMethod::IS_PUBLIC),
            static fn (ReflectionMethod $m): bool => ! $m->isStatic() && ! $m->isConstructor() && $m->getDeclaringClass()->getName() === $class,
        ));
    }

    private function key(ReflectionMethod $method): string
    {
        return (new ReflectionClass($method->getDeclaringClass()->getName()))->getShortName().'::'.$method->getName();
    }

    /**
     * @return list<mixed>
     */
    private function arguments(ReflectionMethod $method): array
    {
        if ($this->key($method) === 'ProjectsApi::attachSource') {
            return [new EngineProject(1, 'site1'), ['git_repo' => 'https://git.example.com/a.git']];
        }

        return array_map(fn (ReflectionParameter $p): mixed => $this->argument($p), $method->getParameters());
    }

    private function argument(ReflectionParameter $parameter): mixed
    {
        $type = $parameter->getType();
        $names = match (true) {
            $type instanceof ReflectionUnionType => array_map(static fn (ReflectionNamedType $t): string => $t->getName(), array_values(array_filter($type->getTypes(), static fn ($t): bool => $t instanceof ReflectionNamedType))),
            $type instanceof ReflectionNamedType => [$type->getName()],
            default => ['string'],
        };

        $values = [
            'string' => 'x',
            'int' => 1,
            'bool' => false,
            'array' => [],
            'float' => 1.0,
            'callable' => static function (): void {},
            EngineProject::class => new EngineProject(1, 'site1'),
        ];
        foreach ($values as $name => $value) {
            if (in_array($name, $names, true)) {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param  class-string  $class
     * @param  callable(ReflectionMethod): void  $check
     */
    private function eachCall(string $class, callable $check): void
    {
        foreach ($this->calls($class) as $method) {
            $check($method);
        }
    }

    /**
     * Runs one call and returns the throwable it ended with, or null.
     *
     * @param  class-string  $class
     */
    private function invoke(string $class, ReflectionMethod $method): ?Throwable
    {
        try {
            $method->invokeArgs($this->api($class), $this->arguments($method));
        } catch (Throwable $e) {
            return $e;
        }

        return null;
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_500_is_an_engine_request_exception_from_every_method(string $class): void
    {
        // Engine: core/app/Exceptions/Handler.php:139
        Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

        $this->eachCall($class, function (ReflectionMethod $method): void {
            $key = $this->key($method);
            $e = $this->invoke($method->getDeclaringClass()->getName(), $method);

            if (array_key_exists($key, self::NO_ERROR_MAPPING)) {
                if ($key !== 'WordPressMigrationsApi::openPluginPackage') {
                    $this->assertNotInstanceOf(EngineValidationException::class, $e, $key);
                }

                return;
            }

            $this->assertInstanceOf(EngineRequestException::class, $e, "{$key} must not swallow an Engine 500 ({$e?->getMessage()}).");
            $this->assertSame(500, $e->engineStatus, $key);
            $this->assertSame('boom', $e->engineMessage, $key);
        });
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_422_is_an_engine_validation_exception_from_every_method(string $class): void
    {
        // Engine: core/app/Exceptions/ProblemException.php:62
        Http::fake(['*' => Http::response([
            'message' => 'The field is invalid.',
            'errors' => ['field' => ['The field is invalid.']],
            'problems' => [['field' => 'field', 'code' => 'invalid', 'message' => 'The field is invalid.']],
        ], 422)]);

        $this->eachCall($class, function (ReflectionMethod $method): void {
            $key = $this->key($method);
            if (array_key_exists($key, self::NO_ERROR_MAPPING)) {
                return;
            }

            $e = $this->invoke($method->getDeclaringClass()->getName(), $method);

            $this->assertInstanceOf(EngineValidationException::class, $e, "{$key} must not swallow an Engine 422 ({$e?->getMessage()}).");
            $this->assertSame('invalid', $e->problems[0]['code'], $key);
            $this->assertArrayHasKey('field', $e->errors, $key);
        });
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_timeout_is_an_unavailable_exception_from_every_method(string $class): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client when cURL times out
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Operation timed out'));

        $this->eachCall($class, function (ReflectionMethod $method): void {
            $key = $this->key($method);
            if (array_key_exists($key, self::NO_ERROR_MAPPING)) {
                return;
            }

            $e = $this->invoke($method->getDeclaringClass()->getName(), $method);

            $this->assertInstanceOf(EngineUnavailableException::class, $e, "{$key} must say the Engine is unavailable ({$e?->getMessage()}).");
        });
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_200_that_is_not_json_never_ends_in_a_php_error(string $class): void
    {
        // Defensive (not an Engine shape): a proxy in front of the Engine answers 200 with HTML
        Http::fake(['engine.example.com/*' => Http::response('<html><body>Welcome</body></html>', 200)]);

        $this->eachCall($class, function (ReflectionMethod $method): void {
            $key = $this->key($method);
            $e = $this->invoke($method->getDeclaringClass()->getName(), $method);

            if ($e === null) {
                $this->assertArrayNotHasKey($key, self::REFUSES_NON_JSON, "{$key} must refuse a non-JSON 200");

                return;
            }

            $this->assertArrayHasKey($key, self::REFUSES_NON_JSON, "{$key} failed on a non-JSON 200 with ".$e::class.": {$e->getMessage()}");
            $this->assertInstanceOf(EngineRequestException::class, $e, $key);
            $this->assertSame(self::REFUSES_NON_JSON[$key], $e->engineStatus, $key);
        });
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_200_with_a_null_data_never_ends_in_a_php_error(string $class): void
    {
        // Defensive (not an Engine shape): an Engine answer without its data key
        Http::fake(['engine.example.com/*' => Http::response(['data' => null], 200)]);

        $this->eachCall($class, function (ReflectionMethod $method): void {
            $key = $this->key($method);
            $e = $this->invoke($method->getDeclaringClass()->getName(), $method);

            if ($e === null) {
                $this->assertNull($e, $key);

                return;
            }

            $this->assertArrayHasKey($key, self::REFUSES_NON_JSON, "{$key} failed on a null data with ".$e::class.": {$e->getMessage()}");
        });
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('apiClasses')]
    public function test_a_method_that_takes_a_project_calls_that_projects_path(string $class): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:1063
        Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

        $offenders = [];
        $this->eachCall($class, function (ReflectionMethod $method) use (&$offenders): void {
            $takesProject = array_filter(
                $method->getParameters(),
                static fn (ReflectionParameter $p): bool => $p->getType() instanceof ReflectionNamedType && $p->getType()->getName() === EngineProject::class,
            ) !== [];
            $key = $this->key($method);
            if (! $takesProject || array_key_exists($key, self::NOT_PROJECT_SCOPED)) {
                return;
            }

            $before = Http::recorded()->count();
            $this->invoke($method->getDeclaringClass()->getName(), $method);
            $requests = Http::recorded()->skip($before)->map(static fn (array $pair): Request => $pair[0])->values();

            $projectCalls = $requests->filter(static fn (Request $request): bool => str_starts_with($request->url(), self::URL.'/projects/site1'));
            if ($projectCalls->isEmpty()) {
                $offenders[] = $key.' -> '.$requests->map(static fn (Request $r): string => $r->method().' '.$r->url())->implode(', ');
            }
        });

        $this->assertSame([], $offenders, 'These methods take a project but never address /projects/site1.');
    }
}
