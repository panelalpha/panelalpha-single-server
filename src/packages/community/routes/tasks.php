<?php

use Illuminate\Support\Facades\Route;
use PanelAlpha\Community\Http\Controllers\TasksController;

Route::get('/', [TasksController::class, 'index'])->name('community.tasks.index');
