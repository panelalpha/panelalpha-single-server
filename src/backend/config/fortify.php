<?php

use Laravel\Fortify\Features;

/**
 * Fortify backs the Client Area's password reset, password change and
 * two-factor endpoints. Only those features are enabled; registration,
 * e-mail verification and passkeys are not part of the single-server CA.
 *
 * Routes are registered by us (app/Providers/FortifyServiceProvider calls
 * Fortify::ignoreRoutes()) so every path matches the old panel exactly
 * (routes/api.php).
 */
return [

    // v1 has a single user provider/guard; an admin guard is still undecided.
    'guard' => 'web',

    'passwords' => 'users',

    'username' => 'email',

    'email' => 'email',

    'home' => '/',

    'prefix' => '',

    'domain' => null,

    'lowercase_usernames' => false,

    'limiters' => [
        'login' => 'login',
        'two-factor' => 'two-factor',
    ],

    'views' => false,

    'redirects' => [
        'login' => null,
        'logout' => null,
        'password-confirmation' => null,
        'register' => null,
        'email-verification' => null,
        'password-reset' => null,
    ],

    'features' => [
        Features::resetPasswords(),
        Features::updatePasswords(),
        Features::twoFactorAuthentication([
            'confirm' => true,
        ]),
    ],

];
