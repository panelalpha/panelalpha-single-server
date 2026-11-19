<?php

/*
| Git routes for a project, backed by the Engine
| E:/git/* endpoints. Mutating routes use `general.manage_git` (the old
| privilege); the three reads had no privilege in the old panel.
|
| The git operation log (`git/logs`) and the auto-deploy toggle are in
| `git_history.php` and `git_auto_deploy.php`.
|
| The CA builds some of these by hand; it uses /instances for the git page in
| single-server, but the axios rewrite turns /instances/... into /projects/...,
| and the endpoints below are the /projects form.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\GitController;

Route::prefix('projects/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/git', [GitController::class, 'show'])
            ->name('client-area.projects.git.show');
        Route::get('/git/branches', [GitController::class, 'branches'])
            ->name('client-area.projects.git.branches');
        Route::get('/git/commits', [GitController::class, 'commits'])
            ->name('client-area.projects.git.commits');
        Route::get('/git/env-example', [GitController::class, 'envExample'])
            ->name('client-area.projects.git.env_example');
        Route::post('/git/connect', [GitController::class, 'connect'])
            ->middleware(['privilege:general.manage_git', 'throttle:outbound'])
            ->name('client-area.projects.git.connect');
        Route::get('/git/deploy-key', [GitController::class, 'currentDeployKey'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.deploy_key_show');
        Route::post('/git/deploy-key', [GitController::class, 'deployKey'])
            ->middleware(['privilege:general.manage_git', 'throttle:outbound'])
            ->name('client-area.projects.git.deploy_key');
        Route::delete('/git/deploy-key', [GitController::class, 'deleteDeployKey'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.deploy_key_delete');
        Route::post('/git/deploy', [GitController::class, 'deploy'])
            ->middleware(['privilege:general.manage_git', 'throttle:outbound'])
            ->name('client-area.projects.git.deploy');
        Route::post('/git/disconnect', [GitController::class, 'disconnect'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.disconnect');
        Route::post('/git/repair', [GitController::class, 'repair'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.repair');
        Route::post('/git/pull', [GitController::class, 'pull'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.pull');
        Route::post('/git/push', [GitController::class, 'push'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.push');
        Route::post('/git/revert', [GitController::class, 'revert'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.revert');
        Route::put('/git/credentials', [GitController::class, 'updateCredentials'])
            ->middleware(['privilege:general.manage_git', 'throttle:outbound'])
            ->name('client-area.projects.git.credentials');
        Route::post('/git/drift/ignore', [GitController::class, 'ignoreDrift'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.drift_ignore');
        Route::put('/change-branch', [GitController::class, 'changeBranch'])
            ->middleware('privilege:general.manage_git')
            ->name('client-area.projects.git.change_branch');
    });
