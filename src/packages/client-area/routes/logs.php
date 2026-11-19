<?php

/*
| Log routes for a project: webserver, PHP and WordPress
| logs. Reads keep their old `general.view_*_logs` privileges. The download
| URLs are built by hand by the CA and never rewritten, so `/instances/...`
| aliases are registered too.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\LogsController;

Route::prefix('projects/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/webserver-logs', [LogsController::class, 'webserverIndex'])
            ->middleware('privilege:general.view_webserver_logs')
            ->name('client-area.projects.webserver_logs.index');
        Route::get('/webserver-logs/{filename}', [LogsController::class, 'webserverShow'])
            ->where('filename', '[A-Za-z0-9._-]+')
            ->middleware('privilege:general.view_webserver_logs')
            ->name('client-area.projects.webserver_logs.show');
        Route::get('/webserver-logs/{filename}/download', [LogsController::class, 'webserverDownload'])
            ->where('filename', '[A-Za-z0-9._-]+')
            ->middleware('privilege:general.view_webserver_logs')
            ->name('client-area.projects.webserver_logs.download');

        Route::get('/php-logs', [LogsController::class, 'phpShow'])
            ->middleware('privilege:general.view_php_logs')
            ->name('client-area.projects.php_logs.show');
        Route::get('/php-logs/download', [LogsController::class, 'phpDownload'])
            ->middleware('privilege:general.view_php_logs')
            ->name('client-area.projects.php_logs.download');

        Route::get('/wordpress/logs', [LogsController::class, 'wordpressShow'])
            ->middleware('privilege:wordpress.view_logs')
            ->name('client-area.projects.wordpress_logs.show');
        Route::get('/wordpress/logs/download', [LogsController::class, 'wordpressDownload'])
            ->middleware('privilege:wordpress.view_logs')
            ->name('client-area.projects.wordpress_logs.download');
    });

// The CA's download links use /instances/... and are never rewritten.
Route::prefix('instances/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/webserver-logs/{filename}/download', [LogsController::class, 'webserverDownload'])
            ->where('filename', '[A-Za-z0-9._-]+')
            ->middleware('privilege:general.view_webserver_logs')
            ->name('client-area.instances.webserver_logs.download');
        Route::get('/php-logs/download', [LogsController::class, 'phpDownload'])
            ->middleware('privilege:general.view_php_logs')
            ->name('client-area.instances.php_logs.download');
        Route::get('/wordpress/logs/download', [LogsController::class, 'wordpressDownload'])
            ->middleware('privilege:wordpress.view_logs')
            ->name('client-area.instances.wordpress_logs.download');
    });
