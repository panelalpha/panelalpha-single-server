<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Account\DeviceService;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\LoginPasswordSetup;

/**
 * The Client Area login flow (/login).
 *
 * Two steps, exactly as the old panel: `{email}` alone answers "use_password",
 * then `{email, password}` either authenticates, starts the two-factor
 * challenge (stashing the challenged user where Fortify's challenge route
 * reads it), or fails validation. Kept out of the controller so the rules
 * (lookup, hashing, 2FA, session keys) live in one testable place.
 *
 * A user found is first offered the edition's set-password step
 * (`LoginPasswordSetup`: the paid sign-up's passwordless user, old
 * `force_set_password`; none in Community), whose answer replaces the password step.
 */
final class LoginService
{
    /** The answer of a request that arrived without the session it needs. */
    public const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Refresh the page and try again.';

    public function __construct(
        private readonly StatefulGuard $guard,
        private readonly DeviceService $devices,
        private readonly LoginPasswordSetup $passwordSetup,
    ) {}

    /**
     * @throws ValidationException wrong credentials
     */
    public function attempt(Request $request, string $email, ?string $password, bool $remember): LoginResult
    {
        // Sanctum only starts a session for a request from a stateful origin
        // (Origin/Referer). A stateless login has nowhere to store the session
        // (`session()` throws "Session store not set on request" and the request
        // answered 500); answer the CA's 422 shape instead.
        if (! $request->hasSession()) {
            throw ValidationException::withMessages([
                'email' => [self::SESSION_EXPIRED_MESSAGE],
            ]);
        }

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [strtolower(trim($email))])
            ->first();

        if ($user === null) {
            if ($password === null || $password === '') {
                return LoginResult::usePassword();
            }

            throw ValidationException::withMessages(['email' => ['These credentials do not match our records.']]);
        }

        $setup = $this->passwordSetup->answer($request, $user, $password);
        if ($setup !== null) {
            return LoginResult::passwordSetup($setup);
        }

        if ($password === null || $password === '') {
            return LoginResult::usePassword();
        }

        if (! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages(['email' => ['These credentials do not match our records.']]);
        }

        if ($user->hasEnabledTwoFactorAuthentication()) {
            $request->session()->put([
                'login.id' => $user->getKey(),
                'login.remember' => $remember,
            ]);

            return LoginResult::twoFactor();
        }

        $this->guard->login($user, $remember);
        $request->session()->regenerate();
        // A fresh password login counts as a confirmation, so
        // the CA's automatic recovery-code regeneration after a recovery-code
        // login keeps working once `require_password_for_2fa` is on.
        /** @var \Illuminate\Session\Store $session */
        $session = $request->session();
        $session->passwordConfirmed();

        // Record `last_login` on the device the CA lists.
        $this->devices->touch($user, $request);

        return LoginResult::authenticated($user);
    }

    public function logout(Request $request): void
    {
        $this->guard->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
