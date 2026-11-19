<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;

/**
 * The Client Area's `/home` payload for a signed-in user (old
 * `AuthController::home()`), which a request that signs the user in answers –
 * the paid sign-up's `/register` and `/verify-code`, as the
 * host's own `/login`. The host owns `/home` and binds this, as it binds
 * {@see PanelSettings}; the controller binds no default.
 */
interface ClientAreaHome
{
    /**
     * @return array<string, mixed>
     */
    public function payloadFor(Authenticatable $user): array;
}
