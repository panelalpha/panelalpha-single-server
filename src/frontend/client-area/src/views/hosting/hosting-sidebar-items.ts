import type { HostingService } from './hosting.types'
import { hasPrivilege, HOSTING_PRIVILEGES as P } from './hosting-privileges'

// Port of the legacy sidebar items (app-lite): the list is the same
// on the desktop sidebar (grouped) and the tabs below 1200 px (flat). `titleKey` is a legacy i18n key.
// Single-server shows Usage plus the service server pages (DNS, Email Addresses, Email Forwarders), like the deployed lite.
// The other sections live in the project Advanced tab. Containers was removed from the menu.

export interface SidebarItem {
  key: string
  to: string
  titleKey: string
  group: 'manage' | 'email'
  /** Red dot after the title: the email records of the service are not configured. */
  showDot?: boolean
}

export interface SidebarContext {
  /** `home.app.single_server.active`. */
  singleServer: boolean
  /** `showEmailRecordConfiguration && !isEmailRecordsConfigured`. */
  emailRecordsDot: boolean
}

/** The page is titled SSH when the plan allows SSH access. */
export function sftpPageType (service: HostingService): 'ssh' | 'sftp' {
  return service.plan_settings.default_ssh_access_enabled || service.plan_settings.allow_user_enable_ssh_access ? 'ssh' : 'sftp'
}

/** Whether the route has its own tab: the same prefix rule as `isCurrent` in the sidebar. */
export function hasTabForPath (items: SidebarItem[], path: string): boolean {
  return items.some(item => path.startsWith(item.to))
}

/** DNS, then the e-mail pages. Same conditions in both layouts. */
export function serviceServerItems (service: HostingService, { emailRecordsDot }: Pick<SidebarContext, 'emailRecordsDot'>): SidebarItem[] {
  const items: SidebarItem[] = []
  if (service.dns_server_enabled && hasPrivilege(service, P.MANAGE_DNS) && service.plan_settings.dns_management_enabled) {
    items.push({ key: 'dns', to: '/hosting/dns', titleKey: 'heading.hosting.dns.title', group: 'manage' })
  }
  if (service.email_server_enabled && hasPrivilege(service, P.MANAGE_EMAIL)) {
    items.push({ key: 'email-addresses', to: '/hosting/email-addresses', titleKey: 'heading.hosting.emailAddress.title', group: 'email', showDot: emailRecordsDot }, { key: 'email-forwarders', to: '/hosting/email-forwarders', titleKey: 'heading.hosting.emailForwarders.title', group: 'email' })
  }
  return items
}

export function sidebarItems (service: HostingService, context: SidebarContext): SidebarItem[] {
  const { singleServer } = context
  if (singleServer) {
    return [
      { key: 'usage', to: '/hosting/usage', titleKey: 'heading.hosting.usage.title', group: 'manage' },
      ...serviceServerItems(service, context),
    ]
  }
  const items: SidebarItem[] = [
    { key: 'summary', to: '/hosting/summary', titleKey: 'heading.hosting.summary.title', group: 'manage' },
  ]
  if (hasPrivilege(service, P.MANAGE_DOMAINS)) {
    items.push({ key: 'domains', to: '/hosting/domains', titleKey: 'heading.hosting.domains.title', group: 'manage' })
  }
  if (hasPrivilege(service, P.MANAGE_FTP)) {
    items.push({ key: 'ftp', to: '/hosting/ftp', titleKey: 'heading.hosting.ftp.title', group: 'manage' })
  }
  if (hasPrivilege(service, P.MANAGE_SFTP)) {
    items.push({ key: 'sftp', to: '/hosting/sftp', titleKey: `heading.hosting.${sftpPageType(service)}.title`, group: 'manage' })
  }
  if (hasPrivilege(service, P.MANAGE_MYSQL) || hasPrivilege(service, P.PHPMYADMIN_SSO)) {
    items.push({ key: 'databases', to: '/hosting/databases', titleKey: 'heading.hosting.databases.title', group: 'manage' })
  }
  if (hasPrivilege(service, P.MANAGE_CRON)) {
    items.push({ key: 'cron', to: '/hosting/cron', titleKey: 'heading.hosting.cron.title', group: 'manage' })
  }
  if (hasPrivilege(service, P.MANAGE_FILE_MANAGER)) {
    items.push({ key: 'file-manager', to: '/hosting/file-manager', titleKey: 'heading.hosting.fileManager.title', group: 'manage' })
  }
  items.push(...serviceServerItems(service, context))
  return items
}
