<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * The user-agent parser wrote the string "Undefined" into `devices.browser` and
 * `devices.device` when it recognised neither; the Client Area printed it as
 * the browser and the system. The parser now stores null for that, so the old
 * rows must match it: they are listed until the user forgets them.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['browser', 'device'] as $column) {
            DB::table('devices')->where($column, 'Undefined')->update([$column => null]);
        }
    }

    public function down(): void
    {
        // Nothing to restore: the labels were the absence of a value.
    }
};
