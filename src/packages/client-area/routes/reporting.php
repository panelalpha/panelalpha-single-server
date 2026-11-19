<?php

/*
| Reporting routes for a project, backed by the Engine
| AWStats endpoints. Reads keep the old `general.view_reports` privilege.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\ReportingController;

Route::prefix('projects/{application}/reporting')
    ->whereNumber('application')
    ->middleware('privilege:general.view_reports')
    ->group(function (): void {
        Route::get('/bandwidth/{period}', [ReportingController::class, 'bandwidth'])
            ->whereIn('period', ['last-week', 'last-month', 'last-year'])
            ->name('client-area.projects.reporting.bandwidth');
        Route::get('/visitors/{period}', [ReportingController::class, 'visitors'])
            ->whereIn('period', ['last-week', 'last-month', 'last-year'])
            ->name('client-area.projects.reporting.visitors');
        Route::get('/{type}/{period}', [ReportingController::class, 'breakdown'])
            ->whereIn('period', ['last-week', 'last-month', 'last-year'])
            ->name('client-area.projects.reporting.breakdown');
    });
