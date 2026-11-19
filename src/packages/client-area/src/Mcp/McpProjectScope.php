<?php

namespace PanelAlpha\ClientArea\Mcp;

use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\SelfProject;

/**
 * The reach of a user's Connect AI tokens on one Engine: every
 * project of that user – live and staging – and nothing else.
 *
 * The user ↔ project relation is the edition's (`ApplicationRepository`, Community:
 * every project; Pro: the projects linked to the user), read from the mirror
 * only (`refresh: false`), so the scope never calls the Engine. The panel's own
 * project is never in it: the sync already skips it, and it is dropped here
 * again so a repository that returned it could not hand an AI client the
 * panel itself. A project that runs a panel is dropped
 * too, whatever its name and whoever installed it: its mirrored details carry
 * the panel archive's platform or the `PANELALPHA_SELF_PROJECT` override of a
 * `pae` deploy (`Application::isPanelInstallation()`).
 *
 * Never null: a token is always minted scoped, and an empty list means no
 * project (the Engine's `project` marker without names).
 */
final class McpProjectScope
{
    public function __construct(private readonly ApplicationRepository $applications) {}

    /**
     * The sorted, unique Engine usernames the user's tokens on this Engine may reach.
     *
     * @return list<string>
     */
    public function for(PanelUser $user, int $engineId): array
    {
        $usernames = [];
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            if (Payload::int($application->engine_id) !== $engineId) {
                continue;
            }

            $username = Payload::nullableString($application->engine_username);
            if ($username === null || $username === '' || SelfProject::matches($username) || $application->isPanelInstallation()) {
                continue;
            }

            $usernames[] = $username;
        }

        $usernames = array_values(array_unique($usernames));
        sort($usernames, SORT_STRING);

        return $usernames;
    }
}
