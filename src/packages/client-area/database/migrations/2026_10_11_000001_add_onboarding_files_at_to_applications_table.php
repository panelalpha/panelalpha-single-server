<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned files-onboarding marker.
 *
 * The old "still in onboarding" test was "the project has no install row",
 * which matched every live git/WordPress/staging project (only files onboarding
 * and retry-install write install rows), so the onboarding upload/deploy could
 * flip a live site's installation state. The files
 * domain step sets this marker after the Engine create task finished; the
 * onboarding upload/deploy require it and the first accepted deploy clears it.
 * Git/WordPress onboarding, stagings, imported and Engine-created projects are
 * never in files onboarding, so their marker stays null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('onboarding_files_at')->nullable()->after('staging_create_failed_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('onboarding_files_at');
        });
    }
};
