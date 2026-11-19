<?php

namespace App\Support;

use App\Models\Setting;
use PanelAlpha\ClientArea\Contracts\PanelSettings;

/**
 * The host's `settings` table behind the controller's {@see PanelSettings}
 * contract, for packages that read or change panel settings.
 */
final class PanelSettingsStore implements PanelSettings
{
    public function get(string $name, ?string $default = null): ?string
    {
        return Setting::get($name, $default);
    }

    public function set(string $name, string $value): void
    {
        Setting::set($name, $value);
    }

    public function forget(string ...$names): void
    {
        Setting::query()->whereIn('name', $names)->delete();
        Setting::forget();
    }
}
