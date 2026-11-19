<?php

/*
| The auto-deploy route (the panel registers the provider webhook itself, as
| the old panel did). It was client-area-legacy's until it moved into the controller; its name
| follows the package (`client-area-legacy.*` → `client-area.*`), and
| `ActivityActionMap` records the same action under it.
|
| Mounted in the controller's `ClientAreaRoutes::group()`, so it shares the
| `/api` mount and configured middleware stack. The privilege is the old
| route's `general.manage_git`.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\GitAutoDeployController;

Route::put('/projects/{application}/auto-deploy', [GitAutoDeployController::class, 'toggleAutoDeploy'])
    ->whereNumber('application')
    ->middleware('privilege:general.manage_git')
    ->name('client-area.projects.git.auto_deploy');
