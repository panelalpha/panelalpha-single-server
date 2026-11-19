<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The panel's public origin, as the links it generates need it. The host
 * answers from its settings with `APP_URL` as the fallback; it is read when
 * asked, never cached, so a changed setting shows on the next call.
 */
interface PanelUrl
{
    /**
     * The origin without a trailing slash: the stored URL when it is set, else
     * `APP_URL`.
     */
    public function base(): string;

    /**
     * The raw stored URL, or null when none was saved.
     */
    public function stored(): ?string;
}
