<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;

/**
 * Creates the panel's first user (the Community first-run wizard, community).
 * The host owns the user rules and storage, so it binds this, as it binds
 * {@see PanelSettings}; the controller binds no default.
 */
interface FirstUserCreator
{
    /**
     * @throws ValidationException on an invalid email, a weak password or a duplicate email
     */
    public function create(string $email, string $password, ?string $name): Authenticatable;

    /**
     * Creates the first user with a random password nobody sees: the Connect
     * setup collects no password, and the user sets one later without the
     * current one. Otherwise behaves like {@see create()}.
     *
     * @throws ValidationException on an invalid or duplicate email
     */
    public function createWithGeneratedPassword(string $email, ?string $name = null): Authenticatable;
}
