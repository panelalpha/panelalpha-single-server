<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What an admin did while signed in as the user (the old
 * `activity_logs.admin_as_user` and `admin_id`,
 * packages/api/database/migrations/2022_05_23_091549_create_activity_logs_table.php:20-22):
 * `admin_as_user` is true for such an entry and null otherwise; `admin_id` is
 * the admin (no foreign key: the admins table belongs to the paid Admin Area,
 * and the entry outlives the admin as it outlives the user).
 */
return new class extends Migration
{
    public function up(): void
    {
        // DDL is not transactional on MySQL: a re-run after a failure must resume.
        if (! Schema::hasColumn('activity_logs', 'admin_id')) {
            Schema::table('activity_logs', function (Blueprint $table): void {
                $table->unsignedBigInteger('admin_id')->nullable();
            });
        }
        if (! Schema::hasColumn('activity_logs', 'admin_as_user')) {
            Schema::table('activity_logs', function (Blueprint $table): void {
                $table->boolean('admin_as_user')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table): void {
            $table->dropColumn(['admin_id', 'admin_as_user']);
        });
    }
};
