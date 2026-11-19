<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The panel keeps no usage cache any more. Project storage comes
 * from the `disk` block the sync mirrors into `engine_payload`, and bandwidth is
 * read live on the project page, so `applications.engine_usage`
 * (added by the pushed `2026_10_12_000002_add_engine_usage_to_applications_table`,
 * which is never edited) goes.
 *
 * Idempotent: the column is dropped only when it is there, so the migration is
 * a no-op on a schema that never had it or already lost it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('applications', 'engine_usage')) {
            Schema::table('applications', function (Blueprint $table): void {
                $table->dropColumn('engine_usage');
            });
        }
    }

    /**
     * Puts the column back (empty) so rolling back past it leaves the schema the
     * pushed add migration expects to drop.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('applications', 'engine_usage')) {
            Schema::table('applications', function (Blueprint $table): void {
                $table->json('engine_usage')->nullable()->after('engine_payload');
            });
        }
    }
};
