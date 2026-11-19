<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned WordPress plugin/theme async state: the Engine runs
 * `wp/*` synchronously and keeps no per-item status, but the CA shows an
 * `async_status` on every plugin/theme row while an install/update runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wordpress_async_status', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->string('type', 16);
            $table->string('name');
            $table->string('action', 16);
            $table->string('status', 16);
            $table->timestamps();

            $table->unique(['application_id', 'type', 'name']);
        });

        Schema::table('applications', function (Blueprint $table): void {
            // Panel-owned WordPress site name; the sync never overwrites it.
            $table->string('site_name')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('site_name');
        });

        Schema::dropIfExists('wordpress_async_status');
    }
};
