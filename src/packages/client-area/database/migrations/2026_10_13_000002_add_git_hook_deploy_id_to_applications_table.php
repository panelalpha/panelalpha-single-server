<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The hook-deploy follower's per-project marker, the
 * newest finished Engine deploy id it has handled (`Ymd-His-<6 hex>`); null
 * until its first run, which marks the newest deploy without notifying, and ''
 * after a first run that found none.
 *
 * A new column rather than the pushed `git_delivery_imported_at`/`_keys`: those
 * still hold the retired delivery import's watermark and keys from before
 * this follower replaced it, which a deploy-id marker cannot tell apart from its own state –
 * reading them would replay every hook deploy since that old watermark.
 *
 * Idempotent: the column is added only when it is missing. Dated before the
 * controller's `2026_10_13_100001_apply_schema_rules_to_activity_logs_table`,
 * which must sort after every legacy migration (`ActivityLogSchemaTest`); an
 * upgraded panel still runs it, as every migration it has not run yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('applications', 'git_hook_deploy_id')) {
            return;
        }

        Schema::table('applications', function (Blueprint $table): void {
            $table->string('git_hook_deploy_id', 32)->nullable()->after('git_delivery_imported_keys');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('applications', 'git_hook_deploy_id')) {
            return;
        }

        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('git_hook_deploy_id');
        });
    }
};
