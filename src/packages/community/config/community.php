<?php

return [
    'panel_version' => env('PANELALPHA_VERSION', '2.0.0-beta'),

    /*
     * The entrypoint writes this file when PANELALPHA_USER_EMAIL /
     * PANELALPHA_USER_PASSWORD could not create the first account. While it
     * exists and the panel still has no user, the setup wizard stays closed
     * (SetupState::blocked()) and the login page says what to fix.
     */
    'first_user_failed_marker' => storage_path('first-user-creation-failed'),
];
