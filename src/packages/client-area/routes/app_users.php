<?php

/*
| Application users of a container project, backed by the Engine E:/app/*
| endpoints. The old panel left the reads open and guarded only
| the writes with `general.manage_users`.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\AppUserController;

Route::prefix('projects/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/users', [AppUserController::class, 'index'])
            ->name('client-area.projects.users.index');
        Route::get('/users-roles', [AppUserController::class, 'roles'])
            ->name('client-area.projects.users.roles');
        Route::post('/users', [AppUserController::class, 'store'])
            ->middleware('privilege:general.manage_users')
            ->name('client-area.projects.users.store');
        Route::delete('/users/{userId}', [AppUserController::class, 'destroy'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:general.manage_users')
            ->name('client-area.projects.users.destroy');
        Route::put('/users/{userId}/reset-password', [AppUserController::class, 'resetPassword'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:general.manage_users')
            ->name('client-area.projects.users.reset_password');
        Route::post('/users/{userId}/sso-url', [AppUserController::class, 'ssoUrl'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:general.manage_users')
            ->name('client-area.projects.users.sso_url');
        // The app-user SSO served through the project's preview tunnel
        //Which forwards the main domain as Host.
        Route::post('/users/{userId}/sso-preview-url', [AppUserController::class, 'ssoPreviewUrl'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:general.manage_users')
            ->name('client-area.projects.users.sso_preview_url');
    });
