<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Auth\SocialAuthController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\LangController;
use App\Http\Controllers\NotificationController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Http\Controllers\ConfirmablePasswordController;
use App\Http\Controllers\Auth\ConfirmedPasswordStatusController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Middleware\RequireLoginSession;
use Laravel\Fortify\Http\Controllers\ConfirmedTwoFactorAuthenticationController;
use Laravel\Fortify\Http\Controllers\NewPasswordController;
use Laravel\Fortify\Http\Controllers\PasswordController;
use Laravel\Fortify\Http\Controllers\RecoveryCodeController;
use Laravel\Fortify\Http\Controllers\TwoFactorAuthenticatedSessionController;
use Laravel\Fortify\Http\Controllers\TwoFactorAuthenticationController;
use Laravel\Fortify\Http\Controllers\TwoFactorQrCodeController;
use Laravel\Fortify\Http\Controllers\TwoFactorSecretKeyController;

Route::get('/home', [HomeController::class, 'show']);
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:login')
    ->name('login');

/*
| Social login. Public like the old panel
| (packages/api/routes/api.php:96-97) – the CA shows the buttons when
| /home `app.integrations.auth` is non-empty. The callback is the CA's XHR
| after the provider redirects the browser to the SPA route of the same name.
*/
Route::get('/auth/{provider}/redirect-url', [SocialAuthController::class, 'redirectUrl'])
    ->name('user.social_auth.get_redirect_url');
Route::post('/auth/{provider}/callback', [SocialAuthController::class, 'callback'])
    ->middleware('activity')
    ->defaults('activity', 'user.social_auth_handle_callback')
    ->name('user.social_auth.handle_callback');
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth');
Route::get('/{lang}/translation.json', [LangController::class, 'index']);

/*
| Password reset, password change and two-factor (sections A/B).
|
| Fortify's own routes are ignored (App\Providers\FortifyServiceProvider); the
| paths below match the old panel exactly. The `api` group (Sanctum stateful
| session + CSRF) is applied by bootstrap/app.php, so it is not repeated here;
| `guest`/`auth` are Fortify's normal guards.
*/
Route::post('/forgot-password', [ForgotPasswordController::class, 'store'])
    ->middleware('throttle:6,1')
    ->name('password.email');
Route::middleware(['guest'])->group(function () {
    Route::post('/reset-password', [NewPasswordController::class, 'store'])
        ->name('password.update');
    Route::post('/two-factor-challenge', [TwoFactorAuthenticatedSessionController::class, 'store'])
        ->middleware([RequireLoginSession::class, 'throttle:two-factor'])
        ->name('two-factor.login');
});

Route::middleware(['auth'])->group(function () {
    Route::put('/user/password', [PasswordController::class, 'update'])
        ->name('user-password.update');

    // Password confirmation. The CA calls
    // POST /user/confirm-password on a 423 before retrying the 2FA call.
    Route::post('/user/confirm-password', [ConfirmablePasswordController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('password.confirm');
    Route::get('/user/confirmed-password-status', [ConfirmedPasswordStatusController::class, 'show'])
        ->name('password.confirmed-status');

    // The 2FA routes carry `password.confirm.2fa` (423 without a recent
    // password confirmation; a no-op with REQUIRE_PASSWORD_FOR_2FA=false).
    Route::post('/user/two-factor-authentication', [TwoFactorAuthenticationController::class, 'store'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.enable');
    Route::delete('/user/two-factor-authentication', [TwoFactorAuthenticationController::class, 'destroy'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.disable');
    Route::post('/user/confirmed-two-factor-authentication', [ConfirmedTwoFactorAuthenticationController::class, 'store'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.confirm');
    Route::get('/user/two-factor-qr-code', [TwoFactorQrCodeController::class, 'show'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.qr-code');
    Route::get('/user/two-factor-secret-key', [TwoFactorSecretKeyController::class, 'show'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.secret-key');
    Route::get('/user/two-factor-recovery-codes', [RecoveryCodeController::class, 'index'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.recovery-codes');
    Route::post('/user/two-factor-recovery-codes', [RecoveryCodeController::class, 'store'])
        ->middleware('password.confirm.2fa')
        ->name('two-factor.recovery-codes.store');

    // My account (section B).
    Route::put('/user/edit', [AccountController::class, 'update'])->name('account.update');
    Route::put('/user/edit/email', [AccountController::class, 'updateEmail'])->name('account.email_update');
    Route::put('/user/language', [LangController::class, 'setLanguage'])->name('account.set_language');
    Route::put('/user/dark-mode', [LangController::class, 'setDarkMode'])->name('account.set_dark_mode');

    Route::get('/user/devices', [DeviceController::class, 'index'])->name('account.device.list');
    Route::post('/user/device/forget', [DeviceController::class, 'destroy'])->name('account.device.forget');
    Route::post('/user/device/logout', [DeviceController::class, 'logout'])->name('account.device.logout');

    // Notifications (section B).
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notification.list');
    Route::delete('/notifications', [NotificationController::class, 'clear'])->name('notification.clear');
    Route::put('/notifications/mark-as-read', [NotificationController::class, 'markAsRead'])->name('notification.mark_as_read');
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy'])->name('notification.delete');
});

// Labels and the project routes (/projects, /projects/{application}, …) come
// from the panelalpha/client-area package.

// Connect AI / MCP lives with the Community
// single-user defaults of panelalpha/client-area (`routes/mcp.php`):
// the Engine's root-admin tokens are safe only where one user owns the
// Engine, so the host app never registers those routes.

// The Atarim collaboration link comes from
// panelalpha/client-area (`routes/collaboration.php`);
// the host binds the `AtarimSettings` it reads (AppServiceProvider).
