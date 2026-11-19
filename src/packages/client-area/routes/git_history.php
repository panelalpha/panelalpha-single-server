<?php

/*
| The git-history route: client-area-legacy's until it moved into the
| controller; its
| name follows the package (`client-area-legacy.*` → `client-area.*`).
|
| Mounted in the controller's `ClientAreaRoutes::group()`, so it shares the
| `/api` mount and configured middleware stack.
| The Engine keeps no git operation history; the panel `git_operations` table
| backs the CA's git log table. Like the old route, the read has no privilege.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\GitHistoryController;

Route::get('/projects/{application}/git/logs', [GitHistoryController::class, 'logs'])
    ->whereNumber('application')
    ->name('client-area.projects.git.logs');
