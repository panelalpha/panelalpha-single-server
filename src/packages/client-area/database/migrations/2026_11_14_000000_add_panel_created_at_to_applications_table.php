<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When this panel asked the Engine to create the project (null for a row the
 * sync mirrored for a project another panel or the operator created): what
 * panel-wide project defaults, such as the automatic-backup schedule, may be
 * applied to.
 *
 * A `pending` row is one the panel created and is still waiting for, so the
 * back-fill is exactly those.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('applications', 'panel_created_at')) {
            Schema::table('applications', function (Blueprint $table): void {
                $table->timestamp('panel_created_at')->nullable();
            });
        }

        DB::table('applications')
            ->whereNull('panel_created_at')
            ->where('status', 'pending')
            ->update(['panel_created_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('panel_created_at');
        });
    }
};
