<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The `/mcp` gatekeeper routes a request to the Engine that
 * holds the bearer's token. Each Engine numbers its tokens itself, so in Multi
 * two Engines can hand out the same id; the SHA-256 digest of the plain-text
 * token (taken from the mint answer, as Sanctum keeps one of the secret) tells
 * them apart. The token itself is still never stored; an adopted token has no
 * digest (its plain text never reaches the panel).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mcp_tokens', function (Blueprint $table): void {
            $table->string('token_digest', 64)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('mcp_tokens', function (Blueprint $table): void {
            $table->dropColumn('token_digest');
        });
    }
};
