<?php

namespace Tests\Unit\Packages\EngineClient;

use Illuminate\Container\Container;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Events\EngineCallFailed;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\SingleEngineResolver;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\EngineClient\Support\ProjectCreateBody;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * The value objects and helpers of engine-client, which need no HTTP: the
 * resolver, the event, the exceptions' own methods, `Payload` and
 * `ProjectCreateBody`.
 */
final class EngineClientSupportTest extends TestCase
{
    public function test_the_resolver_returns_a_client_for_the_bound_connection(): void
    {
        $container = new Container;
        $connection = new EngineConnection(EngineConnection::DEFAULT_ID, 'https://engine.example.com/api', 'token');
        $container->instance(EngineConnection::class, $connection);
        $resolver = new SingleEngineResolver($container);

        $this->assertSame($connection, $resolver->forEngine(EngineConnection::DEFAULT_ID)->connection());
        $this->assertSame(EngineConnection::DEFAULT_ID, $resolver->defaultEngineId());
        $this->assertSame([EngineConnection::DEFAULT_ID], $resolver->engineIds());
    }

    public function test_the_resolver_refuses_an_engine_other_than_the_single_one(): void
    {
        $resolver = new SingleEngineResolver(new Container);

        $this->expectException(EngineNotConfiguredException::class);
        $this->expectExceptionMessage('Engine #2 is not configured; this edition has a single Engine.');
        $resolver->forEngine(2);
    }

    public function test_the_resolver_says_so_when_no_connection_is_bound(): void
    {
        $resolver = new SingleEngineResolver(new Container);

        $this->expectException(EngineNotConfiguredException::class);
        $this->expectExceptionMessage('No Engine connection is bound.');
        $resolver->forEngine(EngineConnection::DEFAULT_ID);
    }

    public function test_the_resolver_looks_for_the_connection_on_every_call(): void
    {
        $container = new Container;
        $resolver = new SingleEngineResolver($container);

        try {
            $resolver->forEngine(1);
            $this->fail('No connection is bound yet.');
        } catch (EngineNotConfiguredException) {
        }

        $container->instance(EngineConnection::class, new EngineConnection(1, 'https://engine.example.com/api', 'token'));

        $this->assertSame('token', $resolver->forEngine(1)->connection()->token);
    }

    /**
     * @return array<string, array{0: string, 1: ?string, 2: bool}>
     */
    public static function eventPaths(): array
    {
        return [
            'a project call' => ['projects/site1/wp/plugins', 'site1', false],
            'the project itself' => ['projects/site1', 'site1', true],
            'the project itself with a slash' => ['/projects/site1/', 'site1', true],
            'the project itself with a query' => ['projects/site1?with=1', 'site1', true],
            'the legacy users path' => ['users/site1/domains', 'site1', false],
            'an encoded username' => ['projects/a%20b/files', 'a b', false],
            'the all route' => ['projects/all', null, false],
            'the name check route' => ['projects/verify-new-username', null, false],
            'an engine-wide call' => ['system/info', null, false],
            'the projects collection' => ['projects', null, false],
        ];
    }

    #[DataProvider('eventPaths')]
    public function test_the_failed_call_event_names_the_project_it_addressed(string $path, ?string $username, bool $itself): void
    {
        $event = new EngineCallFailed(1, 'GET', $path, 404, false, false, 'x');

        $this->assertSame($username, $event->projectUsername());
        $this->assertSame($itself, $event->addressesProjectItself());
    }

    public function test_an_event_without_a_status_is_unreachable(): void
    {
        $this->assertTrue((new EngineCallFailed(1, 'GET', 'a', null, true, false, 'x'))->unreachable());
        $this->assertFalse((new EngineCallFailed(1, 'GET', 'a', 500, false, false, 'x'))->unreachable());
    }

    public function test_an_unavailable_exception_can_be_made_from_a_status(): void
    {
        $previous = new RuntimeException('busy');
        $e = EngineUnavailableException::fromStatus(503, $previous);

        $this->assertSame('The Engine answered HTTP 503.', $e->getMessage());
        $this->assertSame($previous, $e->getPrevious());
        $this->assertFalse($e->transport);
        $this->assertNull(EngineUnavailableException::fromStatus(502)->getPrevious());
    }

    /** A transport failure names the Engine's address, so the Client Area must not present it. */
    public function test_a_transport_failure_is_marked_as_one(): void
    {
        $e = EngineUnavailableException::from(new EngineConnection(1, 'https://engine.example.com/api', 't'), new RuntimeException('cURL error 28'));

        $this->assertTrue($e->transport);
        $this->assertSame('Engine #1 is unreachable: cURL error 28', $e->getMessage());
        $this->assertFalse((new EngineUnavailableException('Engine #2 is down.'))->transport);
    }

    public function test_a_protected_project_is_refused_before_a_call_and_an_open_one_is_not(): void
    {
        ProjectProtectedException::throwIfProtected(new EngineProject(1, 'site1'));

        try {
            ProjectProtectedException::throwIfProtected(new EngineProject(1, 'site1', protected: true));
            $this->fail('A protected project must be refused.');
        } catch (ProjectProtectedException $e) {
            $this->assertSame('Project site1 is protected.', $e->getMessage());
            $this->assertSame('site1', $e->username);
            $this->assertNull($e->engineStatus);
            $this->assertNull($e->engineCode);
        }
    }

    public function test_renaming_the_fields_of_a_refusal_merges_clashing_names_and_keeps_messages(): void
    {
        $e = new EngineValidationException('bad', [
            'domain.name' => ['taken'],
            'domain' => ['reserved'],
            'name' => ['short'],
        ], [
            ['field' => 'domain.name', 'code' => 'taken', 'message' => 'taken'],
            ['code' => 'no_field', 'message' => 'x'],
        ]);

        $flat = $e->withFieldsRenamed(static fn (string $field): string => str_replace('domain.name', 'domain', $field));

        $this->assertSame(['domain' => ['taken', 'reserved'], 'name' => ['short']], $flat->errors);
        $this->assertSame('domain', $flat->problems[0]['field']);
        $this->assertArrayNotHasKey('field', $flat->problems[1]);
        $this->assertSame('bad', $flat->getMessage());
        $this->assertSame(['domain.name' => ['taken'], 'domain' => ['reserved'], 'name' => ['short']], $e->errors);
    }

    public function test_objects_or_strings_keeps_arrays_and_strings_and_drops_the_rest(): void
    {
        $this->assertSame(
            [['id' => 1], 'name', ['id' => 2]],
            Payload::objectsOrStrings([['id' => 1], 'name', 7, null, ['id' => 2], true]),
        );
    }

    /**
     * @return array<string, array{0: mixed, 1: ?int}>
     */
    public static function limits(): array
    {
        return [
            'a number' => [512, 512],
            'zero' => [0, 0],
            'a numeric string' => ['2048', 2048],
            'the unlimited -1' => [-1, null],
            'the scaled unlimited' => [-1048576, null],
            'never set' => [null, null],
            'not numeric' => ['many', null],
        ];
    }

    #[DataProvider('limits')]
    public function test_an_engine_limit_is_null_when_unlimited_or_missing(mixed $value, ?int $expected): void
    {
        $this->assertSame($expected, Payload::limit($value));
    }

    public function test_bool_accepts_only_a_real_boolean(): void
    {
        $this->assertTrue(Payload::bool(true));
        $this->assertFalse(Payload::bool(false));
        $this->assertNull(Payload::bool(1));
        $this->assertNull(Payload::bool('true'));
        $this->assertNull(Payload::bool(null));
    }

    public function test_ints_drops_what_is_not_numeric_and_reads_numeric_strings(): void
    {
        $this->assertSame([1, 2, 3], Payload::ints([1, '2', 'x', null, 3.0, [4]]));
        $this->assertSame([], Payload::ints('1,2'));
        $this->assertSame([], Payload::ints(null));
    }

    public function test_array_or_string_keeps_an_object_and_stringifies_a_scalar(): void
    {
        $this->assertSame(['version' => '8.3'], Payload::arrayOrString(['version' => '8.3']));
        $this->assertSame('8.3', Payload::arrayOrString('8.3'));
        $this->assertSame('', Payload::arrayOrString(null));
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public static function typedFields(): array
    {
        return [
            'the name field' => ['name', 'username', 'username'],
            'a group key' => ['domain.name', 'username', 'domain'],
            'a limit' => ['limits.disk', 'username', 'disk_space_limit'],
            'a nested env var' => ['build.env_vars.APP_KEY', 'username', 'env_vars.APP_KEY'],
            'the git url' => ['source.url', 'username', 'git_repo'],
            'the git token' => ['source.auth.token', 'username', 'git_token'],
            'the archive path' => ['source.path', 'username', 'zip_path'],
            'the runtime' => ['runtime', 'username', 'template'],
            'the site password' => ['site_password', 'username', 'password'],
            'an unknown field' => ['unknown_field', 'username', 'unknown_field'],
        ];
    }

    #[DataProvider('typedFields')]
    public function test_a_typed_refusal_field_is_named_as_the_flat_body_spelled_it(string $typed, string $nameField, string $flat): void
    {
        $this->assertSame($flat, ProjectCreateBody::flatField($typed, $nameField));
    }

    public function test_the_flat_name_field_is_username_unless_only_name_is_sent(): void
    {
        $this->assertSame('username', ProjectCreateBody::nameField(['username' => 'a', 'name' => 'b']));
        $this->assertSame('username', ProjectCreateBody::nameField([]));
        $this->assertSame('name', ProjectCreateBody::nameField(['name' => 'b']));
    }

    public function test_a_typed_body_prefers_username_and_keeps_unknown_keys(): void
    {
        $typed = ProjectCreateBody::typed([
            'username' => 'site1',
            'name' => 'ignored',
            'template' => 'wordpress',
            'domain' => 'a.test',
            'memory_limit' => 512,
            'disk_space_limit' => 1024,
            'future_field' => 'kept',
        ]);

        $this->assertSame('site1', $typed['name']);
        $this->assertSame('php_hosting', $typed['runtime']);
        $this->assertSame(['name' => 'a.test'], $typed['domain']);
        $this->assertSame(['disk' => 1024, 'memory' => 512], $typed['limits']);
        $this->assertSame('kept', $typed['future_field']);
        $this->assertArrayNotHasKey('template', $typed);
    }

    public function test_a_git_repo_makes_a_container_project_with_a_source(): void
    {
        $typed = ProjectCreateBody::typed([
            'name' => 'app',
            'git_repo' => 'https://git.example.com/a.git',
            'git_branch' => 'main',
            'git_token' => 'secret',
        ]);

        $this->assertSame('container', $typed['runtime']);
        $this->assertSame([
            'type' => 'git',
            'url' => 'https://git.example.com/a.git',
            'branch' => 'main',
            'auth' => ['type' => 'token', 'token' => 'secret'],
        ], $typed['source']);
    }

    public function test_a_git_source_without_branch_or_token_has_neither(): void
    {
        $typed = ProjectCreateBody::typed(['name' => 'app', 'git_repo' => 'https://git.example.com/a.git', 'git_branch' => '', 'git_token' => null]);

        $this->assertSame(['type' => 'git', 'url' => 'https://git.example.com/a.git'], $typed['source']);
    }

    public function test_a_dind_template_is_a_container_without_a_source(): void
    {
        $typed = ProjectCreateBody::typed(['name' => 'app', 'template' => 'dind']);

        $this->assertSame('container', $typed['runtime']);
        $this->assertArrayNotHasKey('source', $typed);
    }
}
