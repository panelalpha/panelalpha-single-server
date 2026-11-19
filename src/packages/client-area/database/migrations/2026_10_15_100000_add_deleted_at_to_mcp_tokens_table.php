<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Since Engine 2.2.0 (`3e9b4b2c5`), the Engine filters its MCP activity log by
 * `token_ids[]` and keeps a deleted token's id on its calls. A token the user
 * deletes keeps its `mcp_tokens` row, soft-deleted, so its `engine_token_id`
 * still selects its calls in the user's log; the gatekeeper and the token list
 * never see a deleted row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mcp_tokens', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('mcp_tokens', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
