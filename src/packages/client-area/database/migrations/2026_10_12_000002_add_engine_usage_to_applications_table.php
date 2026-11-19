<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirrored Engine resource usage (`GET /projects/{u}/usage`) for one project.
 * The project payload has no usage, so the sync
 * keeps the last Engine answer here; `ProjectPresenter` fills the CA `stats`
 * block from it, and `GET /projects/{id}` never calls the Engine for stats.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->json('engine_usage')->nullable()->after('engine_payload');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('engine_usage');
        });
    }
};
