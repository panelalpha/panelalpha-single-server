<?php

/*
| Hosting routes. The CA's "server account" is the same
| id as the project in single-server mode, so `{application}` is bound through
| ApplicationRepository (ownership already checked). Read routes keep the old
| privilege names too.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\AccountsController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\ContainerController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\DomainsController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\EnvFileController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\FileManagerController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\HostingInfoController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\MysqlController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\ServiceController;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\ServiceDomainController;

// Services. One virtual service; `{service}` must be its id.
Route::get('/services', [ServiceController::class, 'index'])
    ->name('client-area.hosting.services.index');
Route::get('/services/{service}/instance-options', [ServiceController::class, 'instanceOptions'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.instance_options');

// Onboarding domain step. `verify`/`resolve` are never rewritten,
// so the literal segments are fine here.
Route::get('/services/{service}/domains', [ServiceDomainController::class, 'index'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.domains.index');
// The old route used `privilege:service.create_instance` (a user-level check);
// v1's `privilege:` middleware is application-scoped and no project exists yet,
// so the user-level `privilege-user:` middleware checks it **before** the
// FormRequest validates (old middleware order).
Route::post('/services/{service}/domains', [ServiceDomainController::class, 'store'])
    ->whereNumber('service')
    ->middleware('privilege-user:service.create_instance')
    ->name('client-area.hosting.services.domains.store');
Route::get('/services/{service}/domains/validate', [ServiceDomainController::class, 'validate'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.domains.validate');
Route::get('/services/{service}/domains/verify', [ServiceDomainController::class, 'verify'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.domains.verify');

// Service-level proxy rules. Engine-wide; the service filters to
// the user's projects and enforces `hosting.manage_proxy_routing` on the
// application derived from the rule.
Route::get('/services/{service}/proxy-rules', [ContainerController::class, 'proxyRules'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.proxy_rules.index');
Route::post('/services/{service}/proxy-rules', [ContainerController::class, 'createProxyRule'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.proxy_rules.store');
Route::put('/services/{service}/proxy-rules/{ruleId}', [ContainerController::class, 'updateProxyRule'])
    ->whereNumber('service')->whereNumber('ruleId')
    ->name('client-area.hosting.services.proxy_rules.update');
Route::delete('/services/{service}/proxy-rules/{ruleId}', [ContainerController::class, 'deleteProxyRule'])
    ->whereNumber('service')->whereNumber('ruleId')
    ->name('client-area.hosting.services.proxy_rules.destroy');

// Service-level containers. One group per project; the actions are
// guarded with `hosting.manage_containers` on the resolved {accountId}.
Route::get('/services/{service}/containers', [ContainerController::class, 'containers'])
    ->whereNumber('service')
    ->name('client-area.hosting.services.containers.index');
Route::post('/services/{service}/containers/{accountId}/action', [ContainerController::class, 'containerAction'])
    ->whereNumber('service')->whereNumber('accountId')
    ->name('client-area.hosting.services.containers.action');
Route::post('/services/{service}/containers/{accountId}/{container}/action', [ContainerController::class, 'serviceAction'])
    ->whereNumber('service')->whereNumber('accountId')
    ->name('client-area.hosting.services.containers.service_action');
Route::get('/services/{service}/containers/{accountId}/{container}/logs', [ContainerController::class, 'containerLogs'])
    ->whereNumber('service')->whereNumber('accountId')
    ->name('client-area.hosting.services.containers.logs');

// Env file. The CA addresses it as /server-accounts/{id}/instances/
// {instanceId}/env-file (rewritten to /projects in single-server); both
// segments are accepted and both ids are the same row.
Route::prefix('server-accounts/{application}/{resourceSegment}/{instanceId}/env-file')
    ->whereNumber('application')->whereNumber('instanceId')
    ->whereIn('resourceSegment', ['instances', 'projects'])
    ->middleware('privilege:hosting.manage_env_file')
    ->group(function (): void {
        Route::get('/meta', [EnvFileController::class, 'meta'])
            ->name('client-area.hosting.env_file.meta');
        Route::get('/', [EnvFileController::class, 'show'])
            ->name('client-area.hosting.env_file.show');
        Route::put('/', [EnvFileController::class, 'update'])
            ->name('client-area.hosting.env_file.update');
    });

// File manager. The `fm` SPA calls /api/file-manager/*/{id} with the
// project id; disk/path arrive as query parameters.
Route::prefix('file-manager')
    ->whereNumber('application')
    ->middleware('privilege:hosting.manage_file_manager')
    ->group(function (): void {
        Route::get('/initialize/{application}', [FileManagerController::class, 'initialize'])
            ->name('client-area.file_manager.initialize');
        Route::get('/content/{application}', [FileManagerController::class, 'content'])
            ->name('client-area.file_manager.content');
        Route::post('/upload/{application}', [FileManagerController::class, 'upload'])
            ->name('client-area.file_manager.upload');
        Route::post('/create-directory/{application}', [FileManagerController::class, 'createDirectory'])
            ->name('client-area.file_manager.create_directory');
        Route::post('/create-file/{application}', [FileManagerController::class, 'createFile'])
            ->name('client-area.file_manager.create_file');
        Route::post('/update-file/{application}', [FileManagerController::class, 'updateFile'])
            ->name('client-area.file_manager.update_file');
        Route::post('/delete/{application}', [FileManagerController::class, 'delete'])
            ->name('client-area.file_manager.delete');
        Route::post('/rename/{application}', [FileManagerController::class, 'rename'])
            ->name('client-area.file_manager.rename');
        Route::post('/paste/{application}', [FileManagerController::class, 'paste'])
            ->name('client-area.file_manager.paste');
        Route::post('/zip/{application}', [FileManagerController::class, 'zip'])
            ->name('client-area.file_manager.zip');
        Route::post('/unzip/{application}', [FileManagerController::class, 'unzip'])
            ->name('client-area.file_manager.unzip');
        Route::get('/download/{application}', [FileManagerController::class, 'download'])
            ->name('client-area.file_manager.download');
        // The Audio/VideoPlayerModal source (Range forwarded) and the image
        // PreviewModal source. Thumbnails have no Engine endpoint.
        Route::get('/stream-file/{application}', [FileManagerController::class, 'streamFile'])
            ->name('client-area.file_manager.stream_file');
        Route::get('/preview/{application}', [FileManagerController::class, 'preview'])
            ->name('client-area.file_manager.preview');
        Route::get('/thumbnails/{application}', [FileManagerController::class, 'thumbnails'])
            ->name('client-area.file_manager.thumbnails');
    });

// SSL provider list – not tied to one project, so no application
// privilege (the old route had none); `auth` still applies from the group.
Route::get('/ssl-offer', [HostingInfoController::class, 'sslOffer'])
    ->name('client-area.hosting.ssl_offer');

// Server metrics – whole-Engine figures the CA graphs read.
Route::get('/server/metrics/{period}', [HostingInfoController::class, 'metrics'])
    ->whereIn('period', ['current', 'last-5-minutes', 'last-hour', 'last-12-hours'])
    ->name('client-area.hosting.metrics');

Route::prefix('server-accounts/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        // MySQL. The old reads were unprivileged; the writes keep
        // `hosting.manage_mysql`.
        Route::get('/mysql/databases', [MysqlController::class, 'databases'])
            ->name('client-area.hosting.mysql.databases.index');
        Route::post('/mysql/databases', [MysqlController::class, 'createDatabase'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.databases.store');
        Route::delete('/mysql/databases/{name}', [MysqlController::class, 'deleteDatabase'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.databases.destroy');
        // The CA's rename URL (old `hosting.mysql_database.rename`); the Engine
        // route is `mysql/databases/{db}/rename`.
        Route::put('/mysql/databases/{name}/name', [MysqlController::class, 'renameDatabase'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.databases.rename');
        Route::get('/mysql/server-info', [MysqlController::class, 'serverInfo'])
            ->name('client-area.hosting.mysql.server_info');

        Route::get('/mysql/users', [MysqlController::class, 'users'])
            ->name('client-area.hosting.mysql.users.index');
        Route::post('/mysql/users', [MysqlController::class, 'createUser'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.users.store');
        Route::put('/mysql/users/{name}', [MysqlController::class, 'updateUser'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.users.update');
        Route::delete('/mysql/users/{name}', [MysqlController::class, 'deleteUser'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.users.destroy');

        Route::get('/mysql/privileges/{user}/{database}', [MysqlController::class, 'privileges'])
            ->name('client-area.hosting.mysql.privileges.show');
        Route::put('/mysql/privileges/{user}/{database}', [MysqlController::class, 'updatePrivileges'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.privileges.update');
        Route::delete('/mysql/privileges/{user}/{database}', [MysqlController::class, 'revokePrivileges'])
            ->middleware('privilege:hosting.manage_mysql')
            ->name('client-area.hosting.mysql.privileges.destroy');

        Route::post('/mysql/phpmyadmin-sso-url', [MysqlController::class, 'phpmyadminSso'])
            ->middleware('privilege:hosting.phpmyadmin_sso')
            ->name('client-area.hosting.mysql.phpmyadmin_sso');

        // FTP accounts. The old reads were unprivileged; the writes
        // keep `hosting.manage_ftp`.
        Route::get('/ftp-accounts', [AccountsController::class, 'ftpAccounts'])
            ->name('client-area.hosting.ftp.index');
        Route::post('/ftp-accounts', [AccountsController::class, 'createFtpAccount'])
            ->middleware('privilege:hosting.manage_ftp')
            ->name('client-area.hosting.ftp.store');
        Route::get('/ftp-accounts/server-info', [AccountsController::class, 'ftpServerInfo'])
            ->name('client-area.hosting.ftp.server_info');
        Route::put('/ftp-accounts/{user}', [AccountsController::class, 'updateFtpAccount'])
            ->where('user', '[^/]+')
            ->middleware('privilege:hosting.manage_ftp')
            ->name('client-area.hosting.ftp.update');
        Route::delete('/ftp-accounts/{user}', [AccountsController::class, 'deleteFtpAccount'])
            ->where('user', '[^/]+')
            ->middleware('privilege:hosting.manage_ftp')
            ->name('client-area.hosting.ftp.destroy');

        // SFTP accounts. access_type is always sftp. The
        // old reads were unprivileged; the writes keep `hosting.manage_sftp`.
        Route::get('/sftp-accounts', [AccountsController::class, 'sftpAccounts'])
            ->name('client-area.hosting.sftp.index');
        Route::post('/sftp-accounts', [AccountsController::class, 'createSftpAccount'])
            ->middleware('privilege:hosting.manage_sftp')
            ->name('client-area.hosting.sftp.store');
        Route::get('/sftp-accounts/server-info', [AccountsController::class, 'sftpServerInfo'])
            ->name('client-area.hosting.sftp.server_info');
        // The Engine kills a project's sessions natively
        // (`sftp-accounts/kill-sessions`) but has no per-account
        // access type, so only that action answers a documented 422 instead of
        // 405. Same old privilege as the old routes.
        Route::post('/sftp-accounts/disconnect-all', [AccountsController::class, 'disconnectAllSftpSessions'])
            ->middleware('privilege:hosting.manage_sftp')
            ->name('client-area.hosting.sftp.disconnect_all');
        Route::post('/sftp-accounts/set-access-type', [AccountsController::class, 'setSftpAccessType'])
            ->middleware('privilege:hosting.manage_sftp')
            ->name('client-area.hosting.sftp.set_access_type');
        Route::put('/sftp-accounts/{user}', [AccountsController::class, 'updateSftpAccount'])
            ->middleware('privilege:hosting.manage_sftp')
            ->name('client-area.hosting.sftp.update');
        Route::delete('/sftp-accounts/{user}', [AccountsController::class, 'deleteSftpAccount'])
            ->middleware('privilege:hosting.manage_sftp')
            ->name('client-area.hosting.sftp.destroy');

        // Cron jobs. The list read was unprivileged.
        Route::get('/cron-jobs', [AccountsController::class, 'cronJobs'])
            ->name('client-area.hosting.cron.index');
        Route::post('/cron-jobs', [AccountsController::class, 'createCronJob'])
            ->middleware('privilege:hosting.manage_cron')
            ->name('client-area.hosting.cron.store');
        Route::put('/cron-jobs/{hash}', [AccountsController::class, 'updateCronJob'])
            ->middleware('privilege:hosting.manage_cron')
            ->name('client-area.hosting.cron.update');
        Route::delete('/cron-jobs/{hash}', [AccountsController::class, 'deleteCronJob'])
            ->middleware('privilege:hosting.manage_cron')
            ->name('client-area.hosting.cron.destroy');

        // Usage. The CA calls it in multi-server; cheap to keep.
        Route::get('/usage', [DomainsController::class, 'usage'])
            ->name('client-area.hosting.usage');

        // PHP versions available on the Engine. The old read was
        // unprivileged (only changing the version is guarded).
        Route::get('/php-versions', [DomainsController::class, 'phpVersions'])
            ->name('client-area.hosting.php.versions');

        // Domains. The list read was unprivileged in the old panel.
        Route::get('/domains', [DomainsController::class, 'index'])
            ->name('client-area.hosting.domains.index');
        Route::post('/domains', [DomainsController::class, 'store'])
            ->middleware('privilege:hosting.manage_domains')
            ->name('client-area.hosting.domains.store');
        Route::put('/domains/{domain}', [DomainsController::class, 'update'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.manage_domains')
            ->name('client-area.hosting.domains.update');
        Route::delete('/domains/{domain}', [DomainsController::class, 'destroy'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.manage_domains')
            ->name('client-area.hosting.domains.destroy');
        Route::put('/domains/{domain}/set-as-primary', [DomainsController::class, 'setAsPrimary'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.manage_domains')
            ->name('client-area.hosting.domains.set_as_primary');

        // Domain PHP version + settings. The reads were unprivileged; the writes
        // keep their old privileges.
        Route::get('/domains/{domain}/php-version', [DomainsController::class, 'phpVersion'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->name('client-area.hosting.domains.php_version.show');
        Route::put('/domains/{domain}/php-version', [DomainsController::class, 'setPhpVersion'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.change_php_version')
            ->name('client-area.hosting.domains.php_version.update');
        Route::get('/domains/{domain}/php-settings', [DomainsController::class, 'phpSettings'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->name('client-area.hosting.domains.php_settings.show');
        Route::put('/domains/{domain}/php-settings', [DomainsController::class, 'setPhpSettings'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.manage_php_settings')
            ->name('client-area.hosting.domains.php_settings.update');

        // SSL certificates. The installed/detected reads were unprivileged.
        Route::get('/ssl/certificate/installed', [DomainsController::class, 'installedSslCert'])
            ->name('client-area.hosting.ssl.installed');
        Route::put('/ssl/certificates/install', [DomainsController::class, 'installSslCert'])
            ->middleware('privilege:hosting.manage_ssl')
            ->name('client-area.hosting.ssl.install');
        Route::delete('/ssl/certificates/installed', [DomainsController::class, 'removeSslCert'])
            ->middleware('privilege:hosting.manage_ssl')
            ->name('client-area.hosting.ssl.remove');
        Route::post('/ssl/certificates/order', [DomainsController::class, 'orderSslCert'])
            ->middleware('privilege:hosting.manage_ssl')
            ->name('client-area.hosting.ssl.order');
        Route::post('/ssl/certificates/retry', [DomainsController::class, 'orderSslCert'])
            ->middleware('privilege:hosting.manage_ssl')
            ->name('client-area.hosting.ssl.retry');

        Route::get('/ssl/settings/{domain}', [DomainsController::class, 'sslSettings'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->name('client-area.hosting.ssl.settings.show');
        Route::put('/ssl/settings/{domain}', [DomainsController::class, 'setSslSettings'])
            ->where('domain', '[A-Za-z0-9.-]+')
            ->middleware('privilege:hosting.manage_ssl')
            ->name('client-area.hosting.ssl.settings.update');
    });
