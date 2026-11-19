<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

/**
 * Base for the host's Client Area controllers. Every `/api` route runs behind
 * `auth`, so the helper hands the host services the
 * guaranteed `App\Models\User` instead of the framework's nullable
 * `Request::user()`. The package mirrors this with
 * `PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser`.
 */
abstract class Controller extends BaseController
{
    protected function authenticatedUser(Request $request): User
    {
        $user = $request->user();

        // Another guard's account (a paid edition's admin) is not a panel user.
        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $user;
    }
}
