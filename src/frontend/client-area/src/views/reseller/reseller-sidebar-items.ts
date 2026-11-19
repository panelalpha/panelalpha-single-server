// Five unconditional items, the same on the desktop list and the tabs.
// `titleKey` is a legacy i18n key.

export interface ResellerSidebarItem {
  key: string
  to: string
  titleKey: string
}

export const RESELLER_SIDEBAR_ITEMS: readonly ResellerSidebarItem[] = [
  { key: 'users', to: '/reseller-area/users', titleKey: 'heading.reseller.page.users' },
  { key: 'branding', to: '/reseller-area/branding', titleKey: 'heading.reseller.page.branding' },
  { key: 'email-settings', to: '/reseller-area/email-settings', titleKey: 'heading.reseller.page.emailSettings' },
  { key: 'logs', to: '/reseller-area/logs', titleKey: 'heading.reseller.page.logs' },
  { key: 'api', to: '/reseller-area/api', titleKey: 'heading.reseller.page.api' },
]
