<?php

/*
| Domain change and the panel-side SSL probe. The old
| `GET change-domain/options` read was unprivileged; only the two change routes
| use `general.change_domain`.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\DomainChangeController;

Route::get('/projects/{application}/change-domain/options', [DomainChangeController::class, 'options'])
    ->whereNumber('application')
    ->name('client-area.projects.change_domain.options');
Route::put('/projects/{application}/change-domain/domain', [DomainChangeController::class, 'changeToDomain'])
    ->whereNumber('application')
    ->middleware('privilege:general.change_domain')
    ->name('client-area.projects.change_domain.domain');
Route::put('/projects/{application}/change-domain/subdomain', [DomainChangeController::class, 'changeToSubdomain'])
    ->whereNumber('application')
    ->middleware('privilege:general.change_domain')
    ->name('client-area.projects.change_domain.subdomain');
