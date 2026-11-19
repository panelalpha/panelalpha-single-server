<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\PreviewSsoController;
use PanelAlpha\ClientArea\Http\Controllers\Project\PreviewController;

/*
 * Preview tunnels. The Engine lists and expires `preview`
 * tunnels, so the panel serves them from the Engine (in
 * client-area-legacy before, mounted through
 * the same `ClientAreaRoutes::group()`, so the prefix and middleware stack are
 * unchanged).
 */

Route::prefix('server-accounts/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        // phpMyAdmin preview SSO: the Engine SSO URL's host is swapped for the
        // project's preview tunnel on the main domain.
        Route::post('/mysql/phpmyadmin-preview-sso-url', [PreviewSsoController::class, 'phpmyadminPreviewSso'])
            ->middleware('privilege:hosting.phpmyadmin_sso')
            ->name('client-area.hosting.mysql.phpmyadmin_preview_sso');
    });

Route::prefix('projects/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        // The project preview: every project kind gets the
        // preview tunnel, which forwards the main domain as Host.
        Route::post('/preview', [PreviewController::class, 'preview'])
            ->middleware('privilege:general.preview_instance')
            ->name('client-area.projects.preview');
        // The WordPress admin preview SSO: the WordPress user
        // SSO with its host swapped for the preview tunnel. The CA posts the
        // WP user in the body: {user: <id>}.
        Route::post('/sso-preview-url', [PreviewController::class, 'wordpressSsoPreviewUrl'])
            ->middleware('privilege:wordpress.create_sso_link')
            ->name('client-area.projects.sso_preview_url');
    });
