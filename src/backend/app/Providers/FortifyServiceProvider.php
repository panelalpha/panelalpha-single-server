<?php

namespace App\Providers;

use App\Actions\Fortify\ConfirmTwoFactorAuthentication;
use App\Actions\Fortify\ResetUserPassword;
use App\Actions\Fortify\UpdateUserPassword;
use App\Http\Responses\PasswordResetRefusedResponse;
use App\Http\Responses\TwoFactorCodeRefusedResponse;
use App\Models\User;
use App\Services\Account\DeviceService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Fortify\Actions\ConfirmTwoFactorAuthentication as FortifyConfirmTwoFactorAuthentication;
use Laravel\Fortify\Contracts\FailedPasswordResetResponse;
use Laravel\Fortify\Contracts\FailedTwoFactorLoginResponse;
use Laravel\Fortify\Contracts\PasswordConfirmedResponse;
use Laravel\Fortify\Contracts\PasswordUpdateResponse;
use Laravel\Fortify\Contracts\ResetsUserPasswords;
use Laravel\Fortify\Contracts\TwoFactorConfirmedResponse;
use Laravel\Fortify\Contracts\TwoFactorDisabledResponse;
use Laravel\Fortify\Contracts\TwoFactorEnabledResponse;
use Laravel\Fortify\Contracts\UpdatesUserPasswords;
use Laravel\Fortify\Events\ValidTwoFactorAuthenticationCodeProvided;
use Laravel\Fortify\Fortify;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Wires Fortify into the Client Area (sections A/B).
 *
 * Fortify's own routes are ignored: its 2FA endpoints live under `/user/…`
 * which collides with `PUT /api/user/password`, so the routes are registered
 * explicitly in routes/api.php with the exact old-panel paths. Response and
 * action bindings make Fortify's controllers behave like the old panel.
 */
class FortifyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        Fortify::ignoreRoutes();

        $this->app->bind(ResetsUserPasswords::class, ResetUserPassword::class);
        $this->app->bind(UpdatesUserPasswords::class, UpdateUserPassword::class);
        // The confirm endpoint injects the action directly, so the binding is
        // what swaps its validation message (see the class).
        $this->app->bind(FortifyConfirmTwoFactorAuthentication::class, ConfirmTwoFactorAuthentication::class);
    }

    public function boot(): void
    {
        // Login is handled by App\Http\Controllers\AuthController.
        Fortify::loginView(fn () => abort(404));

        $this->registerRateLimiters();
        $this->registerResponseBindings();
        $this->markPasswordConfirmedAfterTwoFactorChallenge();
    }

    /**
     * Completing the 2FA challenge is itself proof of the
     * password (it came right after `POST /login`), so mark the session
     * password-confirmed. This keeps the CA's recovery-code regeneration – run
     * immediately after a recovery-code login – working once
     * `require_password_for_2fa` is on. The event listener runs inside the
     * request, where the session is available (the response is built after it).
     */
    private function markPasswordConfirmedAfterTwoFactorChallenge(): void
    {
        Event::listen(ValidTwoFactorAuthenticationCodeProvided::class, function (ValidTwoFactorAuthenticationCodeProvided $event): void {
            if (request()->hasSession()) {
                /** @var \Illuminate\Session\Store $session */
                $session = request()->session();
                $session->passwordConfirmed();
            }

            // The old panel's Login listener recorded the device login for the
            // password and the 2FA path alike. Devices are a
            // panel-user feature: another authenticatable completing its own
            // challenge (a paid edition's admin) records none.
            if ($event->user instanceof User) {
                app(DeviceService::class)->touch($event->user, request());
            }
        });
    }

    private function registerRateLimiters(): void
    {
        // The CA asks for the password in a second request (`{email}` alone
        // answers `use_password`), so only a submitted password is one of the
        // five attempts; the e-mail step gets its own, looser bucket per IP.
        RateLimiter::for('login', function (Request $request): Limit {
            if ($request->routeIs('login') && ! $request->filled('password')) {
                // The IP comes first so this key cannot equal an `email|ip` one.
                return Limit::perMinute(20)->by(($request->ip() ?? '').'|email-step');
            }

            return Limit::perMinute(5)->by(
                mb_strtolower(Payload::string($request->input('email'))).'|'.($request->ip() ?? ''),
            );
        });

        // A stateless request (no Origin/Referer) has no session at all.
        RateLimiter::for('two-factor', function (Request $request): Limit {
            $loginId = $request->hasSession() ? Payload::string($request->session()->get('login.id')) : '';

            return Limit::perMinute(5)->by(
                $loginId !== '' ? $loginId : 'no-login|'.($request->ip() ?? ''),
            );
        });
    }

    private function registerResponseBindings(): void
    {
        // Password change success: the CA only checks the 2xx status.
        $this->app->bind(PasswordUpdateResponse::class, fn () => new class implements PasswordUpdateResponse
        {
            public function toResponse($request): JsonResponse
            {
                return new JsonResponse(['success' => true]);
            }
        });

        // A refused reset (an unknown address or a bad token) gets one answer, so
        // the form cannot tell which addresses have an account.
        $this->app->bind(FailedPasswordResetResponse::class, PasswordResetRefusedResponse::class);

        // A wrong 2FA code answers the words the guide quotes, the same ones
        // the My Account dialog shows.
        $this->app->bind(FailedTwoFactorLoginResponse::class, TwoFactorCodeRefusedResponse::class);

        // Password confirmation success: the CA retries the original request on
        // any 2xx, so return 200 (Fortify's default is 201) to match the old
        // panel's plain success response.
        $this->app->bind(PasswordConfirmedResponse::class, fn () => new class implements PasswordConfirmedResponse
        {
            public function toResponse($request): JsonResponse
            {
                return new JsonResponse('', 200);
            }
        });

        // Enabling/confirming/disabling 2FA regenerates the session
        //The only change from Fortify's reply.
        $this->app->bind(TwoFactorEnabledResponse::class, fn () => new class implements TwoFactorEnabledResponse
        {
            public function toResponse($request): JsonResponse
            {
                $request->session()->regenerate();

                return new JsonResponse('', 200);
            }
        });
        $this->app->bind(TwoFactorConfirmedResponse::class, fn () => new class implements TwoFactorConfirmedResponse
        {
            public function toResponse($request): JsonResponse
            {
                $request->session()->regenerate();

                return new JsonResponse('', 200);
            }
        });
        $this->app->bind(TwoFactorDisabledResponse::class, fn () => new class implements TwoFactorDisabledResponse
        {
            public function toResponse($request): JsonResponse
            {
                $request->session()->regenerate();

                return new JsonResponse('', 200);
            }
        });
    }
}
