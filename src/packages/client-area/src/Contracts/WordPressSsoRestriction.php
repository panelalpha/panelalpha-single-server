<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The WordPress user a panel user may sign in as through SSO on a project, or
 * null for any (old `User::getRestrictedWordpressUserIdForApplication()`: a
 * collaborator whose shared access names a WordPress user is limited to it; the
 * owner never is). The controller's default
 * ({@see \PanelAlpha\ClientArea\Access\UnrestrictedWordPressSso})
 * answers null – Community has no shared access; an edition with shared access
 * binds its own.
 */
interface WordPressSsoRestriction
{
    public function wordPressUserIdFor(Authenticatable $user, Application $application): ?int;
}
