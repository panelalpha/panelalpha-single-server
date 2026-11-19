<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\ActingAdmin;

/**
 * Community's answer: there is no admin, so the user always acts.
 */
final class NoActingAdmin implements ActingAdmin
{
    public function of(Request $request): ?array
    {
        return null;
    }
}
