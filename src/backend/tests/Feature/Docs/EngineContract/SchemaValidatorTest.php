<?php

namespace Tests\Feature\Docs\EngineContract;

use PHPUnit\Framework\TestCase;

final class SchemaValidatorTest extends TestCase
{
    private function validator(): SchemaValidator
    {
        return new SchemaValidator(OpenApiSpec::load());
    }

    public function test_validator_accepts_a_documented_user(): void
    {
        $user = ['id' => 1, 'username' => 'site1', 'domain' => 'site1.example.com', 'status' => 'active'];

        $this->assertSame([], $this->validator()->validate(['$ref' => '#/components/schemas/User'], $user));
    }

    public function test_validator_reports_a_field_the_schema_does_not_list(): void
    {
        $found = $this->validator()->validate(['$ref' => '#/components/schemas/User'], ['id' => 1, 'invented' => true]);

        $this->assertSame(['invented: unknown-field'], $found);
    }

    public function test_validator_reports_a_wrong_type_and_an_enum_miss(): void
    {
        $found = $this->validator()->validate(['$ref' => '#/components/schemas/User'], ['id' => '1', 'status' => 'gone']);

        $this->assertSame(['id: wrong-type (expected integer, got string)', 'status: not-in-enum'], $found);
    }

    public function test_validator_checks_items_and_treats_unknown_as_a_match(): void
    {
        $schema = ['type' => 'object', 'properties' => ['data' => ['type' => 'array', 'items' => ['$ref' => '#/components/schemas/User']]]];

        $this->assertSame(['data[].extra: unknown-field'], $this->validator()->validate($schema, ['data' => [['extra' => 1]]]));
        $this->assertSame([], $this->validator()->validate($schema, ['data' => new Unknown()]));
    }

    public function test_spec_places_a_concrete_path_on_its_operation(): void
    {
        $spec = OpenApiSpec::load();

        $this->assertSame('/projects/all', $spec->candidates('GET', '/projects/all')[0]['path']);
        $this->assertSame('/projects/{username}', $spec->candidates('GET', '/projects/site1')[0]['path']);
        $this->assertSame('/projects/{username}/usage', $spec->candidates('GET', '/users/site1/usage')[0]['path']);
        $this->assertSame([], $spec->candidates('GET', '/no/such/route'));
    }
}
