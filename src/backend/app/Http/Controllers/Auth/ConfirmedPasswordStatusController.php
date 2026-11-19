<?php

namespace App\Http\Controllers\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * GET /api/user/confirmed-password-status – whether the session's password
 * confirmation is still inside the 2FA gate's window.
 *
 * Fortify's own controller reads `auth.password_timeout`, which is a different
 * value from the gate's; this one reads `auth.password_confirm_2fa_seconds`, so
 * the answer can never disagree with `password.confirm.2fa`. The
 * CA may still pass `?seconds=` to ask about a different window.
 */
final class ConfirmedPasswordStatusController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $lastConfirmation = Payload::int($request->session()->get('auth.password_confirmed_at')) ?? 0;
        $elapsed = now()->unix() - $lastConfirmation;

        $window = Payload::int($request->input('seconds'))
            ?? Payload::int(config('auth.password_confirm_2fa_seconds'))
            ?? 900;

        $confirmed = $elapsed < $window;

        return response()->json(
            ['confirmed' => $confirmed],
            200,
            array_filter(['X-Retry-After' => $confirmed ? $elapsed : null]),
        );
    }
}
