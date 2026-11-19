<?php

/*
| WordPress management for a project, backed by the Engine
| `[wp]` endpoints. Writes keep the old `wordpress.*` privileges; the old reads
| were unprivileged and stay that way.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\BackupController;
use PanelAlpha\ClientArea\Http\Controllers\Project\WordPressController;

Route::prefix('projects/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/wordpress/updates', [WordPressController::class, 'updates'])
            ->name('client-area.projects.wordpress.updates');

        Route::get('/wordpress/maintenance-mode', [WordPressController::class, 'maintenanceMode'])
            ->name('client-area.projects.wordpress.maintenance.show');
        Route::put('/wordpress/maintenance-mode', [WordPressController::class, 'setMaintenanceMode'])
            ->middleware('privilege:wordpress.manage_maintenance_mode')
            ->name('client-area.projects.wordpress.maintenance.update');

        Route::get('/wordpress/debug-mode', [WordPressController::class, 'debugMode'])
            ->name('client-area.projects.wordpress.debug.show');
        Route::put('/wordpress/debug-mode', [WordPressController::class, 'setDebugMode'])
            ->middleware('privilege:wordpress.manage_debug_mode')
            ->name('client-area.projects.wordpress.debug.update');

        Route::get('/wordpress/search-engine-indexing', [WordPressController::class, 'searchEngineIndexing'])
            ->name('client-area.projects.wordpress.indexing.show');
        Route::put('/wordpress/search-engine-indexing', [WordPressController::class, 'setSearchEngineIndexing'])
            ->middleware('privilege:wordpress.manage_search_engine_indexing')
            ->name('client-area.projects.wordpress.indexing.update');

        Route::get('/wordpress/auto-update', [WordPressController::class, 'autoUpdate'])
            ->name('client-area.projects.wordpress.auto_update.show');
        Route::put('/wordpress/auto-update', [WordPressController::class, 'setAutoUpdate'])
            ->middleware('privilege:wordpress.manage_auto_update')
            ->name('client-area.projects.wordpress.auto_update.update');

        Route::get('/wordpress/plugins', [WordPressController::class, 'plugins'])
            ->name('client-area.projects.wordpress.plugins.index');
        Route::get('/wordpress/plugins/new/search/{term}', [WordPressController::class, 'searchPlugins'])
            ->name('client-area.projects.wordpress.plugins.search');
        // The admin's packages (old showFromPackagesList, no privilege): an
        // empty list in Community, the plan's in the paid product.
        Route::get('/wordpress/plugins/new/featured', [WordPressController::class, 'featuredPlugins'])
            ->name('client-area.projects.wordpress.plugins.featured');
        Route::put('/wordpress/plugins/{plugin}/activate', [WordPressController::class, 'activatePlugin'])
            ->where('plugin', '[^/]+')
            ->middleware('privilege:wordpress.manage_plugins')
            ->name('client-area.projects.wordpress.plugins.activate');
        Route::put('/wordpress/plugins/{plugin}/deactivate', [WordPressController::class, 'deactivatePlugin'])
            ->where('plugin', '[^/]+')
            ->middleware('privilege:wordpress.manage_plugins')
            ->name('client-area.projects.wordpress.plugins.deactivate');
        Route::put('/wordpress/plugins/{plugin}/update', [WordPressController::class, 'updatePlugin'])
            ->where('plugin', '[^/]+')
            ->middleware('privilege:wordpress.manage_plugins')
            ->name('client-area.projects.wordpress.plugins.update');
        Route::delete('/wordpress/plugins/{plugin}', [WordPressController::class, 'deletePlugin'])
            ->where('plugin', '[^/]+')
            ->middleware('privilege:wordpress.manage_plugins')
            ->name('client-area.projects.wordpress.plugins.destroy');
        Route::post('/wordpress/plugins/new/{name}/install', [WordPressController::class, 'installPlugin'])
            ->where('name', '[^/]+')
            ->middleware('privilege:wordpress.manage_plugins')
            ->name('client-area.projects.wordpress.plugins.install');

        // The CA builds this one by hand for an `<img>`, so it gets an
        // `/instances/...` alias below (old instance.get_screenshot).
        Route::get('/wordpress/themes/{theme}/screenshot', [WordPressController::class, 'themeScreenshot'])
            ->where('theme', '[A-Za-z0-9._-]+')
            ->name('client-area.projects.wordpress.themes.screenshot');
        Route::get('/wordpress/themes', [WordPressController::class, 'themes'])
            ->name('client-area.projects.wordpress.themes.index');
        Route::get('/wordpress/themes/new/search/{term}', [WordPressController::class, 'searchThemes'])
            ->name('client-area.projects.wordpress.themes.search');
        Route::get('/wordpress/themes/new/featured', [WordPressController::class, 'featuredThemes'])
            ->name('client-area.projects.wordpress.themes.featured');
        Route::put('/wordpress/themes/{theme}/activate', [WordPressController::class, 'activateTheme'])
            ->where('theme', '[^/]+')
            ->middleware('privilege:wordpress.manage_themes')
            ->name('client-area.projects.wordpress.themes.activate');
        Route::put('/wordpress/themes/{theme}/update', [WordPressController::class, 'updateTheme'])
            ->where('theme', '[^/]+')
            ->middleware('privilege:wordpress.manage_themes')
            ->name('client-area.projects.wordpress.themes.update');
        Route::delete('/wordpress/themes/{theme}', [WordPressController::class, 'deleteTheme'])
            ->where('theme', '[^/]+')
            ->middleware('privilege:wordpress.manage_themes')
            ->name('client-area.projects.wordpress.themes.destroy');
        Route::post('/wordpress/themes/new/{name}/install', [WordPressController::class, 'installTheme'])
            ->where('name', '[^/]+')
            ->middleware('privilege:wordpress.manage_themes')
            ->name('client-area.projects.wordpress.themes.install');

        Route::put('/wordpress/update', [WordPressController::class, 'updateCore'])
            ->middleware('privilege:wordpress.update')
            ->name('client-area.projects.wordpress.core.update');

        // Config.
        Route::get('/wordpress/config', [WordPressController::class, 'config'])
            ->name('client-area.projects.wordpress.config.index');
        Route::post('/wordpress/config', [WordPressController::class, 'createConfig'])
            ->middleware('privilege:wordpress.manage_config')
            ->name('client-area.projects.wordpress.config.store');
        Route::put('/wordpress/config/{name}', [WordPressController::class, 'setConfig'])
            ->where('name', '[A-Za-z0-9_]+')
            ->middleware('privilege:wordpress.manage_config')
            ->name('client-area.projects.wordpress.config.update');
        Route::delete('/wordpress/config/{name}', [WordPressController::class, 'deleteConfig'])
            ->where('name', '[A-Za-z0-9_]+')
            ->middleware('privilege:wordpress.manage_config')
            ->name('client-area.projects.wordpress.config.destroy');

        // The value of one masked secret (the database password and the
        // wp-config keys and salts). The same privilege that shows the
        // Installation Details card, a recent password confirmation and a
        // logged request; every attempt is recorded by `log-secret-reveal`.
        Route::post('/secrets/reveal', [WordPressController::class, 'revealSecret'])
            ->middleware(['log-secret-reveal', 'privilege:wordpress.view_installation_details', 'password.confirm', 'throttle:secrets-reveal'])
            ->name('client-area.projects.wordpress.secrets_reveal');

        // Users.
        Route::get('/wordpress/users', [WordPressController::class, 'users'])
            ->name('client-area.projects.wordpress.users.index');
        Route::post('/wordpress/users', [WordPressController::class, 'createUser'])
            ->middleware('privilege:wordpress.manage_users')
            ->name('client-area.projects.wordpress.users.store');
        Route::put('/wordpress/users/{userId}', [WordPressController::class, 'updateUser'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:wordpress.manage_users')
            ->name('client-area.projects.wordpress.users.update');
        Route::delete('/wordpress/users/{userId}', [WordPressController::class, 'deleteUser'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:wordpress.manage_users')
            ->name('client-area.projects.wordpress.users.destroy');
        Route::put('/wordpress/users/{userId}/reset-password', [WordPressController::class, 'resetUserPassword'])
            ->where('userId', '[^/]+')
            ->middleware('privilege:wordpress.manage_users')
            ->name('client-area.projects.wordpress.users.reset_password');
        // The CA posts the WP user in the body: {user: <id|login>}.
        Route::post('/sso-url', [WordPressController::class, 'userSsoUrl'])
            ->middleware('privilege:wordpress.create_sso_link')
            ->name('client-area.projects.wordpress.sso_url');

        Route::put('/wordpress/site-name', [WordPressController::class, 'setSiteName'])
            ->middleware('privilege:wordpress.update_site_name')
            ->name('client-area.projects.wordpress.site_name');
        Route::put('/clear-cache', [WordPressController::class, 'clearCache'])
            ->middleware('privilege:wordpress.clear_cache')
            ->name('client-area.projects.wordpress.clear_cache');

        Route::get('/installation-details', [WordPressController::class, 'installationDetails'])
            ->name('client-area.projects.wordpress.installation_details');
        // Backups. The list and the
        // automatic-backup read were unprivileged; the writes and the item
        // download keep the old WordPress privileges.
        Route::get('/wordpress/backups', [BackupController::class, 'index'])
            ->name('client-area.projects.wordpress.backups.index');
        Route::post('/wordpress/backups', [BackupController::class, 'store'])
            ->middleware('privilege:wordpress.manage_backups')
            ->name('client-area.projects.wordpress.backups.store');
        // The CA builds the download URL by hand (`BackupActionsMixin.js:439`).
        Route::get('/wordpress/backups/{backupId}/item/{itemId}/download', [BackupController::class, 'download'])
            ->whereNumber('backupId')->whereNumber('itemId')
            ->middleware('privilege:wordpress.manage_backups')
            ->name('client-area.projects.wordpress.backups.download');
        Route::put('/wordpress/backups/{backupId}/restore', [BackupController::class, 'restore'])
            ->whereNumber('backupId')
            ->middleware('privilege:wordpress.manage_backups')
            ->name('client-area.projects.wordpress.backups.restore');
        Route::delete('/wordpress/backups/{backupId}', [BackupController::class, 'destroy'])
            ->whereNumber('backupId')
            ->middleware('privilege:wordpress.manage_backups')
            ->name('client-area.projects.wordpress.backups.destroy');
        Route::get('/wordpress/automatic-backup', [BackupController::class, 'automaticBackup'])
            ->name('client-area.projects.wordpress.automatic_backup.show');
        Route::put('/wordpress/automatic-backup', [BackupController::class, 'updateAutomaticBackup'])
            ->middleware('privilege:wordpress.manage_auto_backup')
            ->name('client-area.projects.wordpress.automatic_backup.update');
    });

// The theme screenshot URL is built by hand and never rewritten.
Route::get('/instances/{application}/wordpress/themes/{theme}/screenshot', [WordPressController::class, 'themeScreenshot'])
    ->whereNumber('application')
    ->where('theme', '[A-Za-z0-9._-]+')
    ->name('client-area.instances.wordpress.themes.screenshot');

// The backup item download is opened by hand (`window.open`), so it never goes
// through the axios interceptor that rewrites `/instances` to `/projects` – this
// alias is what the CA actually hits.
Route::get('/instances/{application}/wordpress/backups/{backupId}/item/{itemId}/download', [BackupController::class, 'download'])
    ->whereNumber('application')->whereNumber('backupId')->whereNumber('itemId')
    ->middleware('privilege:wordpress.manage_backups')
    ->name('client-area.instances.wordpress.backups.download');
