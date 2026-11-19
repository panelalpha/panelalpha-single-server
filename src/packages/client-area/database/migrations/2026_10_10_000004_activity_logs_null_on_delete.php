<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The activity log keeps the acting user's rows when a project is deleted
 *A cascade removes the project's whole history, and the delete
 * request's own row then cannot reference the gone project. `nullOnDelete`
 * keeps the rows with `application_id = null`, which is what the delete request
 * writes (with an Application snapshot in the payload).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table): void {
            $table->dropForeign(['application_id']);
            $table->foreign('application_id')->references('id')->on('applications')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table): void {
            $table->dropForeign(['application_id']);
            $table->foreign('application_id')->references('id')->on('applications')->cascadeOnDelete();
        });
    }
};
