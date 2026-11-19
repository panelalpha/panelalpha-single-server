/**
 * The union of the app and app-lite privilege constants. The API sends privileges as these strings.
 * app-lite differs in two keys: `MANAGE_USERS` is `general.manage_users` there and `wordpress.manage_users` in app
 * (kept here as `MANAGE_WORDPRESS_USERS`, the name lite gives it), so both exist as separate constants.
 */
export const PRIVILEGES = {
  MANAGE_LABELS: 'general.manage_labels',
  REFRESH_THUMBNAIL: 'general.refresh_thumbnail',
  CHANGE_DOMAIN: 'general.change_domain',
  CREATE_STAGING: 'general.create_staging',
  PUSH_TO_LIVE: 'general.push_to_live',
  PUSH_TO_STAGING: 'general.push_to_staging',
  VIEW_LOGS: 'general.view_logs',
  VIEW_PHP_LOGS: 'general.view_php_logs',
  VIEW_WEBSERVER_LOGS: 'general.view_webserver_logs',
  VIEW_REPORTS: 'general.view_reports',
  MANAGE_CDN: 'general.manage_cdn',
  DELETE_INSTANCE: 'general.delete_instance',
  COPY_INSTANCE: 'general.copy_instance',
  MANAGE_SHARED_ACCESS: 'general.manage_shared_access',
  PREVIEW_INSTANCE: 'general.preview_instance',
  COLLABORATION: 'general.collaboration',
  MANAGE_GIT: 'general.manage_git',
  MANAGE_LIMITS: 'general.manage_limits',
  // app-lite only
  REDEPLOY: 'general.redeploy',
  MANAGE_GENERAL_USERS: 'general.manage_users',
  MANAGE_ENV_FILE: 'hosting.manage_env_file',
  MANAGE_PROXY_ROUTING: 'hosting.manage_proxy_routing',
  MANAGE_CONTAINERS: 'hosting.manage_containers',

  CREATE_SSO_LINK: 'wordpress.create_sso_link',
  WORDPRESS_UPDATE: 'wordpress.update',
  MANAGE_AUTO_UPDATE: 'wordpress.manage_auto_update',
  MANAGE_BACKUPS: 'wordpress.manage_backups',
  MANAGE_AUTO_BACKUP: 'wordpress.manage_auto_backup',
  UPDATE_SITE_NAME: 'wordpress.update_site_name',
  CLEAR_CACHE: 'wordpress.clear_cache',
  MANAGE_MAINTENANCE_MODE: 'wordpress.manage_maintenance_mode',
  MANAGE_DEBUG_MODE: 'wordpress.manage_debug_mode',
  MANAGE_THEMES: 'wordpress.manage_themes',
  MANAGE_PLUGINS: 'wordpress.manage_plugins',
  MANAGE_CONFIG: 'wordpress.manage_config',
  MANAGE_WORDPRESS_USERS: 'wordpress.manage_users',
  MANAGE_EDGE_CACHE: 'wordpress.manage_edge_cache',
  MANAGE_SEARCH_ENGINE_INDEXING: 'wordpress.manage_search_engine_indexing',
  WORDPRESS_VIEW_LOGS: 'wordpress.view_logs',
  VIEW_INSTALLATION_DETAILS: 'wordpress.view_installation_details',
  MANAGE_CLOUDFLARE: 'wordpress.manage_cloudflare',
  MANAGE_MCP: 'wordpress.manage_mcp',

  MANAGE_EMAIL: 'hosting.manage_email',
  MANAGE_DNS: 'hosting.manage_dns',
  MANAGE_DOMAINS: 'hosting.manage_domains',
  MANAGE_SSL: 'hosting.manage_ssl',
  MANAGE_FTP: 'hosting.manage_ftp',
  MANAGE_SFTP: 'hosting.manage_sftp',
  MANAGE_MYSQL: 'hosting.manage_mysql',
  MANAGE_CRON: 'hosting.manage_cron',
  MANAGE_FILE_MANAGER: 'hosting.manage_file_manager',
  CONTROL_PANEL_SSO: 'hosting.control_panel_sso',
  PHPMYADMIN_SSO: 'hosting.phpmyadmin_sso',
  CHANGE_PHP_VERSION: 'hosting.change_php_version',
  MANAGE_PHP_SETTINGS: 'hosting.manage_php_settings',
} as const

/** A missing list has no privileges. */
export function checkPrivilege (privileges: readonly string[] | null | undefined, permission: string): boolean {
  return (privileges || []).includes(permission)
}
