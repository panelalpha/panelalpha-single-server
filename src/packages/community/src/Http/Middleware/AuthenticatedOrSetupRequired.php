<?php

namespace PanelAlpha\Community\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Contracts\SetupState;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets a signed-in user through, and a guest only while the first-run setup is
 * still required: the Connect setup runs before any user exists. Every other
 * guest gets the 401 the `auth` middleware gives.
 */
final class AuthenticatedOrSetupRequired
{
    public function __construct(
        private readonly AuthFactory $auth,
        private readonly SetupState $state,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->auth->guard()->check() && ! $this->state->required()) {
            throw new AuthenticationException('Unauthenticated.', []);
        }

        /** @var Response $response */
        $response = $next($request);

        return $response;
    }
}
