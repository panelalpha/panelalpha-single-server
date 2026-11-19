<?php

namespace App\Support;

use App\Models\Setting;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The panel's public origin from the `userapp.url` setting, falling back to
 * `APP_URL`. `Setting::get` reads the per-request settings map, so this adds no
 * query and never goes stale in a queue worker.
 */
class SettingsPanelUrl implements PanelUrl
{
    public function base(): string
    {
        return rtrim($this->stored() ?? Payload::string(config('app.url')), '/');
    }

    public function stored(): ?string
    {
        $value = Setting::get('userapp.url');

        return is_string($value) && $value !== '' ? $value : null;
    }
}
