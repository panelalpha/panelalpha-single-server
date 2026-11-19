<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The deploy history comes from the Engine, so
 * the panel keeps no deploy rows. What the Engine cannot list is a watched deploy
 * task that ended without a deploy log of its own – it failed or was cancelled
 * before the log started, or a failed create's rollback deleted the log – whose
 * only record is the end of the task's log (`GET /tasks/{id}/logs`).
 * The watcher stores that tail here, one row per Engine task.
 *
 * Idempotent like the other review-time controller migrations: a re-run on a
 * database that already has the table is a no-op.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('deploy_task_tails')) {
            return;
        }

        Schema::create('deploy_task_tails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->unsignedBigInteger('engine_task_id');
            $table->string('engine_deploy_id')->nullable();
            $table->string('source_type');
            $table->string('status');
            $table->longText('lines')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->unique(['application_id', 'engine_task_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deploy_task_tails');
    }
};
