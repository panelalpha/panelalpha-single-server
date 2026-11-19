<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned onboarding marker for the plain (classic) domain step.
 *
 * The CA's git path does not send a `source_type` in the domain step
 * (`OnboardingModalWrapper.vue:1561-1572`), so that step creates a classic
 * project; the Engine then refuses to attach a git source to a classic project
 * (`SourceAttacher::assertEligible`). The marker lets `POST /projects/deploy`
 * recognise the project the domain step created before it was deployed, so the
 * background job can replace it with a container project. It is set only for
 * the classic domain step and cleared when that project is deployed or
 * replaced; the files source keeps its own `onboarding_files_at` marker.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('onboarding_at')->nullable()->after('onboarding_files_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('onboarding_at');
        });
    }
};
