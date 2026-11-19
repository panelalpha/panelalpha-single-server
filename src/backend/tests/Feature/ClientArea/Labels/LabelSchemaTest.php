<?php

namespace Tests\Feature\ClientArea\Labels;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The label tables are controller tables. The create migration
 * and the controller's `2026_10_13_100000_apply_schema_rules_to_label_tables`
 * (the natural unique keys, the `label_id` FK and the configurable users table)
 * give the label schema ({@see LabelSchema::EXPECTED}); the rule migration
 * applies a rule only where it is missing.
 *
 * Contract: panel-side schema only (no Client Area or Engine call).
 */
final class LabelSchemaTest extends TestCase
{
    use RefreshDatabase;

    private const CREATE = '2026_10_09_100020_create_application_labels_tables';

    private const RULES = '2026_10_13_100000_apply_schema_rules_to_label_tables';

    public function test_a_migrate_gives_the_label_schema(): void
    {
        $ran = DB::table('migrations')->pluck('migration')->all();
        $this->assertContains(self::CREATE, $ran);
        $this->assertContains(self::RULES, $ran);

        $this->assertSame(LabelSchema::EXPECTED, LabelSchema::snapshot());
    }

    public function test_the_rule_migration_is_a_no_op_where_the_rules_exist(): void
    {
        $before = LabelSchema::snapshot();

        DB::enableQueryLog();
        $this->rulesMigration()->up();
        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        // Only schema reads: no rule was added again.
        $this->assertSame([], preg_grep('/^\s*(create|alter|drop|insert|update|delete)\b/i', $queries));
        $this->assertSame($before, LabelSchema::snapshot());
    }

    private function rulesMigration(): Migration
    {
        $migration = require base_path('../packages/client-area/database/migrations/'.self::RULES.'.php');
        $this->assertInstanceOf(Migration::class, $migration);

        return $migration;
    }
}
