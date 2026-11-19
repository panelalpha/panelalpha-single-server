<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The login's set-password step (old
 * `AuthController::login()`, packages/api/app/Http/Controllers/AuthController.php:641-646):
 * a user who signed up without a password (old `force_set_password`) is asked
 * for one (`set_password`) instead of the password step, then gets a code by
 * mail (`verify_email`) that `/verify-code` takes to set it. The host's login
 * asks this once the user is found. Community has no sign-up: the controller's
 * default asks nothing; the paid Admin Area binds the sign-up's code flow.
 */
interface LoginPasswordSetup
{
    /**
     * The answer that replaces the login's password step for this user, or
     * null to go on as usual.
     *
     * @return array<string, bool>|null
     *
     * @throws ValidationException the chosen password breaks the panel's policy
     */
    public function answer(Request $request, PanelUser $user, ?string $password): ?array;
}
