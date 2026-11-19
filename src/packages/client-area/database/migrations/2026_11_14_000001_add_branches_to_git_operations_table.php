<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The branches a `branch_change` git operation switched between: the panel
 * keeps no other trace of the pair, so the Deployment log could not say which
 * branch its row changed (the Engine's checkout holds only the current one).
 * Other actions leave both null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('git_operations', function (Blueprint $table) {
            $table->string('branch_from')->nullable()->after('engine_task_id');
            $table->string('branch_to')->nullable()->after('branch_from');
        });
    }

    public function down(): void
    {
        Schema::table('git_operations', function (Blueprint $table) {
            $table->dropColumn(['branch_from', 'branch_to']);
        });
    }
};
