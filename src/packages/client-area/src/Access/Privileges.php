<?php

namespace PanelAlpha\ClientArea\Access;

use PanelAlpha\ClientArea\Models\Application;

/**
 * Privilege names understood by the Client Area. The project payload carries
 * the list the current user has; the CA shows/hides features with
 * privileges.includes(...) and the `privilege:` middleware enforces them.
 *
 * Names come from the old panel (EnsureUserHasPrivilege::$rolePrivileges).
 *
 * ALL is what an owner gets in a multi-user edition; single-user editions
 * (Community) grant ALL minus MULTI_USER. Privileges for features the Engine cannot back
 * yet are listed in
 * ENGINE_UNSUPPORTED and left out of ALL so the CA hides those buttons.
 */
final class Privileges
{
    /** @var list<string> */
    public const GENERAL = [
        'general.manage_labels',
        'general.refresh_thumbnail',
        'general.change_domain',
        'general.create_staging',
        'general.push_to_live',
        'general.push_to_staging',
        'general.view_logs',
        'general.view_php_logs',
        'general.view_webserver_logs',
        'general.view_reports',
        'general.delete_instance',
        'general.manage_shared_access',
        'general.copy_instance',
        'general.preview_instance',
        'general.collaboration',
        'general.manage_git',
        'general.redeploy',
        'general.manage_users',
        // project-usage: the first privilege with no old-panel counterpart (the
        // old panel let only the admin change a project's limits).
        'general.manage_limits',
    ];

    /** Rights to create/install and to control a running deploy (old panel guards these with `service.create_instance`). */
    public const SERVICE = [
        'service.create_instance',
    ];

    /** @var list<string> */
    public const WORDPRESS = [
        'wordpress.create_sso_link',
        'wordpress.update',
        'wordpress.manage_auto_update',
        'wordpress.manage_backups',
        'wordpress.manage_auto_backup',
        'wordpress.update_site_name',
        'wordpress.clear_cache',
        'wordpress.manage_maintenance_mode',
        'wordpress.manage_debug_mode',
        'wordpress.manage_themes',
        'wordpress.manage_plugins',
        'wordpress.manage_config',
        'wordpress.manage_users',
        'wordpress.manage_search_engine_indexing',
        'wordpress.view_logs',
        'wordpress.view_installation_details',
        'wordpress.manage_mcp',
    ];

    /**
     * The WordPress privileges whose endpoints answer only for a detected
     * WordPress project: `WordPressController` refuses every other project
     * with 422 "This project is not a WordPress installation."
     * A project of another type is not given them, so the CA does not
     * call those endpoints for it – it loads maintenance and debug mode on
     * every project page (views/instance/index.vue:297-298) when the
     * privileges are there. Backups have their own controller and stay. The
     * WordPress error log is withheld too, as the old panel did
     * (`Application::getDisabledPrivileges`): its tab is meaningless on a
     * project that is not WordPress (app-lite#1).
     *
     * @var list<string>
     */
    public const WORDPRESS_ONLY = [
        'wordpress.create_sso_link',
        'wordpress.update',
        'wordpress.manage_auto_update',
        'wordpress.update_site_name',
        'wordpress.clear_cache',
        'wordpress.manage_maintenance_mode',
        'wordpress.manage_debug_mode',
        'wordpress.manage_themes',
        'wordpress.manage_plugins',
        'wordpress.manage_config',
        'wordpress.manage_users',
        'wordpress.manage_search_engine_indexing',
        'wordpress.view_logs',
        'wordpress.view_installation_details',
        'wordpress.manage_mcp',
    ];

    /**
     * Withheld from a container project: the Engine's PHP error log is the
     * host PHP-FPM's (`LogService::phpLogText`), which a project running in
     * its own containers never writes, so the tab could only stay empty
     * (app-lite#1). A classic project, WordPress or not, keeps it.
     *
     * @var list<string>
     */
    public const CLASSIC_ONLY = [
        'general.view_php_logs',
    ];

    /** @var list<string> */
    public const HOSTING = [
        'hosting.manage_domains',
        'hosting.manage_ssl',
        'hosting.manage_ftp',
        'hosting.manage_sftp',
        'hosting.manage_mysql',
        'hosting.manage_cron',
        'hosting.manage_file_manager',
        'hosting.phpmyadmin_sso',
        'hosting.change_php_version',
        'hosting.manage_php_settings',
        'hosting.manage_proxy_routing',
        'hosting.manage_containers',
        'hosting.manage_env_file',
    ];

    /**
     * Only meaningful when an application can have more than one user
     * (Pro, Multi). Single-user editions must not grant them – the CA then
     * hides shared access entirely.
     *
     * @var list<string>
     */
    public const MULTI_USER = [
        'general.manage_shared_access',
    ];

    /**
     * Known to the CA, but the Engine has no API behind them (single-server CA
     * would show a button that cannot work). Re-add to ALL when the gap closes.
     *
     * @var list<string>
     */
    public const ENGINE_UNSUPPORTED = [
        'general.manage_cdn',          // no CDN integration
        'hosting.control_panel_sso',   // no end-user control panel
    ];

    /**
     * The service's DNS and e-mail pages (`/services/{id}/dns/*`,
     * `/services/{id}/email/*`) and the project's Cloudflare page
     * (`/projects/{id}/wordpress/cloudflare/*`): they need the service's DNS
     * or e-mail server, which only the paid product has (the Admin Area's DNS
     * and e-mail servers). The paid access resolver grants them as the old
     * panel did; Community never has a server,
     * so it does not.
     *
     * @var list<string>
     */
    public const SERVICE_SERVERS = [
        'hosting.manage_email',
        'hosting.manage_dns',
        'wordpress.manage_cloudflare',
    ];

    /**
     * Hidden in single-server mode anyway (WP Cloud only). Not granted by any
     * edition today.
     *
     * @var list<string>
     */
    public const NOT_APPLICABLE = [
        'wordpress.manage_edge_cache',
    ];

    /**
     * Everything an owner can have. Single-user editions subtract MULTI_USER.
     *
     * @var list<string>
     */
    public const ALL = [...self::GENERAL, ...self::SERVICE, ...self::WORDPRESS, ...self::HOSTING];

    /**
     * Everything an owner can have in the paid product: `ALL` plus the DNS,
     * e-mail and Cloudflare privileges.
     *
     * @var list<string>
     */
    public const PAID = [...self::ALL, ...self::SERVICE_SERVERS];

    /**
     * The privileges the project payload carries: a project that is not a
     * detected WordPress loses WORDPRESS_ONLY (the same test as the
     * `WordPressController` guard, so a project still being detected is
     * treated as not WordPress), and a container project loses CLASSIC_ONLY.
     *
     * @param  list<string>  $privileges
     * @return list<string>
     */
    public static function forProject(array $privileges, Application $application): array
    {
        if ($application->type !== Application::TYPE_WORDPRESS) {
            $privileges = array_diff($privileges, self::WORDPRESS_ONLY);
        }
        if ($application->isContainer()) {
            $privileges = array_diff($privileges, self::CLASSIC_ONLY);
        }

        return array_values($privileges);
    }
}
