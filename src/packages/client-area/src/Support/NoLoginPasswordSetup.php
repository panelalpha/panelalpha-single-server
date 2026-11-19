<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\LoginPasswordSetup;
use PanelAlpha\ClientArea\Contracts\PanelUser;

/**
 * Community's answer: no sign-up, so no set-password step (a Hub-paired user with a
 * generated password signs in through the Hub or after "Forgot password").
 */
final class NoLoginPasswordSetup implements LoginPasswordSetup
{
    public function answer(Request $request, PanelUser $user, ?string $password): ?array
    {
        return null;
    }
}
