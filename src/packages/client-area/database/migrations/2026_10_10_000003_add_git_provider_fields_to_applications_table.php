<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The git provider side of auto-deploy: the
 * provider the repository lives on, the user's token (encrypted at rest, never
 * returned to the Client Area) and the id of the push webhook the panel
 * registered there. The Engine owns the deploy hook itself; only the provider
 * registration is panel-side.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->string('git_provider', 32)->nullable()->after('git_last_commit_hash');
            $table->text('git_token')->nullable()->after('git_provider');
            $table->string('git_webhook_id')->nullable()->after('git_token');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn(['git_provider', 'git_token', 'git_webhook_id']);
        });
    }
};
