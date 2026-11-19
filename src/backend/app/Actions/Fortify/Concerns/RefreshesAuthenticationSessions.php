<?php

namespace App\Actions\Fortify\Concerns;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The session actions a credential change must take: regenerate the current
 * session, end every other session of the user and rotate the remember token,
 * so a password change or reset logs the other devices out.
 */
trait RefreshesAuthenticationSessions
{
    protected function refreshAuthenticationSessions(mixed $user): void
    {
        if (! $user instanceof User) {
            return;
        }

        $request = request();

        // A stateful Client Area request always has a session; when one is not
        // attached (e.g. a non-stateful caller) there is no current session to
        // keep, so every session row is ended.
        $keep = null;
        if ($request->hasSession()) {
            $request->session()->regenerate();
            $keep = $request->session()->getId();
        }

        $sessions = DB::table('sessions')->where('user_id', $user->getAuthIdentifier());
        if ($keep !== null) {
            $sessions->where('id', '!=', $keep);
        }
        $sessions->delete();

        $token = Str::random(60);
        $user->forceFill(['remember_token' => $token])->save();

        // The current device stays remembered: re-queue its recaller cookie with
        // the new token, as Auth::logoutOtherDevices() does.
        if ($keep !== null && $request->cookies->has($recallerName = Auth::guard('web')->getRecallerName())) {
            Cookie::queue(
                $recallerName,
                Payload::string($user->getAuthIdentifier()).'|'.$token.'|'.Payload::string($user->getAuthPassword()),
                60 * 24 * 365,
            );
        }
    }
}
