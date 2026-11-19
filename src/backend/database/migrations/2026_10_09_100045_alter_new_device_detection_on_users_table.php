<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `new_device_detection` is a set of signals (old panel enum: "ip, device,
 * browser"…), not a boolean. The previous migration added it as boolean;
 * replace it with a nullable string on the same column (SQLite has no enum).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('new_device_detection');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('new_device_detection', 64)->nullable()->after('password_change_required');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('new_device_detection');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('new_device_detection')->nullable()->after('password_change_required');
        });
    }
};
