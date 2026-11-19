import type { InstanceResource } from '@/entities/project/instance-resource'
import { type AdvancedResourceBase, resourceBaseFor } from '@/views/projects/project/advanced/advanced-resource-base'

// The single source for the hosting sections of the project Advanced tab. It
// drives the sidebar (desktop and tabs) and the redirect of a hidden section.

/** What the visibility predicates read from the instance: the hosting privilege checks. */
export type AdvancedHostingSource = Pick<
  InstanceResource,
  | 'hasManageFileManagerPrivilege'
  | 'hasManageDomainsPrivilege'
  | 'hasManageFtpPrivilege'
  | 'hasManageSftpPrivilege'
  | 'hasManageMysqlPrivilege'
  | 'hasPhpmyadminSsoPrivilege'
  | 'hasManageCronPrivilege'
  | 'hasManageContainersPrivilege'
  | 'isContainer'
>

export interface HostingSectionDefinition {
  key: string
  /** Route segment under `…/advanced/`. */
  path: string
  /** Legacy i18n key. */
  titleKey: string
  visible: (instance: AdvancedHostingSource) => boolean
}

/** Every section in legacy order, with its privilege predicate (the single-server check is in `isAdvancedHostingSectionVisible`). */
export const HOSTING_SECTION_DEFINITIONS: HostingSectionDefinition[] = [
  { key: 'file-manager', path: 'file-manager', titleKey: 'heading.hosting.fileManager.title', visible: i => i.hasManageFileManagerPrivilege() },
  { key: 'domains', path: 'domains', titleKey: 'heading.hosting.domains.title', visible: i => i.hasManageDomainsPrivilege() },
  { key: 'ftp', path: 'ftp', titleKey: 'heading.hosting.ftp.title', visible: i => i.hasManageFtpPrivilege() },
  { key: 'sftp', path: 'sftp', titleKey: 'heading.hosting.sftp.title', visible: i => i.hasManageSftpPrivilege() },
  { key: 'databases', path: 'databases', titleKey: 'heading.hosting.databases.title', visible: i => i.hasManageMysqlPrivilege() || i.hasPhpmyadminSsoPrivilege() },
  { key: 'cron', path: 'cron', titleKey: 'heading.hosting.cron.title', visible: i => i.hasManageCronPrivilege() },
  { key: 'containers', path: 'containers', titleKey: 'heading.hosting.containers.title', visible: i => i.hasManageContainersPrivilege() && i.isContainer },
]

// Keys whose pages have shipped; later pages add their key here.
export const SHIPPED_SECTION_KEYS: string[] = ['file-manager', 'domains', 'ftp', 'sftp', 'databases', 'cron', 'containers']

export const ADVANCED_HOSTING_SECTIONS: HostingSectionDefinition[] = HOSTING_SECTION_DEFINITIONS.filter(
  section => SHIPPED_SECTION_KEYS.includes(section.key),
)

export function isAdvancedHostingSectionVisible (instance: AdvancedHostingSource, singleServer: boolean, key: string): boolean {
  const section = ADVANCED_HOSTING_SECTIONS.find(candidate => candidate.key === key)
  return singleServer && !!section && section.visible(instance)
}

/**
 * Redirect of a hidden hosting section: Details of the same instance under the same base (`/projects` or `/instances`), or `null`
 * when the route has no `meta.section` or the section is visible.
 */
export function hiddenHostingSectionRedirect (
  path: string,
  id: string,
  section: string | undefined,
  instance: AdvancedHostingSource,
  singleServer: boolean,
): string | null {
  if (!section || isAdvancedHostingSectionVisible(instance, singleServer, section)) {
    return null
  }
  const base: AdvancedResourceBase = resourceBaseFor(path)
  return `${base}/${id}/advanced/details`
}
