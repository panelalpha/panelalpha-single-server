<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * The Atarim integration settings the
 * collaboration link needs.
 *
 * The values live in the host's `settings` table (`atarim-enabled`,
 * `atarim-link`), and package code never imports `App\…`, so the host binds
 * this value from its table – the pattern of engine-client's `EngineConnection`
 * The controller's collaboration link reads it (it was
 * client-area-legacy's before); the controller binds no default.
 *
 * $referralLink is the configured Atarim referral link as stored ('' when
 * unset); its last query parameter is the referral id.
 */
final readonly class AtarimSettings
{
    public function __construct(
        public bool $enabled,
        public string $referralLink,
    ) {}
}
