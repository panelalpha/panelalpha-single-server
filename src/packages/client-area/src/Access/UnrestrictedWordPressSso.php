<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The default {@see WordPressSsoRestriction}: no panel user is limited to one
 * WordPress user (no shared access).
 */
final class UnrestrictedWordPressSso implements WordPressSsoRestriction
{
    public function wordPressUserIdFor(Authenticatable $user, Application $application): ?int
    {
        return null;
    }
}
