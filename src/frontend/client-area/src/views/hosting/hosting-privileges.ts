import type { HostingService } from './hosting.types'

// Port of the legacy hosting privilege methods (union of app and app-lite) and the
// `hosting.*` privilege constants. Legacy puts the methods on the service object; here they are
// pure functions of the privilege list. Privileges are read from the **service**, not from a server account.

export const HOSTING_PRIVILEGES = {
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
  // app-lite only
  MANAGE_ENV_FILE: 'hosting.manage_env_file',
  MANAGE_PROXY_ROUTING: 'hosting.manage_proxy_routing',
  MANAGE_CONTAINERS: 'hosting.manage_containers',
} as const

type WithPrivileges = Pick<HostingService, 'privileges'>

/** `privileges.includes(permission)`; a missing list counts as empty. */
export function hasPrivilege (holder: WithPrivileges | null | undefined, permission: string): boolean {
  return (holder?.privileges ?? []).includes(permission)
}

/** `some(startsWith('hosting.'))`: a service with no hosting privilege is not listed in the frame. */
export function hasAnyHostingPrivilege (holder: WithPrivileges | null | undefined): boolean {
  return (holder?.privileges ?? []).some(privilege => privilege.startsWith('hosting.'))
}
