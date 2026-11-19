<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\GoCatalogController;

Route::get('/', [GoCatalogController::class, 'status'])->name('community.go.status');
Route::get('apps', [GoCatalogController::class, 'apps'])->name('community.go.apps');
Route::get('search', [GoCatalogController::class, 'search'])->name('community.go.search');
Route::get('categories', [GoCatalogController::class, 'categories'])->name('community.go.categories');
Route::get('apps/{slug}', [GoCatalogController::class, 'show'])->name('community.go.app');
