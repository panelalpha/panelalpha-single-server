<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\SettingsController;

Route::get('/', [SettingsController::class, 'show'])->name('community.settings.show');
Route::put('/', [SettingsController::class, 'update'])->name('community.settings.update');
Route::put('/url', [SettingsController::class, 'updateUrl'])->name('community.settings.url');
Route::get('/sites-base-domain', [SettingsController::class, 'sitesBaseDomain'])->name('community.settings.sites_base_domain.show');
Route::put('/sites-base-domain', [SettingsController::class, 'updateSitesBaseDomain'])->name('community.settings.sites_base_domain.update');
