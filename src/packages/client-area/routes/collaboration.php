<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\CollaborationLinkController;

/*
 * Atarim collaboration link: a panel-built URL with
 * no Engine call. Moved from the host's `routes/api.php` into
 * client-area-legacy and later into the controller;
 * the provider mounts this file under `/api` with `api` + `auth`, the host's
 * stack. The old route carried `general.collaboration`; the CA calls
 * `/instances/{id}/collaboration-link`, which axios rewrites to `/projects`.
 */
Route::get('/projects/{application}/collaboration-link', CollaborationLinkController::class)
    ->whereNumber('application')
    ->middleware('privilege:general.collaboration')
    ->name('client-area.projects.collaboration_link');
