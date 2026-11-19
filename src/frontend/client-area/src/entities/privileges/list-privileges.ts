import { PRIVILEGES } from './privileges'

// The privilege lists of app and app-lite. `privileges.ts` holds the union of
// the two constant sets, but each source lists only its own keys (the other's have no translation), in its own order, so the
// list follows `single_server.active`: app-lite lists the lite keys, app the app keys.

const APP_KEYS: Array<keyof typeof PRIVILEGES> = [
  'MANAGE_LABELS',
  'REFRESH_THUMBNAIL',
  'CHANGE_DOMAIN',
  'CREATE_STAGING',
  'PUSH_TO_LIVE',
  'PUSH_TO_STAGING',
  'VIEW_LOGS',
  'VIEW_PHP_LOGS',
  'VIEW_WEBSERVER_LOGS',
  'VIEW_REPORTS',
  'MANAGE_CDN',
  'DELETE_INSTANCE',
  'COPY_INSTANCE',
  'MANAGE_SHARED_ACCESS',
  'PREVIEW_INSTANCE',
  'COLLABORATION',
  'MANAGE_GIT',
  'MANAGE_LIMITS',
  'CREATE_SSO_LINK',
  'WORDPRESS_UPDATE',
  'MANAGE_AUTO_UPDATE',
  'MANAGE_BACKUPS',
  'MANAGE_AUTO_BACKUP',
  'UPDATE_SITE_NAME',
  'CLEAR_CACHE',
  'MANAGE_MAINTENANCE_MODE',
  'MANAGE_DEBUG_MODE',
  'MANAGE_THEMES',
  'MANAGE_PLUGINS',
  'MANAGE_CONFIG',
  'MANAGE_WORDPRESS_USERS',
  'MANAGE_EDGE_CACHE',
  'MANAGE_SEARCH_ENGINE_INDEXING',
  'WORDPRESS_VIEW_LOGS',
  'VIEW_INSTALLATION_DETAILS',
  'MANAGE_CLOUDFLARE',
  'MANAGE_MCP',
  'MANAGE_EMAIL',
  'MANAGE_DNS',
  'MANAGE_DOMAINS',
  'MANAGE_SSL',
  'MANAGE_FTP',
  'MANAGE_SFTP',
  'MANAGE_MYSQL',
  'MANAGE_CRON',
  'MANAGE_FILE_MANAGER',
  'CONTROL_PANEL_SSO',
  'PHPMYADMIN_SSO',
  'CHANGE_PHP_VERSION',
  'MANAGE_PHP_SETTINGS',
]

const LITE_KEYS: Array<keyof typeof PRIVILEGES> = [
  'MANAGE_LABELS',
  'REFRESH_THUMBNAIL',
  'CHANGE_DOMAIN',
  'CREATE_STAGING',
  'PUSH_TO_LIVE',
  'PUSH_TO_STAGING',
  'VIEW_LOGS',
  'VIEW_PHP_LOGS',
  'VIEW_WEBSERVER_LOGS',
  'VIEW_REPORTS',
  'DELETE_INSTANCE',
  'COPY_INSTANCE',
  'MANAGE_SHARED_ACCESS',
  'PREVIEW_INSTANCE',
  'COLLABORATION',
  'MANAGE_GIT',
  'MANAGE_LIMITS',
  'REDEPLOY',
  'MANAGE_GENERAL_USERS',
  'CREATE_SSO_LINK',
  'WORDPRESS_UPDATE',
  'MANAGE_AUTO_UPDATE',
  'MANAGE_BACKUPS',
  'MANAGE_AUTO_BACKUP',
  'UPDATE_SITE_NAME',
  'CLEAR_CACHE',
  'MANAGE_MAINTENANCE_MODE',
  'MANAGE_DEBUG_MODE',
  'MANAGE_THEMES',
  'MANAGE_PLUGINS',
  'MANAGE_CONFIG',
  'MANAGE_WORDPRESS_USERS',
  'MANAGE_EDGE_CACHE',
  'MANAGE_SEARCH_ENGINE_INDEXING',
  'WORDPRESS_VIEW_LOGS',
  'MANAGE_CLOUDFLARE',
  'MANAGE_MCP',
  'MANAGE_EMAIL',
  'MANAGE_DNS',
  'MANAGE_DOMAINS',
  'MANAGE_SSL',
  'MANAGE_FTP',
  'MANAGE_SFTP',
  'MANAGE_MYSQL',
  'MANAGE_CRON',
  'MANAGE_FILE_MANAGER',
  'MANAGE_ENV_FILE',
  'CONTROL_PANEL_SSO',
  'PHPMYADMIN_SSO',
  'CHANGE_PHP_VERSION',
  'MANAGE_PHP_SETTINGS',
  'MANAGE_PROXY_ROUTING',
  'MANAGE_CONTAINERS',
]

export interface PrivilegeItem {
  key: string
  group: 'general' | 'wordpress' | 'hosting'
  text: string
}

export interface PrivilegeGroup {
  key: PrivilegeItem['group']
  text: string
  description?: string
}

type Translate = (key: string) => string

/** `listPrivileges(i18next)`: the group is read from the key prefix, the text from `privileges.list.<key>`. */
export function listPrivileges (t: Translate, singleServer = false): PrivilegeItem[] {
  return (singleServer ? LITE_KEYS : APP_KEYS).map(name => {
    const key: string = PRIVILEGES[name]
    let group: PrivilegeItem['group'] = 'general'
    if (key.startsWith('hosting.')) {
      group = 'hosting'
    } else if (key.startsWith('wordpress.')) {
      group = 'wordpress'
    }
    return { key, group, text: t(`privileges.list.${key}`) }
  })
}

/** `listPrivilegesGroup(i18next)`. */
export function listPrivilegesGroup (t: Translate): PrivilegeGroup[] {
  return [
    { key: 'general', text: t('privileges.group.general') },
    { key: 'wordpress', text: t('privileges.group.wordpress') },
    { key: 'hosting', text: t('privileges.group.hosting.title'), description: t('privileges.group.hosting.description') },
  ]
}
