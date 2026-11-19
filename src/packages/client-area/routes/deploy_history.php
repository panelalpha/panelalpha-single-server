<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\DeployHistoryController;
use PanelAlpha\ClientArea\Projects\DeployHistoryService;

/*
 * Deploy-log history and the live deploy view, read from
 * the Engine's deploy history (in client-area-legacy
 * before, mounted through the same
 * `ClientAreaRoutes::group()`, so the prefix and middleware stack are
 * unchanged). The CA builds the download URL by hand but sends it through axios,
 * which rewrites /instances -> /projects in single-server mode, so only the
 * /projects route exists. The privileges are the old deploy-log reads'.
 *
 * `{logId}` is an Engine deploy id or a stored task tail
 * (`DeployHistoryService::LOG_ID_PATTERN`); it was the panel row's number.
 */

Route::get('/projects/{application}/deploy-logs', [DeployHistoryController::class, 'index'])
    ->whereNumber('application')
    ->middleware('privilege:general.view_logs')
    ->name('client-area.projects.deploy_logs.index');
Route::get('/projects/{application}/deploy-logs/live', [DeployHistoryController::class, 'live'])
    ->whereNumber('application')
    ->middleware('privilege:general.view_logs')
    ->name('client-area.projects.deploy_logs.live');
Route::get('/projects/{application}/deploy-logs/{logId}', [DeployHistoryController::class, 'show'])
    ->whereNumber('application')->where('logId', DeployHistoryService::LOG_ID_PATTERN)
    ->middleware('privilege:general.view_logs')
    ->name('client-area.projects.deploy_logs.show');
Route::get('/projects/{application}/deploy-logs/{logId}/download', [DeployHistoryController::class, 'download'])
    ->whereNumber('application')->where('logId', DeployHistoryService::LOG_ID_PATTERN)
    ->middleware('privilege:general.view_logs')
    ->name('client-area.projects.deploy_logs.download');
