<?php

/*
| Cross-Origin Resource Sharing (Laravel's HandleCors, a global middleware).
|
| Community and the paid product keep the framework default: `api/*` answers any
| origin (`*`) without credentials, so another site can read only what an
| anonymous request sees; the Client Area itself is same-origin.
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
