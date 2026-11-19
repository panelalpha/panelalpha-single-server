<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * No Engine endpoint is needed: the CA's "DNS
 * alerts" switch is a dismiss flag the old panel only stored on the
 * application (`details.dns_alerts_enabled`, old DnsController::enableAlerts),
 * never an Engine alert, so the panel stores it itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->boolean('dns_alerts_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table): void {
            $table->dropColumn('dns_alerts_enabled');
        });
    }
};
