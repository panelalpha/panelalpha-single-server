<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Local mirror of Engine projects. Present in every edition, so the Client Area
 * always has stable numeric ids and a place for panel-only state.
 *
 * engine_id has no foreign key on purpose: single-engine editions (Community, Pro)
 * use the constant EngineConnection::DEFAULT_ID; Multi-server adds an
 * `engines` table in its own package.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('engine_id')->index();
            $table->unsignedBigInteger('engine_project_id')->nullable();
            $table->string('engine_username', 64);
            $table->string('name')->nullable();
            $table->string('domain')->nullable();
            $table->string('status', 32)->default('active');
            $table->string('type', 32)->nullable();
            $table->foreignId('staging_of_id')->nullable()->constrained('applications')->nullOnDelete();
            $table->json('engine_payload')->nullable();
            $table->timestamp('engine_created_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique(['engine_id', 'engine_username']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applications');
    }
};
