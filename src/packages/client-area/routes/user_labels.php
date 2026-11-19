<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Labels\LabelController;

/*
 * The user's labels (panel-only), next to the per-project label
 * routes in `labels.php`. Moved from the host's `routes/api.php` into
 * client-area-legacy and later into the controller.
 * The host mounted them under `/api` with `api` + `auth` only – no `activity`
 * middleware, so they record no activity – and the provider mounts this file
 * the same way.
 */
Route::get('/labels', [LabelController::class, 'index'])->name('client-area.labels.index');
Route::post('/labels', [LabelController::class, 'store'])->name('client-area.labels.store');
Route::delete('/labels', [LabelController::class, 'destroy'])->name('client-area.labels.destroy');
