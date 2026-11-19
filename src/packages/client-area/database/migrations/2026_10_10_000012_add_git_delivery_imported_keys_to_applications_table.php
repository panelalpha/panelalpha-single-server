<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Delivery keys already notified without a deploy row.
 *
 * The import watermark (`git_delivery_imported_at`) compares with `<`, so a
 * delivery created in the same second as an already imported one stays fresh on
 * the next run. A settled failure without a `deploy_id` has no `deploy_logs` row
 * to skip it, so its `(created_at, commit, outcome)` key is remembered here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->json('git_delivery_imported_keys')->nullable()->after('git_delivery_imported_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('git_delivery_imported_keys');
        });
    }
};
