<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PanelAlpha\ClientArea\Models\Application;
use Tests\TestCase;

/**
 * The panel keeps no usage cache. The usage cache classes are
 * gone, and the controller's
 * `2026_10_13_100002_drop_engine_usage_from_applications_table` drops
 * `applications.engine_usage` (the pushed add migration is never edited). The
 * drop is idempotent: it skips a schema without the column
 * (`ApplicationsSchema::EXPECTED`).
 *
 * Contract: panel-side schema only (no Client Area or Engine call);
 * a pushed migration is never edited.
 */
final class UsageCacheRemovalTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = '2026_10_13_100002_drop_engine_usage_from_applications_table';

    private function migration(): Migration
    {
        $migration = require base_path('../packages/client-area/database/migrations/'.self::MIGRATION.'.php');
        $this->assertInstanceOf(Migration::class, $migration);

        return $migration;
    }

    public function test_a_migrate_drops_the_usage_column(): void
    {
        $ran = DB::table('migrations')->pluck('migration')->all();
        $this->assertContains('2026_10_12_000002_add_engine_usage_to_applications_table', $ran);
        $this->assertContains(self::MIGRATION, $ran);

        $this->assertFalse(Schema::hasColumn('applications', 'engine_usage'));
        $this->assertSame(ApplicationsSchema::EXPECTED, ApplicationsSchema::snapshot());
    }

    public function test_the_drop_skips_a_schema_without_the_column(): void
    {
        $this->assertFalse(Schema::hasColumn('applications', 'engine_usage'));

        $this->migration()->up();

        $this->assertFalse(Schema::hasColumn('applications', 'engine_usage'));
        $this->assertSame(ApplicationsSchema::EXPECTED, ApplicationsSchema::snapshot());
    }

    public function test_the_drop_removes_the_column_and_its_values_where_it_exists(): void
    {
        // The schema an existing install has before this migration.
        Schema::table('applications', function (Blueprint $table): void {
            $table->json('engine_usage')->nullable()->after('engine_payload');
        });
        DB::table('applications')->insert([
            'engine_id' => 1,
            'engine_username' => 'site1',
            'status' => 'active',
            'engine_usage' => '{"storage":{"usage":91,"maximum":-1}}',
        ]);

        $this->migration()->up();

        $this->assertFalse(Schema::hasColumn('applications', 'engine_usage'));
        $this->assertSame('site1', Application::query()->value('engine_username'));
        $this->assertSame(ApplicationsSchema::EXPECTED, ApplicationsSchema::snapshot());
    }

    public function test_the_rollback_restores_an_empty_column_once(): void
    {
        $this->migration()->down();
        $this->migration()->down();

        $this->assertTrue(Schema::hasColumn('applications', 'engine_usage'));
    }

    public function test_the_usage_cache_classes_are_gone_under_every_name(): void
    {
        foreach ([
            'PanelAlpha\\ClientArea\\Sync\\UsageCacheRefresher',
            'PanelAlpha\\ClientArea\\Listeners\\RefreshUsageCache',
            'PanelAlpha\\ClientArea\\Projects\\PanelProjectFacets',
            'PanelAlpha\\UserApplication\\Projects\\PanelProjectFacets',
        ] as $name) {
            $this->assertFalse(class_exists($name), $name);
        }
    }

    public function test_the_model_no_longer_casts_the_column(): void
    {
        $this->assertArrayNotHasKey('engine_usage', (new Application)->getCasts());
        $this->assertNotContains('engine_usage', (new Application)->getFillable());
    }
}
