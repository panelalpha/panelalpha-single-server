<?php

namespace App\Support;

use PanelAlpha\ClientArea\Contracts\PanelLanguages;

/**
 * The languages `/home` sends ({@see HomePayload}) behind the controller's
 * {@see PanelLanguages} contract, so a package sends the same lists.
 */
final class PanelLanguageList implements PanelLanguages
{
    public function codes(): array
    {
        return HomePayload::languages();
    }

    public function flags(): array
    {
        return HomePayload::languageFlags(HomePayload::languages());
    }
}
