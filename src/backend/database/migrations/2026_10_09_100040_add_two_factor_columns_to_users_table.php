<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fortify's two-factor columns plus the single-server `password_change_required`
 * flag the Client Area reads on /home (sections A/B). Mirrors the old panel's
 * users table so the same Fortify actions work unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable()->after('password');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
            $table->boolean('password_change_required')->default(false)->after('two_factor_confirmed_at');
            $table->boolean('new_device_detection')->default(false)->after('password_change_required');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
                'password_change_required',
                'new_device_detection',
            ]);
        });
    }
};
