<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\SetupController;

Route::post('community/setup', [SetupController::class, 'store'])->name('community.setup.store');
