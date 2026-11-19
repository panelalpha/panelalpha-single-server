<?php

namespace App\Http\Controllers\Auth;

use App\Http\Responses\PasswordResetLinkSentResponse;
use Illuminate\Contracts\Support\Responsable;
use Laravel\Fortify\Fortify;
use Laravel\Fortify\Http\Controllers\PasswordResetLinkController as FortifyPasswordResetLinkController;
use Laravel\Fortify\Http\Requests\SendPasswordResetLinkRequest;

/**
 * POST /forgot-password.
 *
 * Fortify's controller sends the reset link and validates the address. The old
 * `guest` middleware made an authenticated session answer a 302 HTML redirect,
 * which the Client Area (which always sends `Accept: application/json`) reads as
 * a lost response. An authenticated session gets the
 * same JSON success response as a guest, without a link being mailed.
 *
 * Every well-formed address gets this one answer, whatever the broker reports
 * (sent, unknown, throttled), so the form cannot tell whether an account
 * exists. The broker still runs for a guest: for a known address it stores a
 * token and queues the mail (`App\Notifications\ResetPassword`), and it keeps
 * its 60 s throttle, so neither the answer nor the work left in the request
 * depends on the account.
 */
final class ForgotPasswordController extends FortifyPasswordResetLinkController
{
    public function store(SendPasswordResetLinkRequest $request): Responsable
    {
        if ($request->user() === null) {
            $this->broker()->sendResetLink($request->only(Fortify::email()));
        }

        return new PasswordResetLinkSentResponse();
    }
}
