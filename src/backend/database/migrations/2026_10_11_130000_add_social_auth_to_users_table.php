<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The provider identity social login links to a user.
 * The old panel kept `social_auth` as a JSON column keyed `<slug>_id` /
 * `<slug>_user` (packages/api/app/Models/User.php:787-809); Community has one user,
 * so the column is the link store rather than a lookup key.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('social_auth')->nullable()->after('email_verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('social_auth');
        });
    }
};
