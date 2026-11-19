<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\ProjectSharing;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The default {@see ProjectSharing}: the one user owns every project and
 * shares it with nobody – `owned: true`, `owner: null`,
 * `shared_access: []`, the values the project payload always had in Community.
 */
final class SingleUserProjectSharing implements ProjectSharing
{
    public function describe(Application $application, Authenticatable $user): array
    {
        return ['owned' => true, 'owner' => null, 'shared_access' => []];
    }
}
