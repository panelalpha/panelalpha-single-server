<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned marker for a staging whose copy is still running.
 *
 * The Engine deletes a failed staging destination, and the mirror sync drops
 * any row that is no longer on the Engine - so a sync between the Engine's
 * failure and the watcher's poll used to delete the row and the CA never got
 * `create_staging_failed` (and lost the retry/delete menu). The marker keeps
 * the row until the watcher records the outcome, which then clears it and
 * either finishes the copy or sets `staging_create_failed_at`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('staging_creating_at')->nullable()->after('staging_create_failed_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('staging_creating_at');
        });
    }
};
