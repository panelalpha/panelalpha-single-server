import type { AdvancedResourceBase } from './advanced-resource-base'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { isAdvancedPageHidden } from './advanced-hidden-pages'
import { ADVANCED_HOSTING_SECTIONS, type AdvancedHostingSource } from './hosting-context/advanced-hosting-sections'

// The desktop list and the tabs below `lgAndDown`.
// Both lists use the same conditions, so one list serves the desktop sidebar and the tabs.
// `titleKey` is a legacy i18n key.

export interface AdvancedSidebarItem {
  key: string
  to: string
  titleKey: string
}

/** What the sidebar reads from the instance: the plan, the DNS/CDN fields and the privilege and server checks. */
export type AdvancedSidebarSource = Pick<
  InstanceResource,
  | 'id'
  | 'type'
  | 'plan_settings'
  | 'cdn_enabled'
  | 'service_has_dns_cloudflare'
  | 'domain_has_dns_zone'
  | 'hasWpCloudServer'
  | 'hasCopyInstancePrivilege'
  | 'hasManageCloudflarePrivilege'
  | 'hasManageEdgeCachePrivilege'
  | 'hasManageCdnPrivilege'
  | 'hasManageAutoUpdatePrivilege'
  | 'hasManageDebugModePrivilege'
  | 'hasManageMaintenanceModePrivilege'
  | 'hasManageMcpPrivilege'
  | 'hasManageGitPrivilege'
  | 'hasManageEnvFilePrivilege'
  | 'hasManageConfigPrivilege'
  | 'hasManageWordpressUsersPrivilege'
  | 'hasManageGeneralUsersPrivilege'
  | 'hasManageThemesPrivilege'
  | 'hasChangePhpVersionPrivilege'
  | 'hasManagePhpSettingsPrivilege'
  | 'hasViewLogsPrivilege'
  | 'hasViewPhpLogsPrivilege'
  | 'hasViewWebserverLogsPrivilege'
> & AdvancedHostingSource

const title = (segment: string): string => `heading.instance.advanced.${segment}.title`

export function advancedSidebarItems (
  instance: AdvancedSidebarSource,
  resourceBase: AdvancedResourceBase,
  singleServer: boolean,
): AdvancedSidebarItem[] {
  const base = `${resourceBase}/${instance.id}/advanced`
  const plan = instance.plan_settings
  const items: AdvancedSidebarItem[] = []

  const add = (key: string, titleKey: string, shown: boolean, to = `${base}/${key}`): void => {
    if (shown) {
      items.push({ key, to, titleKey })
    }
  }

  add('details', 'heading.instance.advanced.siteDetails.title', true)
  // Copy Project and Users are hidden on purpose; the routes stay and redirect.
  add(
    'copy-instance',
    title('copyInstance'),
    !isAdvancedPageHidden('copy-instance') && !!plan?.copy_instance_allowed && instance.hasCopyInstancePrivilege(),
  )
  add(
    'cloudflare',
    title('cloudflare'),
    instance.hasManageCloudflarePrivilege() && !!instance.service_has_dns_cloudflare && !!instance.domain_has_dns_zone,
  )
  add('edge-cache', title('edge-cache'), instance.hasWpCloudServer() && instance.hasManageEdgeCachePrivilege())
  // Link as in app-lite: `${base}/cdn`, like the other items.
  // Differs from legacy app, which linked to `/instances`.
  add('cdn', title('cdn'), instance.hasManageCdnPrivilege() && !!instance.cdn_enabled)
  add('security', title('security'), true)
  add('auto-updates', title('autoUpdates'), instance.hasManageAutoUpdatePrivilege())
  // The same condition on the desktop list and the tabs.
  // A classic project keeps the phpMyAdmin login and the PHP cards of that page; a container project shows only the WordPress modes.
  const phpHosting = !instance.isContainer
    && (instance.hasPhpmyadminSsoPrivilege() || instance.hasChangePhpVersionPrivilege() || instance.hasManagePhpSettingsPrivilege())
  add(
    'developer-settings',
    title('developer'),
    phpHosting || instance.hasManageDebugModePrivilege() || instance.hasManageMaintenanceModePrivilege(),
  )
  add(
    'wordpress-mcp',
    title('wordpressMcp'),
    instance.hasManageMcpPrivilege() && !!plan?.wordpress_mcp_enabled && (instance.type || 'wordpress') === 'wordpress',
  )
  add('git', title('git'), instance.hasManageGitPrivilege())
  add('env-file', title('envFile'), instance.hasManageEnvFilePrivilege() && instance.type !== 'wordpress')
  add('wordpress-config', title('wordpressConfig'), instance.hasManageConfigPrivilege())
  // The same condition on the desktop list and the tabs.
  add('wordpress-users', title('users'), instance.hasManageWordpressUsersPrivilege())
  // The same condition on the desktop list and the tabs.
  add('users', title('users'), !isAdvancedPageHidden('users') && instance.hasManageGeneralUsersPrivilege())
  add('themes', title('theme'), instance.hasManageThemesPrivilege())
  // Hosting sections: single-server only, between themes and logs, same on both variants.
  for (const section of ADVANCED_HOSTING_SECTIONS) {
    add(section.key, section.titleKey, singleServer && section.visible(instance), `${base}/${section.path}`)
  }
  add(
    'logs',
    title('logs'),
    instance.hasViewLogsPrivilege() || instance.hasViewPhpLogsPrivilege() || instance.hasViewWebserverLogsPrivilege(),
  )

  return items
}
