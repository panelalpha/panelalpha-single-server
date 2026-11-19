<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\ProjectLabelController;

/*
 * Panel-only labels on one project. They moved from
 * `routes/api.php` into client-area-legacy and
 * came back as a Client Area feature. Mounted through
 * `ClientAreaRoutes::group()` as before, so the prefix and the middleware stack
 * (`activity`, `privilege:`) stay identical; only the names changed.
 */

// Labels on one project (panel-only).
Route::post('/projects/{application}/labels', [ProjectLabelController::class, 'assign'])
    ->whereNumber('application')
    ->middleware('privilege:general.manage_labels')
    ->name('client-area.projects.labels.assign');

Route::delete('/projects/{application}/labels', [ProjectLabelController::class, 'unassign'])
    ->whereNumber('application')
    ->middleware('privilege:general.manage_labels')
    ->name('client-area.projects.labels.unassign');
