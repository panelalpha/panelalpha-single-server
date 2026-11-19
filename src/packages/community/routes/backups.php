<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\BackupSettingsController;

Route::get('/', [BackupSettingsController::class, 'show'])->name('community.backups.show');
Route::put('/', [BackupSettingsController::class, 'update'])->name('community.backups.update');
Route::put('/store', [BackupSettingsController::class, 'updateStore'])->name('community.backups.store');
Route::delete('/store', [BackupSettingsController::class, 'removeStore'])->name('community.backups.store.destroy');
