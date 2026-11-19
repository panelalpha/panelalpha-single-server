<?php

namespace PanelAlpha\ClientArea\Http\Concerns;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/**
 * Every Client Area route runs behind `auth`, so a request
 * that reaches a controller always carries a user. Services and presenters
 * take a non-nullable `Authenticatable`; this helper bridges the framework's
 * nullable `Request::user()` so the static analysers see that guarantee.
 */
trait ResolvesAuthenticatedUser
{
    protected function authenticatedUser(Request $request): Authenticatable
    {
        $user = $request->user();

        if ($user === null) {
            throw new AuthenticationException;
        }

        return $user;
    }
}
