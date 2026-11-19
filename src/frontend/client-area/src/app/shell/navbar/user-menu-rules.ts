import type { HomeResponse, HomeService, HomeThemeStyle } from '@/shared/session/session.api'
import { hasHostingAccess, isSingleServer, servicesPageVisible } from '@/shared/session/home-access'
import { hasRunningTasks } from './admin-menu-rules'

export function hasTrialOrSuspendedService (services: readonly HomeService[] | undefined): boolean {
  return (services ?? []).some(service => service.status === 'suspended' || (service.status === 'active' && Boolean(service.is_trial)))
}

/** The account menu needs `billing_enabled` as well as a trial or suspended service. */
export function userBadgeWarning (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.billing_enabled) && hasTrialOrSuspendedService(home?.user?.services)
}

/** Legacy hard-codes `false` (TODO upstream), so the `error` badge never shows. */
export function userBadgeError (): boolean {
  return false
}

/** The Community panel's own Settings page (a paid panel has it in the Admin Area). */
export function isFreePanel (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.community_panel)
}

/** Reminder to pair the Community panel with the Hub; an absent `hub_paired` shows nothing. */
export function hubNotConnected (home: HomeResponse | null | undefined): boolean {
  return isFreePanel(home) && home?.app?.hub_paired === false
}

/** The `badge` colour passed to `UserAvatar` (`''` hides it); the My Plans dot is `userBadgeWarning` alone, without the Hub. */
export function userBadge (home: HomeResponse | null | undefined): '' | 'error' | 'warning' {
  if (userBadgeError()) {
    return 'error'
  }
  return userBadgeWarning(home) || hubNotConnected(home) ? 'warning' : ''
}

/**
 * Always on a single-server install, otherwise the theme flag (`style` of `theme.store`)
 * unless an admin is impersonating.
 */
export function allowToChangeMode (home: HomeResponse | null | undefined, style: HomeThemeStyle | undefined): boolean {
  if (home?.app?.single_server?.active) {
    return true
  }
  return Boolean(style?.allowToChangeMode) && !home?.admin
}

/** The Community panel keeps its own Tasks page in the user menu. */
export function showTasksItem (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.community_panel)
}

/** Warning dot on the Tasks item while a task runs. */
export function tasksDot (home: HomeResponse | null | undefined): boolean {
  return hasRunningTasks(home)
}

/** Single-server has no hosting tab, so "My Server" is a user menu item. */
export function showMyServerItem (home: HomeResponse | null | undefined): boolean {
  return isSingleServer(home) && hasHostingAccess(home)
}

export const DISCORD_URL = 'https://discord.gg/9twHWR7xGX'

export type UserMenuItemKey = 'dark-mode' | 'account' | 'my-server' | 'tasks' | 'settings' | 'plans' | 'billing' | 'support' | 'logout'

/** Ordered items of the user menu; `support` is the Discord item on a single server. */
export function userMenuItems (home: HomeResponse | null | undefined, style: HomeThemeStyle | undefined): UserMenuItemKey[] {
  const billing = Boolean(home?.app?.billing_enabled)
  return [
    ...(allowToChangeMode(home, style) ? ['dark-mode' as const] : []),
    'account',
    ...(showMyServerItem(home) ? ['my-server' as const] : []),
    ...(showTasksItem(home) ? ['tasks' as const] : []),
    ...(isFreePanel(home) ? ['settings' as const] : []),
    ...(servicesPageVisible(home) ? ['plans' as const] : []),
    ...(billing ? ['billing' as const] : []),
    'support',
    'logout',
  ]
}

/** Discord link on a single server, otherwise `support_link`. */
export function supportHref (home: HomeResponse | null | undefined): string | undefined {
  if (home?.app?.single_server?.active) {
    return DISCORD_URL
  }
  return home?.app?.support_link as string | undefined
}
