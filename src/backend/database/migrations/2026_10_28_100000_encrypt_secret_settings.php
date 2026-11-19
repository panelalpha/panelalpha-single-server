<?php

use App\Models\Setting;
use Illuminate\Database\Migrations\Migration;
use PanelAlpha\ClientArea\Support\Payload;

/*
 * The Engine token was kept in plaintext in `settings` (entrypoint.sh writes it
 * at every start from PANELALPHA_ENGINE_TOKEN). Seal every secret row
 * (`Setting::ENCRYPTED`) that is still plaintext with the app key; a sealed one
 * is left alone, so the migration can run on any database. Setting::get() reads
 * both forms, so nothing breaks between the code and the migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (Setting::ENCRYPTED as $name) {
            $stored = Payload::nullableString(Setting::query()->where('name', $name)->value('value'));
            if ($stored === null || Setting::isEncrypted($stored)) {
                continue;
            }

            Setting::query()->where('name', $name)->update(['value' => Setting::stored($name, $stored)]);
        }

        Setting::forget();
    }

    public function down(): void
    {
        foreach (Setting::ENCRYPTED as $name) {
            $stored = Payload::nullableString(Setting::query()->where('name', $name)->value('value'));
            if ($stored === null || ! Setting::isEncrypted($stored)) {
                continue;
            }

            Setting::forget();
            $plain = Setting::get($name);
            if ($plain !== null) {
                Setting::query()->where('name', $name)->update(['value' => $plain]);
            }
        }

        Setting::forget();
    }
};
