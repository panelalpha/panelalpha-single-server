<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persistent per-Engine "a successful sync happened" marker.
 *
 * `applications.synced_at` cannot answer this: an Engine with zero projects has
 * no rows to look at, and a mirror row can exist without a completed `sync()`
 * (a `mirror()` insert). The synchronizer writes one row per Engine after a
 * successful `GET /projects/all`, so `/home` can tell "never synced" from
 * "synced, no projects".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('engine_sync_states', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('engine_id')->unique();
            $table->timestamp('synced_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('engine_sync_states');
    }
};
