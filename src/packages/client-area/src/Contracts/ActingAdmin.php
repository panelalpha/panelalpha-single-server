<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Http\Request;

/**
 * Who is acting when a Client Area request is logged (old
 * `LogRequests::isAdminAsUser()` and `getAdminId()`,
 * packages/api/app/Http/Middleware/LogRequests.php:300-395): an admin signed in
 * to the user's session by "login as user" makes the entry the admin's
 * (`admin_as_user`), which the user's own logs and last activity leave out.
 * Community has no admin: the controller's default answers nobody; the paid
 * Admin Area binds its `/sso-login` session mark.
 */
interface ActingAdmin
{
    /**
     * Null when the user acts; otherwise the admin's id (null when the
     * admin is no longer signed in to the session but the mark is).
     *
     * @return array{admin_id: int|null}|null
     */
    public function of(Request $request): ?array;
}
