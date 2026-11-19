<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use RuntimeException;

/** The provider answered 401 to a request made with the token. */
final class TokenRefusedException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('The git provider refused the access token.');
    }
}
