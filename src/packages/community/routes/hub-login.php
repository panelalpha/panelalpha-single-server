<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\HubLoginController;

// Guest routes: "Sign in with PanelAlpha" (old `user.hub_login_start`,
// `user.login_from_hub`, routes/api.php:113-116, `throttle:hub-login`).
Route::get('hub-login/start', [HubLoginController::class, 'start'])->name('community.hub_login.start');
Route::post('hub-login', [HubLoginController::class, 'login'])
    ->middleware('activity')
    ->defaults('activity', 'user.login_from_hub')
    ->name('community.hub_login.login');
