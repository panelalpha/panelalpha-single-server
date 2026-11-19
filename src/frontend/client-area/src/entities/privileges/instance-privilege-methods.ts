/* eslint-disable unicorn/no-this-outside-of-class -- the methods are spread on a resource and read `this.privileges` (reactive proxy, clones) */
import { checkPrivilege, PRIVILEGES } from './privileges'

/**
 * Union of app and app-lite privilege methods (instance and hosting). Each method reads `this.privileges`, so it keeps working when spread on the resource.
 *
 * Conflict: lite maps `hasManageUsersPrivilege` to `general.manage_users` and gives `wordpress.manage_users` its own
 * `hasManageWordpressUsersPrivilege`; app maps `hasManageUsersPrivilege` to `wordpress.manage_users`. This module keeps the app
 * meaning for `hasManageUsersPrivilege` and exposes the lite one as `hasManageGeneralUsersPrivilege`.
 */
const SIMPLE_METHODS = {
  // GENERAL
  hasManageLabelsPrivilege: PRIVILEGES.MANAGE_LABELS,
  hasRefreshThumbnailPrivilege: PRIVILEGES.REFRESH_THUMBNAIL,
  hasChangeDomainPrivilege: PRIVILEGES.CHANGE_DOMAIN,
  hasCreateStagingPrivilege: PRIVILEGES.CREATE_STAGING,
  hasPushToLivePrivilege: PRIVILEGES.PUSH_TO_LIVE,
  hasPushToStagingPrivilege: PRIVILEGES.PUSH_TO_STAGING,
  hasViewLogsPrivilege: PRIVILEGES.VIEW_LOGS,
  hasViewPhpLogsPrivilege: PRIVILEGES.VIEW_PHP_LOGS,
  hasViewWebserverLogsPrivilege: PRIVILEGES.VIEW_WEBSERVER_LOGS,
  hasViewReportsPrivilege: PRIVILEGES.VIEW_REPORTS,
  hasManageCdnPrivilege: PRIVILEGES.MANAGE_CDN,
  hasDeleteInstancePrivilege: PRIVILEGES.DELETE_INSTANCE,
  hasCopyInstancePrivilege: PRIVILEGES.COPY_INSTANCE,
  hasManageSharedAccessPrivilege: PRIVILEGES.MANAGE_SHARED_ACCESS,
  hasPreviewInstancePrivilege: PRIVILEGES.PREVIEW_INSTANCE,
  hasCollaborationPrivilege: PRIVILEGES.COLLABORATION,
  hasManageGitPrivilege: PRIVILEGES.MANAGE_GIT,
  hasManageLimitsPrivilege: PRIVILEGES.MANAGE_LIMITS,
  hasRedeployPrivilege: PRIVILEGES.REDEPLOY,
  hasManageGeneralUsersPrivilege: PRIVILEGES.MANAGE_GENERAL_USERS,
  // WORDPRESS
  hasCreateSsoLinkPrivilege: PRIVILEGES.CREATE_SSO_LINK,
  hasWordPressUpdatePrivilege: PRIVILEGES.WORDPRESS_UPDATE,
  hasManageAutoUpdatePrivilege: PRIVILEGES.MANAGE_AUTO_UPDATE,
  hasManageBackupsPrivilege: PRIVILEGES.MANAGE_BACKUPS,
  hasManageAutoBackupPrivilege: PRIVILEGES.MANAGE_AUTO_BACKUP,
  hasUpdateSiteNamePrivilege: PRIVILEGES.UPDATE_SITE_NAME,
  hasClearCachePrivilege: PRIVILEGES.CLEAR_CACHE,
  hasManageMaintenanceModePrivilege: PRIVILEGES.MANAGE_MAINTENANCE_MODE,
  hasManageDebugModePrivilege: PRIVILEGES.MANAGE_DEBUG_MODE,
  hasManageThemesPrivilege: PRIVILEGES.MANAGE_THEMES,
  hasManagePluginsPrivilege: PRIVILEGES.MANAGE_PLUGINS,
  hasManageConfigPrivilege: PRIVILEGES.MANAGE_CONFIG,
  hasManageUsersPrivilege: PRIVILEGES.MANAGE_WORDPRESS_USERS,
  hasManageWordpressUsersPrivilege: PRIVILEGES.MANAGE_WORDPRESS_USERS,
  hasManageEdgeCachePrivilege: PRIVILEGES.MANAGE_EDGE_CACHE,
  hasManageSearchEngineIndexingPrivilege: PRIVILEGES.MANAGE_SEARCH_ENGINE_INDEXING,
  hasWordPressViewLogsPrivilege: PRIVILEGES.WORDPRESS_VIEW_LOGS,
  hasManageCloudflarePrivilege: PRIVILEGES.MANAGE_CLOUDFLARE,
  hasManageMcpPrivilege: PRIVILEGES.MANAGE_MCP,
  // HOSTING
  hasManageEnvFilePrivilege: PRIVILEGES.MANAGE_ENV_FILE,
  hasManageEmailPrivilege: PRIVILEGES.MANAGE_EMAIL,
  hasManageDnsPrivilege: PRIVILEGES.MANAGE_DNS,
  hasManageDomainsPrivilege: PRIVILEGES.MANAGE_DOMAINS,
  hasManageSslPrivilege: PRIVILEGES.MANAGE_SSL,
  hasManageFtpPrivilege: PRIVILEGES.MANAGE_FTP,
  hasManageSftpPrivilege: PRIVILEGES.MANAGE_SFTP,
  hasManageMysqlPrivilege: PRIVILEGES.MANAGE_MYSQL,
  hasManageCronPrivilege: PRIVILEGES.MANAGE_CRON,
  hasManageFileManagerPrivilege: PRIVILEGES.MANAGE_FILE_MANAGER,
  hasControlPanelSsoPrivilege: PRIVILEGES.CONTROL_PANEL_SSO,
  hasPhpmyadminSsoPrivilege: PRIVILEGES.PHPMYADMIN_SSO,
  hasChangePhpVersionPrivilege: PRIVILEGES.CHANGE_PHP_VERSION,
  hasManagePhpSettingsPrivilege: PRIVILEGES.MANAGE_PHP_SETTINGS,
  hasManageProxyRoutingPrivilege: PRIVILEGES.MANAGE_PROXY_ROUTING,
  hasManageContainersPrivilege: PRIVILEGES.MANAGE_CONTAINERS,
} as const

export type PrivilegeCarrier = {
  privileges: readonly string[] | null | undefined
  type?: string | null
  source?: { type?: string } | null
}

type SimpleMethods = { [K in keyof typeof SIMPLE_METHODS]: () => boolean }

export interface InstancePrivilegeMethods extends SimpleMethods {
  hasPrivilege: (permission: string) => boolean
  hasAnyHostingPrivilege: () => boolean
  /** `type === 'wordpress'` (the type captured when the resource was built). */
  hasInstallationDetails: () => boolean
  hasViewInstallationDetailsPrivilege: () => boolean
  /** app-lite: a custom project deployed from a git repository. */
  hasGitSource: () => boolean
  /** app-lite: a custom project deployed from uploaded files. */
  hasFilesSource: () => boolean
}

/** `type` is the API `type` the resource was built from (legacy closes over `app.type`, not the lite `app_type`). */
export function createInstancePrivilegeMethods (type: string | null | undefined): InstancePrivilegeMethods {
  const methods: Record<string, (this: PrivilegeCarrier, ...args: string[]) => boolean> = {}

  for (const [name, permission] of Object.entries(SIMPLE_METHODS)) {
    methods[name] = function (this: PrivilegeCarrier) {
      return checkPrivilege(this.privileges, permission)
    }
  }

  methods.hasPrivilege = function (this: PrivilegeCarrier, permission: string) {
    return checkPrivilege(this.privileges, permission)
  }
  methods.hasAnyHostingPrivilege = function (this: PrivilegeCarrier) {
    return (this.privileges || []).some(privilege => privilege.startsWith('hosting.'))
  }
  methods.hasInstallationDetails = function () {
    return type === 'wordpress'
  }
  methods.hasViewInstallationDetailsPrivilege = function (this: PrivilegeCarrier) {
    return type === 'wordpress' && checkPrivilege(this.privileges, PRIVILEGES.VIEW_INSTALLATION_DETAILS)
  }
  methods.hasGitSource = function (this: PrivilegeCarrier) {
    return this.type === 'custom' && !!(this.source && this.source.type === 'git')
  }
  methods.hasFilesSource = function (this: PrivilegeCarrier) {
    return this.type === 'custom' && !!(this.source && this.source.type === 'files')
  }

  return methods as unknown as InstancePrivilegeMethods
}
