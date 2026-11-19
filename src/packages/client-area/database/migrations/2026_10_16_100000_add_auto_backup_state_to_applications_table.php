<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Whether the panel's default automatic-backup schedule was decided for a
 * project: `null` = undecided, `scheduled`, `skipped` or `failed`. Every row
 * that exists now is `skipped`, which is what limits the default schedule to
 * projects created afterwards. `auto_backup_attempted_at` is the first failed
 * attempt, from which the panel gives up after an hour.
 */
return new class extends Migration
{
    public function up(): void
    {
        // DDL is not transactional on MySQL: a re-run after a failed back-fill must resume.
        if (! Schema::hasColumn('applications', 'auto_backup_state')) {
            Schema::table('applications', function (Blueprint $table): void {
                $table->string('auto_backup_state', 16)->nullable();
            });
        }
        if (! Schema::hasColumn('applications', 'auto_backup_attempted_at')) {
            Schema::table('applications', function (Blueprint $table): void {
                $table->timestamp('auto_backup_attempted_at')->nullable();
            });
        }

        DB::table('applications')->update(['auto_backup_state' => 'skipped']);
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn(['auto_backup_state', 'auto_backup_attempted_at']);
        });
    }
};
