<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Connect AI token ownership: the Engine mints every
 * MCP token for its root admin, so the panel records which user each token it
 * minted belongs to. A token without a row is not a Connect AI token – the
 * `/mcp` gatekeeper refuses it and the token routes never show it.
 *
 * Only ids and the display name are kept: the plain-text token is shown to the
 * user once and never stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        $usersTable = (string) config('client-area.users_table', 'users');

        Schema::create('mcp_tokens', function (Blueprint $table) use ($usersTable): void {
            $table->id();
            $table->foreignId('user_id')->constrained($usersTable)->cascadeOnDelete();
            // No FK: the `engines` table exists only in Multi.
            $table->unsignedBigInteger('engine_id');
            $table->unsignedBigInteger('engine_token_id');
            $table->string('name');
            $table->timestamps();

            $table->unique(['engine_id', 'engine_token_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mcp_tokens');
    }
};
