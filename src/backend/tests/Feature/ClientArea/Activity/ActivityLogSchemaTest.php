<?php

namespace Tests\Feature\ClientArea\Activity;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * `activity_logs` is a controller table. Its three migrations and
 * the controller's `2026_10_13_100001_apply_schema_rules_to_activity_logs_table`
 * (the `user_id` FK on the configurable users table) give the
 * `activity_logs` schema ({@see ActivityLogSchema::EXPECTED}), also with a
 * configured users table; the rule migration applies the rule only where it is
 * missing.
 *
 * Contract: panel-side schema only (no Client Area or Engine call).
 */
final class ActivityLogSchemaTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATIONS = [
        '2026_10_09_100030_create_activity_logs_table',
        '2026_10_10_000004_activity_logs_null_on_delete',
        '2026_10_10_000006_drop_tags_from_activity_logs_table',
    ];

    private const RULES = '2026_10_13_100001_apply_schema_rules_to_activity_logs_table';

    /** A second in-memory database migrated with a configured users table. */
    private const CONFIGURED = 'activity_schema_configured_users';

    protected function tearDown(): void
    {
        DB::purge(self::CONFIGURED);

        parent::tearDown();
    }

    public function test_a_migrate_gives_the_activity_log_schema(): void
    {
        $ran = DB::table('migrations')->pluck('migration')->all();
        foreach ([...self::MIGRATIONS, self::RULES] as $migration) {
            $this->assertContains($migration, $ran);
        }

        $this->assertSame(ActivityLogSchema::EXPECTED, ActivityLogSchema::snapshot());
    }

    /**
     * @return array<string, array{string}>
     */
    public static function usersTables(): array
    {
        return ['default users table' => ['users'], 'configured users table' => ['members']];
    }

    /**
     * With a configured users table the rule
     * migration re-points the user FK.
     */
    #[DataProvider('usersTables')]
    public function test_the_user_fk_follows_the_users_table(string $usersTable): void
    {
        config(['client-area.users_table' => $usersTable]);

        $this->migrate(self::CONFIGURED, null);

        $expected = ActivityLogSchema::EXPECTED;
        $expected['foreign_keys'] = [
            'application_id → applications(id) on delete set null',
            'user_id → '.$usersTable.'(id) on delete set null',
        ];
        $this->assertSame($expected, ActivityLogSchema::snapshot(self::CONFIGURED));
    }

    public function test_the_rule_migration_is_a_no_op_where_the_rule_exists(): void
    {
        $before = ActivityLogSchema::snapshot();

        DB::enableQueryLog();
        $this->rulesMigration()->up();
        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        // Only schema reads: the rule was not added again.
        $this->assertSame([], preg_grep('/^\s*(create|alter|drop|insert|update|delete)\b/i', $queries));
        $this->assertSame($before, ActivityLogSchema::snapshot());
    }

    /**
     * @param  list<string>|null  $paths  null = every registered migration path
     */
    private function migrate(string $connection, ?array $paths): void
    {
        config(['database.connections.'.$connection => array_merge(
            (array) config('database.connections.sqlite'),
            ['database' => ':memory:'],
        )]);

        $options = ['--database' => $connection];
        if ($paths !== null) {
            $options += ['--path' => $paths, '--realpath' => true];
        }
        $this->artisan('migrate', $options)->assertExitCode(0);
    }

    private function rulesMigration(): Migration
    {
        $migration = require base_path('../packages/client-area/database/migrations/'.self::RULES.'.php');
        $this->assertInstanceOf(Migration::class, $migration);

        return $migration;
    }
}
