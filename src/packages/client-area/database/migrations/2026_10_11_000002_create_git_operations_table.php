<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-side git operation history for a project, created with the
 * `GET /projects/{id}/git/logs` endpoint that needs it.
 *
 * The Engine keeps no git operation history, so the panel records each
 * user-initiated operation (pull / push / revert) with its outcome so the CA's
 * log table can show it. One row per attempt.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('git_operations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('action');
            $table->string('status');
            $table->string('commit_hash', 64)->nullable();
            $table->text('commit_message')->nullable();
            $table->timestamp('commit_at')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['application_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('git_operations');
    }
};
