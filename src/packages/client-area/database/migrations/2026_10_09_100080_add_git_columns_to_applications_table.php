<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned git bookkeeping: the repository URL the user
 * connected and the last commit the panel deployed. The Engine is the source of
 * truth for the live state; these columns survive a disconnect and let the CA
 * show "last deployed" without a live Engine call.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->string('git_source')->nullable()->after('type');
            $table->string('git_last_commit_hash')->nullable()->after('git_source');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn(['git_source', 'git_last_commit_hash']);
        });
    }
};
