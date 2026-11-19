<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\HubConnectController;

// A guest may connect while the first-run setup is required (`community.hub-access`).
Route::middleware('community.hub-access')->group(function (): void {
    Route::get('/', [HubConnectController::class, 'status'])->name('community.hub.status');
    Route::post('start', [HubConnectController::class, 'start'])->middleware('throttle:community.hub-start')->name('community.hub.start');
    Route::post('complete', [HubConnectController::class, 'complete'])->name('community.hub.complete');
    Route::post('cancel', [HubConnectController::class, 'cancel'])->name('community.hub.cancel');
});
Route::post('disconnect', [HubConnectController::class, 'disconnect'])->middleware('auth')->name('community.hub.disconnect');
