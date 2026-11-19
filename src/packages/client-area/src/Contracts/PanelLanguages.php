<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The panel languages (the host's `resources/lang` folders and their flags),
 * as `/home` sends them in `app.languages` and `app.language_flags`, for
 * packages that send the same lists. The host
 * binds it; the controller binds no default.
 */
interface PanelLanguages
{
    /**
     * Every language code.
     *
     * @return list<string>
     */
    public function codes(): array;

    /**
     * Language code => two-letter flag code, for the languages that have one.
     *
     * @return array<string, string>
     */
    public function flags(): array;
}
