<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned git bookkeeping: the message and time of the commit
 * the panel last deployed, beside `git_last_commit_hash`. The Engine's deploy
 * task details carry only the hash (`Jobs/RebuildProject.php` writes
 * `details.git_commit`), so `WatchDeployLogJob` reads them from the Engine's
 * `git/commits` log and the `GitPresenter` shows them without a live call.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->string('git_last_commit_message')->nullable()->after('git_last_commit_hash');
            $table->timestamp('git_last_commit_at')->nullable()->after('git_last_commit_message');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn(['git_last_commit_message', 'git_last_commit_at']);
        });
    }
};
