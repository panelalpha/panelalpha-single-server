<?php

namespace PanelAlpha\ClientArea\Activity;

/**
 * The old Client Area action name for each migrated route (review R10 / S13).
 *
 * The CA translates `activityLog.action.<action>` and switches on `action` to
 * render a payload; the v1 route names would not match, so the panel writes the
 * old names (`user.instance.*`, `user.hosting.*` – the keys of the old
 * `packages/api/routes/api.php`). A route can override this with
 * `->defaults('activity', '…')`; this map is the fallback so the routes stay
 * readable. It mapped the routes client-area-legacy registered
 * (`client-area-legacy.*` names) while the map lived there; the last one, the
 * auto-deploy toggle, moved into the controller and is mapped under its `client-area.*` name to the same action.
 */
final class ActivityActionMap
{
    /** v1 route name → old CA action name. @var array<string, string> */
    private const MAP = [
        // The user's labels (moved from the host into the controller).
        // Their routes carry no `activity`
        // middleware, as on the host, so nothing is recorded; the entries name
        // the old actions (`label.create`, `label.delete`) the renamed routes
        // stand for.
        'client-area.labels.store' => 'user.label.create',
        'client-area.labels.destroy' => 'user.label.delete',

        // Projects.
        'client-area.projects.test_git_url' => 'user.instance.test-git-url',
        'client-area.projects.git_branches' => 'user.instance.git-branches',
        'client-area.projects.preview_env' => 'user.instance.preview-env-example',
        'client-area.projects.upload_files' => 'user.instance.upload-files',
        'client-area.instances.upload_files' => 'user.instance.upload-files',
        'client-area.projects.deploy' => 'user.instance.deploy',
        'client-area.instances.deploy' => 'user.instance.deploy',
        'client-area.projects.deploy_key' => 'user.instance.deploy_key',
        'client-area.instances.deploy_key' => 'user.instance.deploy_key',
        'client-area.projects.install' => 'user.instance.install',
        'client-area.projects.import.test_url' => 'user.instance.import.test_wordpress_url',
        'client-area.projects.import.test_connection' => 'user.instance.import.test_wordpress_connection',
        'client-area.projects.import.download_plugin' => 'user.instance.import.download_plugin',
        'client-area.instances.import.download_plugin' => 'user.instance.import.download_plugin',
        'client-area.projects.import.domain' => 'user.instance.import.create_domain',
        'client-area.projects.import.store' => 'user.instance.import.import_wordpress',
        'client-area.projects.import.quick_retry' => 'user.instance.import.quick_retry_import_wordpress',
        'client-area.projects.dns.alerts.enable' => 'user.instance.dns.enable_alerts',
        'client-area.projects.dns.alerts.disable' => 'user.instance.dns.disable_alerts',
        'client-area.projects.deploy.upload' => 'user.instance.deploy.upload',
        'client-area.projects.redeploy' => 'user.instance.redeploy',
        'client-area.projects.retry_install' => 'user.instance.retry_install',
        // project-usage: no old route; the action is in `OldRouteNames::V1_ONLY`.
        'client-area.projects.limits.update' => 'user.instance.update_limits',
        'client-area.projects.destroy' => 'user.instance.delete',
        // The masked project secrets: the old panel never had a reveal route
        // (it sent the values in the config and installation answers).
        'client-area.projects.wordpress.secrets_reveal' => 'user.instance.secret.reveal',
        'client-area.projects.deploy_cancel' => 'user.instance.deploy_cancel',
        'client-area.projects.refresh_thumbnail' => 'user.instance.refresh_thumbnail',
        'client-area.projects.copy' => 'user.instance.wordpress.copy',
        'client-area.projects.staging.store' => 'user.instance.staging.create',
        'client-area.projects.staging.retry' => 'user.instance.staging.retry_install',
        'client-area.projects.staging.push_to_live' => 'user.instance.staging.push_to_live',
        'client-area.projects.staging.push_to_staging' => 'user.instance.staging.push_to_staging',
        'client-area.instances.refresh_thumbnail' => 'user.instance.refresh_thumbnail',
        'client-area.projects.users.sso_url' => 'user.instance.user.create_sso_url',
        'client-area.projects.wordpress.sso_url' => 'user.instance.create_sso_url',
        'client-area.projects.users.sso_preview_url' => 'user.instance.user.create_sso_preview_url',
        'client-area.projects.sso_preview_url' => 'user.instance.create_sso_preview_url',
        'client-area.projects.preview' => 'user.instance.wordpress.preview',
        'client-area.projects.labels.assign' => 'user.instance.assign_label',
        'client-area.projects.labels.unassign' => 'user.instance.unassign_label',
        'client-area.projects.users.store' => 'user.instance.user.create',
        'client-area.projects.users.destroy' => 'user.instance.user.delete',
        'client-area.projects.users.reset_password' => 'user.instance.user.reset_password',

        // Git.
        'client-area.projects.git.connect' => 'user.instance.git.connect',
        'client-area.projects.git.deploy_key' => 'user.instance.git.deploy_key',
        'client-area.projects.git.deploy_key_delete' => 'user.instance.git.deploy_key.delete',
        'client-area.projects.git.deploy' => 'user.instance.git.deploy',
        'client-area.projects.git.disconnect' => 'user.instance.git.disconnect',
        'client-area.projects.git.repair' => 'user.instance.git.repair',
        'client-area.projects.git.auto_deploy' => 'user.instance.git.auto_deploy',
        'client-area.projects.git.pull' => 'user.instance.git.pull',
        'client-area.projects.git.push' => 'user.instance.git.push',
        'client-area.projects.git.revert' => 'user.instance.git.revert',
        'client-area.projects.git.drift_ignore' => 'user.instance.git.drift.ignore',
        'client-area.projects.git.credentials' => 'user.instance.git.credentials',
        'client-area.projects.git.change_branch' => 'user.instance.git.update',

        // Domain change.
        'client-area.projects.change_domain.domain' => 'user.instance.domain.change_to_own_domain',
        'client-area.projects.change_domain.subdomain' => 'user.instance.domain.change_to_subdomain',

        // Hosting.
        'client-area.hosting.domains.store' => 'user.hosting.domain.create',
        'client-area.hosting.domains.update' => 'user.hosting.domain.update',
        'client-area.hosting.domains.destroy' => 'user.hosting.domain.delete',
        'client-area.hosting.domains.php_version.update' => 'user.hosting.domain.set_php_version',
        'client-area.hosting.domains.php_settings.update' => 'user.hosting.domain.set_php_settings',
        'client-area.hosting.domains.set_as_primary' => 'user.hosting.domain.set_as_primary',
        'client-area.hosting.ssl.install' => 'user.hosting.ssl_certificate.install',
        'client-area.hosting.ssl.order' => 'user.hosting.ssl_certificate.order',
        'client-area.hosting.ssl.retry' => 'user.hosting.ssl_certificate.retry',
        'client-area.hosting.ssl.remove' => 'user.hosting.ssl_certificate.remove',
        'client-area.hosting.ssl.settings.update' => 'user.hosting.domain_ssl_settings.update',
        'client-area.hosting.ftp.store' => 'user.hosting.ftp_account.create',
        'client-area.hosting.ftp.update' => 'user.hosting.ftp_account.update',
        'client-area.hosting.ftp.destroy' => 'user.hosting.ftp_account.delete',
        'client-area.hosting.sftp.store' => 'user.hosting.sftp_account.create',
        'client-area.hosting.sftp.update' => 'user.hosting.sftp_account.update',
        'client-area.hosting.sftp.destroy' => 'user.hosting.sftp_account.delete',
        'client-area.hosting.sftp.disconnect_all' => 'user.hosting.sftp_account.disconnect_all',
        'client-area.hosting.sftp.set_access_type' => 'user.hosting.sftp_account.set_access_type',
        'client-area.hosting.mysql.databases.store' => 'user.hosting.mysql_database.create',
        'client-area.hosting.mysql.databases.destroy' => 'user.hosting.mysql_database.delete',
        'client-area.hosting.mysql.databases.rename' => 'user.hosting.mysql_database.rename',
        'client-area.hosting.mysql.users.store' => 'user.hosting.mysql_user.create',
        'client-area.hosting.mysql.users.update' => 'user.hosting.mysql_user.update',
        'client-area.hosting.mysql.users.destroy' => 'user.hosting.mysql_user.delete',
        'client-area.hosting.mysql.privileges.update' => 'user.hosting.mysql_user_privileges.update',
        'client-area.hosting.mysql.privileges.destroy' => 'user.hosting.mysql_user_privileges.delete',
        'client-area.hosting.mysql.phpmyadmin_sso' => 'user.hosting.mysql.create_phpmyadmin_sso_url',
        'client-area.hosting.mysql.phpmyadmin_preview_sso' => 'user.hosting.mysql.create_phpmyadmin_preview_sso_url',
        'client-area.hosting.cron.store' => 'user.hosting.cron_job.create',
        'client-area.hosting.cron.update' => 'user.hosting.cron_job.update',
        'client-area.hosting.cron.destroy' => 'user.hosting.cron_job.delete',
        'client-area.hosting.env_file.update' => 'user.hosting.env_file.update',
        'client-area.hosting.services.containers.action' => 'user.hosting.service_container.project_action',
        'client-area.hosting.services.containers.service_action' => 'user.hosting.service_container.service_action',
        'client-area.hosting.services.proxy_rules.store' => 'user.hosting.proxy_rule.create',
        'client-area.hosting.services.proxy_rules.update' => 'user.hosting.proxy_rule.update',
        'client-area.hosting.services.proxy_rules.destroy' => 'user.hosting.proxy_rule.delete',
        'client-area.hosting.services.domains.store' => 'user.service.domain.create',

        // File manager.
        'client-area.file_manager.upload' => 'user.hosting.file_manager.upload',
        'client-area.file_manager.delete' => 'user.hosting.file_manager.delete',
        'client-area.file_manager.paste' => 'user.hosting.file_manager.paste',
        'client-area.file_manager.rename' => 'user.hosting.file_manager.rename',
        'client-area.file_manager.create_directory' => 'user.hosting.file_manager.create-directory',
        'client-area.file_manager.create_file' => 'user.hosting.file_manager.create-file',
        'client-area.file_manager.update_file' => 'user.hosting.file_manager.update-file',
        'client-area.file_manager.zip' => 'user.hosting.file_manager.zip',
        'client-area.file_manager.unzip' => 'user.hosting.file_manager.unzip',

        // WordPress.
        'client-area.projects.wordpress.auto_update.update' => 'user.instance.auto_update.update',
        'client-area.projects.wordpress.clear_cache' => 'user.instance.clear_cache',
        'client-area.projects.wordpress.config.store' => 'user.instance.wordpress_config.create',
        'client-area.projects.wordpress.config.update' => 'user.instance.wordpress_config.update',
        'client-area.projects.wordpress.config.destroy' => 'user.instance.wordpress_config.delete',
        'client-area.projects.wordpress.core.update' => 'user.instance.wordpress.update',
        'client-area.projects.wordpress.debug.update' => 'user.instance.debug_mode.update',
        'client-area.projects.wordpress.indexing.update' => 'user.instance.search_engine_indexing.update',
        'client-area.projects.wordpress.maintenance.update' => 'user.instance.maintenance_mode.update',
        'client-area.projects.wordpress.plugins.install' => 'user.instance.plugin.install',
        'client-area.projects.wordpress.plugins.activate' => 'user.instance.plugin.activate',
        'client-area.projects.wordpress.plugins.deactivate' => 'user.instance.plugin.deactivate',
        'client-area.projects.wordpress.plugins.update' => 'user.instance.plugin.update',
        'client-area.projects.wordpress.plugins.destroy' => 'user.instance.plugin.delete',
        'client-area.projects.wordpress.themes.install' => 'user.instance.theme.install',
        'client-area.projects.wordpress.themes.activate' => 'user.instance.theme.activate',
        'client-area.projects.wordpress.themes.update' => 'user.instance.theme.update',
        'client-area.projects.wordpress.themes.destroy' => 'user.instance.theme.delete',
        'client-area.projects.wordpress.site_name' => 'user.instance.update_site_name',
        'client-area.projects.wordpress.users.store' => 'user.instance.wordpress_user.create',
        'client-area.projects.wordpress.users.update' => 'user.instance.wordpress_user.update',
        'client-area.projects.wordpress.users.destroy' => 'user.instance.wordpress_user.delete',
        'client-area.projects.wordpress.users.reset_password' => 'user.instance.wordpress_user.reset_password',
        // Backups (old BackupController/AutomaticBackupController routes).
        'client-area.projects.wordpress.backups.store' => 'user.instance.backup.create',
        'client-area.projects.wordpress.backups.restore' => 'user.instance.backup.restore',
        'client-area.projects.wordpress.backups.destroy' => 'user.instance.backup.delete',
        'client-area.projects.wordpress.automatic_backup.update' => 'user.instance.backup.update_automatic',
    ];

    public static function for(?string $routeName): ?string
    {
        if ($routeName === null) {
            return null;
        }

        return self::MAP[$routeName] ?? null;
    }
}
