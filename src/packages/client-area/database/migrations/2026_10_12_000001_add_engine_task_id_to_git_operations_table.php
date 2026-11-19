<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Engine task id of an accepted-but-queued git operation: a `POST
 * git/pull|revert` answers 202 + Task on deploy-managed
 * projects, so the panel records the row `in_progress` with the task id and a
 * watcher settles it. A synchronous operation leaves it null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('git_operations', function (Blueprint $table) {
            $table->unsignedBigInteger('engine_task_id')->nullable()->after('status');

            $table->index(['application_id', 'engine_task_id']);
        });
    }

    public function down(): void
    {
        Schema::table('git_operations', function (Blueprint $table) {
            $table->dropIndex(['application_id', 'engine_task_id']);
            $table->dropColumn('engine_task_id');
        });
    }
};
