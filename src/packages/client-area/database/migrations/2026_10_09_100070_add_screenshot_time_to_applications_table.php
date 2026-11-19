<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Panel-owned screenshot timestamp. The old panel stored it in the
 * project details; the Engine has no such key, so it belongs on the mirror row.
 * `0` = never refreshed, which the Client Area renders as "no screenshot".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->unsignedBigInteger('screenshot_time')->default(0)->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn('screenshot_time');
        });
    }
};
