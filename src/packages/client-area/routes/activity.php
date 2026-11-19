<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\ActivityLogController;

/*
 * Panel-side activity history. Moved out of the controller's `routes/api.php`
 * into client-area-legacy and back;
 * mounted through `ClientAreaRoutes::group()` either way, so the prefix and the
 * middleware stack stay identical. Only the route name changed.
 */

Route::get('/projects/{application}/logs', [ActivityLogController::class, 'index'])
    ->whereNumber('application')
    // The old route carried `general.view_logs`.
    ->middleware('privilege:general.view_logs')
    ->name('client-area.projects.logs');
