<?php

/*
| Client Area routes owned by the ClientArea package.
|
| Mounted under /api with config('client-area.route_middleware')
| (default: api + auth). Use {application} for the project id – route binding
| resolves it through ApplicationRepository::findForUser(), so ownership is
| already checked. Add `privilege:<name>` for mutating routes.
|
| The CA sends /projects/... in single-server mode. Register an /instances/...
| alias only for URLs the CA builds by hand (downloads, <img> sources).
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\AppHealthController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ProjectSourceController;
use PanelAlpha\ClientArea\Http\Controllers\Project\DeployController;
use PanelAlpha\ClientArea\Http\Controllers\Project\DnsAlertsController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ImportController;
use PanelAlpha\ClientArea\Http\Controllers\Project\OnboardingController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ScreenshotController;
use PanelAlpha\ClientArea\Http\Controllers\Project\StagingController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ProjectController;
use PanelAlpha\ClientArea\Http\Controllers\Project\ProjectLimitsController;

// Source inspection before a project exists (onboarding). Registered
// before the numeric `{application}` routes; there is no project id here.
// The old panel guarded none of these three with a privilege; they make the
// Engine fetch a user-supplied host, so they are rate-limited.
Route::post('/projects/test-git-url', [OnboardingController::class, 'testGitUrl'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.test_git_url');
Route::post('/projects/git-branches', [OnboardingController::class, 'gitBranches'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.git_branches');
Route::post('/projects/preview-env-example', [OnboardingController::class, 'previewEnvExample'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.preview_env');

// Files-source onboarding: the domain step created the DinD project, so
// these work on `domain_id` (= the project id) before the `{application}`
// routes. The CA builds `/instances/...` and axios rewrites it to `/projects`
// in single-server mode; both spellings are registered (old
// `instance.upload-files` / `instance.deploy`). `upload-files`
// had no privilege; `deploy` checks the user-level `service.create_instance` in
// the `privilege-user:` middleware, so the privilege is enforced **before** the
// FormRequest validation like the old middleware.
Route::post('/projects/upload-files', [OnboardingController::class, 'uploadFiles'])
    ->name('client-area.projects.upload_files');
Route::post('/instances/upload-files', [OnboardingController::class, 'uploadFiles'])
    ->name('client-area.instances.upload_files');
Route::post('/projects/deploy', [OnboardingController::class, 'deploy'])
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.projects.deploy');
Route::post('/instances/deploy', [OnboardingController::class, 'deploy'])
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.instances.deploy');

// Deploy-key onboarding (git-deploy-keys): "Generate key" creates the container
// project without a repository (or reuses the domain step's) and answers it
// with its SSH deploy key; the connect and deploy are the project's `git/*`.
Route::post('/projects/deploy-key', [OnboardingController::class, 'deployKey'])
    ->middleware(['privilege-user:service.create_instance', 'throttle:outbound'])
    ->name('client-area.projects.deploy_key');
Route::post('/instances/deploy-key', [OnboardingController::class, 'deployKey'])
    ->middleware(['privilege-user:service.create_instance', 'throttle:outbound'])
    ->name('client-area.instances.deploy_key');

// "Install WordPress": the Engine has no one-step classic
// install, so the route exists and answers the old-style
// key-0 422 instead of a 404. The old route carried the
// user-level `service.create_instance` privilege.
Route::post('/projects/install', [OnboardingController::class, 'install'])
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.projects.install');

// WordPress import (Engine 2.2.0: the old
// methods except FTP). The old routes (packages/api/routes/api.php:208-216):
// the URL and connection tests and the plugin download had no privilege; the
// domain step and the import checked the user-level `service.create_instance`
// (the `privilege-user:` middleware, before validation), the
// quick-retry the same privilege on the project. The tests make the Engine
// fetch a user-supplied URL, so they are rate-limited. The
// CA links to the plugin download by hand, so its `/instances` alias is
// registered too (the axios rewrite does not apply to an `<a href>`).
Route::get('/projects/import/test-wordpress-url', [ImportController::class, 'testUrl'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.import.test_url');
Route::post('/projects/import/test-wordpress-connection', [ImportController::class, 'testConnection'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.import.test_connection');
Route::get('/projects/import/download-plugin', [ImportController::class, 'downloadPlugin'])
    ->name('client-area.projects.import.download_plugin');
Route::get('/instances/import/download-plugin', [ImportController::class, 'downloadPlugin'])
    ->name('client-area.instances.import.download_plugin');
Route::post('/projects/import/domain', [ImportController::class, 'domain'])
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.projects.import.domain');
Route::post('/projects/import/import', [ImportController::class, 'store'])
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.projects.import.store');
Route::put('/projects/{application}/import/quick-retry', [ImportController::class, 'quickRetry'])
    ->whereNumber('application')
    ->middleware('privilege:service.create_instance')
    ->name('client-area.projects.import.quick_retry');

Route::get('/projects', [ProjectController::class, 'index'])->name('client-area.projects.index');
Route::get('/projects/{application}', [ProjectController::class, 'show'])
    ->whereNumber('application')
    ->name('client-area.projects.show');
Route::delete('/projects/{application}', [ProjectController::class, 'destroy'])
    ->whereNumber('application')
    ->middleware('privilege:general.delete_instance')
    ->name('client-area.projects.destroy');

// Activity log. `/instances/.../logs` is rewritten to `/projects` by the
// CA, so one route serves both.
Route::post('/projects/{application}/staging', [StagingController::class, 'store'])
    ->whereNumber('application')
    ->middleware('privilege:general.create_staging')
    ->name('client-area.projects.staging.store');
Route::put('/projects/{application}/retry-staging/{stagingId}', [StagingController::class, 'retry'])
    ->whereNumber('application')->whereNumber('stagingId')
    ->middleware('privilege:general.create_staging')
    ->name('client-area.projects.staging.retry');
Route::put('/projects/{application}/push-to-live', [StagingController::class, 'pushToLive'])
    ->whereNumber('application')
    ->middleware('privilege:general.push_to_live')
    ->name('client-area.projects.staging.push_to_live');
// The old GET route had no privilege; the push dialog reads the table diff
// before the push.
Route::get('/projects/{application}/push-to-live', [StagingController::class, 'pushToLiveShow'])
    ->whereNumber('application')
    ->name('client-area.projects.staging.push_to_live.show');
Route::put('/projects/{application}/push-to-staging', [StagingController::class, 'pushToStaging'])
    ->whereNumber('application')
    // The old route lacked a privilege; the push deserves one (review D).
    ->middleware('privilege:general.push_to_staging')
    ->name('client-area.projects.staging.push_to_staging');
Route::get('/projects/{application}/push-to-staging', [StagingController::class, 'pushToStagingShow'])
    ->whereNumber('application')
    ->middleware('privilege:general.push_to_staging')
    ->name('client-area.projects.staging.push_to_staging.show');
Route::get('/projects/{application}/staging/pre-check-disk-usage', [StagingController::class, 'preCheck'])
    ->whereNumber('application')
    ->middleware('privilege:general.create_staging')
    ->name('client-area.projects.staging.pre_check');

Route::post('/projects/{application}/copy', [ProjectController::class, 'copy'])
    ->whereNumber('application')
    ->middleware('privilege:general.copy_instance')
    ->name('client-area.projects.copy');

// Deploy actions of custom projects: cancel, upload and
// redeploy. The read side (history and the live view) is
// `routes/deploy_history.php`, read from the Engine.
Route::put('/projects/{application}/retry-install', [DeployController::class, 'retryInstall'])
    ->whereNumber('application')
    ->middleware('privilege:service.create_instance')
    ->name('client-area.projects.retry_install');
Route::post('/projects/{application}/deploy/upload', [DeployController::class, 'upload'])
    ->whereNumber('application')
    ->middleware('privilege:general.redeploy')
    ->name('client-area.projects.deploy.upload');
Route::post('/projects/{application}/redeploy', [DeployController::class, 'redeploy'])
    ->whereNumber('application')
    ->middleware('privilege:general.redeploy')
    ->name('client-area.projects.redeploy');
Route::post('/projects/{application}/deploy-cancel', [DeployController::class, 'cancel'])
    ->whereNumber('application')
    ->middleware('privilege:service.create_instance')
    ->name('client-area.projects.deploy_cancel');

// The six limits (memory, CPU, disk, inodes, disk read and write speed) of one
// project, changed by the client in one request (project-usage). No old route.
Route::put('/projects/{application}/limits', [ProjectLimitsController::class, 'update'])
    ->whereNumber('application')
    ->middleware('privilege:general.manage_limits')
    ->name('client-area.projects.limits.update');

// The Engine's probe of a container project's running application, for the
// deploy warnings next to the "Project Details" tab (InstanceStatusTabAlert.vue).
// A read of the user's own project, as the project itself (no privilege).
Route::get('/projects/{application}/app-health', [AppHealthController::class, 'show'])
    ->whereNumber('application')
    ->name('client-area.projects.app_health');

// What the Engine's inspect and deploy history say about a container project:
// stack, database, last deploy, deploy steps and deploy warnings, for the Source
// card, the redeploy modals and the alert. A read of the user's own project.
Route::get('/projects/{application}/source', [ProjectSourceController::class, 'show'])
    ->whereNumber('application')
    ->name('client-area.projects.source');

// Website screenshot. `/screenshot.jpg` and `/refresh-thumbnail` are
// built by hand by the CA, so register `/instances/...` aliases too.
Route::get('/projects/{application}/screenshot', [ScreenshotController::class, 'show'])
    ->whereNumber('application')
    ->name('client-area.projects.screenshot');
Route::get('/projects/{application}/screenshot.jpg', [ScreenshotController::class, 'jpg'])
    ->whereNumber('application')
    ->name('client-area.projects.screenshot.jpg');
Route::get('/instances/{application}/screenshot.jpg', [ScreenshotController::class, 'jpg'])
    ->whereNumber('application')
    ->name('client-area.instances.screenshot.jpg');
Route::post('/projects/{application}/refresh-thumbnail', [ScreenshotController::class, 'refresh'])
    ->whereNumber('application')
    ->middleware('privilege:general.refresh_thumbnail')
    ->name('client-area.projects.refresh_thumbnail');
Route::post('/instances/{application}/refresh-thumbnail', [ScreenshotController::class, 'refresh'])
    ->whereNumber('application')
    ->middleware('privilege:general.refresh_thumbnail')
    ->name('client-area.instances.refresh_thumbnail');

// The DNS badge's dismiss flag (old DnsController::enableAlerts/disableAlerts,
// no privilege; stored by the panel). The CA calls
// `/instances/{id}/dns/alerts/…` through axios, which rewrites it to /projects.
Route::put('/projects/{application}/dns/alerts/enable', [DnsAlertsController::class, 'enable'])
    ->whereNumber('application')
    ->name('client-area.projects.dns.alerts.enable');
Route::put('/projects/{application}/dns/alerts/disable', [DnsAlertsController::class, 'disable'])
    ->whereNumber('application')
    ->name('client-area.projects.dns.alerts.disable');
