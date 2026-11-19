<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use PanelAlpha\ClientArea\Access\Privileges;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Question 3 of the edition contracts: "what may this user do on this application?"
 *
 * Privilege names are the Client Area's strings (see Privileges). The CA hides
 * buttons for privileges that are missing from the project payload, and the
 * `privilege:` route middleware enforces them server-side.
 *
 * Community: the owner has every privilege in Privileges::ALL. Pro/Multi: role and
 * custom privileges from the user↔application link.
 */
interface AccessResolver
{
    /**
     * @return list<string>
     */
    public function privileges(Authenticatable $user, Application $application): array;

    /**
     * @param  string  $privilege  one of Privileges::ALL
     */
    public function allows(Authenticatable $user, Application $application, string $privilege): bool;

    /**
     * A privilege not tied to one application (old user-level routes, e.g.
     * `POST /services/{id}/domains` → `service.create_instance`).
     * Community: true for every privilege in `Privileges::ALL`.
     *
     * @param  string  $privilege  one of Privileges::ALL
     */
    public function allowsUser(Authenticatable $user, string $privilege): bool;

    /**
     * Users who should be told about the application (websocket notifications
     * after an Engine task finishes, mails).
     *
     * @return Collection<int, PanelUser>
     */
    public function usersFor(Application $application): Collection;
}
