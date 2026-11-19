<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The monitoring events the panel owes PanelAlpha Hub (`HubEvents`, contract
 * §6a), kept until `hub:events` delivers them. `server_id` is the pairing an
 * event was recorded for: it is never sent to another one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hub_events', function (Blueprint $table) {
            $table->id();
            $table->string('server_id', 191)->index();
            $table->string('event_type', 32);
            $table->string('app_id', 64)->nullable();
            $table->string('app_name')->nullable();
            $table->text('reason')->nullable();
            $table->timestamp('occurred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hub_events');
    }
};
