<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned marker for a staging whose creation failed.
 *
 * The Engine deletes a failed staging destination (`Jobs/CreateStaging::failed`)
 * while the mirror sync would drop any row that is no longer on the Engine, so
 * without this marker the CA loses the staging's retry/delete menu. The marker
 * keeps the row and feeds `async_status.installation = failed` until a retry
 * succeeds or the user deletes the row locally.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('staging_create_failed_at')->nullable()->after('staging_of_id');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('staging_create_failed_at');
        });
    }
};
