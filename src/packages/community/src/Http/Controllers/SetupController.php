<?php

namespace PanelAlpha\Community\Http\Controllers;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\Community\Http\Requests\SetupRequest;
use PanelAlpha\Community\Setup\FirstRunSetup;
use PanelAlpha\Community\Setup\SetupAlreadyDone;

/**
 * The guest endpoint that creates the panel's only user and its server name,
 * then logs that user in.
 */
class SetupController extends Controller
{
    public function store(
        Request $request,
        Container $container,
        SetupState $state,
        FirstUserCreator $creator,
        FirstRunSetup $setup,
    ): JsonResponse {
        // Per request, not at route registration: the edition can change.
        if (! SingleUserMode::active($container)) {
            abort(404);
        }

        // Before the lock: no user may be created that the browser cannot be
        // logged in as.
        if (! $request->hasSession()) {
            return response()->json([
                'message' => 'The panel must be opened at its configured address (APP_URL) to finish the setup.',
            ], 400);
        }

        // The variables were delivered and could not create the account: the
        // operator repairs it, no visitor may take the panel. Before the
        // required() gate, which is false while this holds.
        if ($state->blocked()) {
            return $this->firstUserFailed();
        }

        // Cheap early answer; the authoritative check is repeated under the lock.
        if (! $state->required()) {
            return $this->alreadyDone();
        }

        // After the gates above, so an invalid body cannot mask a 404, 400 or 409.
        Validator::make($request->all(), (new SetupRequest)->rules())->validate();

        try {
            $setup->run(function () use ($request, $creator): Authenticatable {
                $name = $request->string('name')->trim()->toString();

                return $creator->create(
                    $request->string('email')->toString(),
                    $request->string('password')->toString(),
                    $name === '' ? null : $name,
                );
            }, $request->string('server_name')->toString());
        } catch (SetupAlreadyDone) {
            return $this->alreadyDone();
        }

        return response()->json([], 201);
    }

    private function alreadyDone(): JsonResponse
    {
        return response()->json(['message' => 'The setup is already done.'], 409);
    }

    private function firstUserFailed(): JsonResponse
    {
        return response()->json([
            'message' => 'The first account could not be created from PANELALPHA_USER_EMAIL and PANELALPHA_USER_PASSWORD. '
                .'Fix them and restart the panel, or run `php artisan users:create` on the server.',
        ], 409);
    }
}
