<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Profile fields the Client Area reads from /home. The old
 * panel kept them on `users`; v1 starts from the bare Laravel skeleton, so
 * they are added here rather than in the committed users migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('company_name')->nullable()->after('last_name');
            $table->string('language', 16)->nullable()->after('company_name');
            $table->boolean('dark_mode')->nullable()->after('language');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name', 'company_name', 'language', 'dark_mode']);
        });
    }
};
