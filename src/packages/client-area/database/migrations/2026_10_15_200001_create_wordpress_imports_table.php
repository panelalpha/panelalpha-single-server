<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Since Engine 2.2.0: a WordPress site imported into a classic project the
 * import's domain step created. The Engine runs the import (`POST
 * /wordpress/migrations`); the panel keeps which Engine migration belongs to
 * which project and its last status, for `import_details`,
 * `async_status.installation`, quick-retry and the project delete. `source`
 * holds the start request until the Engine accepted it (the wp-admin password
 * or the plugin token), encrypted, and is cleared then.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wordpress_imports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('application_id')->unique()->constrained('applications')->cascadeOnDelete();
            $table->unsignedBigInteger('engine_migration_id')->nullable();
            $table->string('method', 20);
            $table->string('source_url', 2048);
            $table->string('status', 20);
            $table->text('source')->nullable();
            $table->json('engine_status')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wordpress_imports');
    }
};
