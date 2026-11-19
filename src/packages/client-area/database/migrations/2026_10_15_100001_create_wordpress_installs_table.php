<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Since Engine 2.2.0, "Install WordPress" on a classic project is a panel job
 * composing the Engine's `wp/*` and `mysql/*` calls, so the panel keeps its
 * state: the CA's `async_status.installation` and retry-install read it (the
 * Engine has no install task for it). `params` holds the install form,
 * encrypted (it carries the admin password), so a retry needs no new input.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wordpress_installs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('application_id')->unique()->constrained('applications')->cascadeOnDelete();
            $table->string('status', 20);
            $table->text('params');
            $table->text('error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_installs');
    }
};
