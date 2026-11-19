<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Import watermark for the Engine deploy-hook deliveries.
 *
 * `deploy_logs` retention prunes old rows; without a watermark the next import
 * would re-create them (and re-notify) from the Engine's last few deliveries.
 * The column keeps the newest delivery `created_at` the panel has processed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->timestamp('git_delivery_imported_at')->nullable()->after('git_webhook_id');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('git_delivery_imported_at');
        });
    }
};
