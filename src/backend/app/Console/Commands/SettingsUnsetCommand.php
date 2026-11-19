<?php

namespace App\Console\Commands;

use App\Models\Setting;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;

class SettingsUnsetCommand extends Command
{
    protected $signature = 'settings:unset {name}';

    protected $description = 'Remove an application setting';

    /**
     * The entrypoint clears an `engine-api-ca` pin it wrote from the env once
     * the Engine delivers its URL without a certificate;
     * `settings:set` cannot store an empty value, so removing the row is the
     * only way back to the system CA store.
     */
    public function handle(): int
    {
        $name = Payload::string($this->argument('name'));

        $missing = Setting::query()->where('name', $name)->delete() === 0;
        Setting::forget();

        if ($missing) {
            $this->error("Setting not found: {$name}");

            return self::FAILURE;
        }

        $this->info('DONE');

        return self::SUCCESS;
    }
}
