<?php

namespace App\Console\Commands;

use App\Models\Setting;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;

class SettingsGetCommand extends Command
{
    protected $signature = 'settings:get {name?}';

    protected $description = 'Get an application setting (omit name to list all)';

    public function handle(): int
    {
        $name = Payload::string($this->argument('name'));

        if ($name === '') {
            $settings = Setting::query()->orderBy('name')->get(['name']);
            if ($settings->isEmpty()) {
                $this->info('No settings.');

                return self::SUCCESS;
            }

            // Through Setting::get(), so a secret reads as its plaintext, not
            // its stored ciphertext.
            $this->table(
                ['Name', 'Value'],
                $settings->map(fn (Setting $setting) => [
                    $setting->name,
                    Setting::get(Payload::string($setting->name)),
                ])->all(),
            );

            return self::SUCCESS;
        }

        $value = Setting::get($name);
        if ($value === null) {
            $this->error("Setting not found: {$name}");

            return self::FAILURE;
        }

        $this->line($value);

        return self::SUCCESS;
    }
}
