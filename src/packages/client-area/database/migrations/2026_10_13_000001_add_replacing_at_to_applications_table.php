<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned marker for the classic-onboarding git replacement.
 *
 * `ReplaceClassicOnboardingProjectJob` deletes the empty classic project the
 * plain domain step created (`DELETE E:/projects/{u}`) before it creates the
 * container project with the same username and domain. Between those two Engine
 * calls the project is absent from `GET /projects/all`, so a concurrent sync
 * would delete the panel row the CA is still polling. The marker suspends that
 * delete for the job's wall-clock window (plus its maximum backoff), so the row
 * survives the gap and the create lands on the **same** `applications` row (the
 * CA keeps its id). It is cleared when the job ends, and a marker older than the
 * window is ignored (the job was lost).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('replacing_at')->nullable()->after('onboarding_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('replacing_at');
        });
    }
};
