import type { HomeResponse } from '@/shared/session/session.api'
import { isUserSingleServerAdmin } from '@/shared/session/home-access'

/**
 * Pure rules of the single-server admin area dropdown (`adminAppUrl`, `hasRunningTasks`, `hasUncompletedImports`, `hasBadge`).
 */

export type AdminMenuItemKey = 'migrations' | 'logs' | 'tasks' | 'configuration'

export interface AdminMenuItem {
  key: AdminMenuItemKey
  /** i18n key under `appSingleServer.adminAreaDropdown.*`. */
  labelKey: string
  /** Path appended to `home.admin.app_url`. */
  path: string
  /** Red inline dot next to the label. */
  badge: boolean
}

/** `adminAppUrl`: only the default single-server user gets the link; otherwise `null`. */
export function adminAppUrl (home: HomeResponse | null | undefined): string | null {
  if (!isUserSingleServerAdmin(home)) {
    return null
  }
  const admin = home?.admin as { app_url?: string } | null | undefined
  return admin?.app_url ?? null
}

export function hasRunningTasks (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.single_server?.has_running_tasks)
}

export function hasUncompletedImports (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.single_server?.has_uncompleted_imports)
}

/** Red dot on the activator. */
export function adminHasBadge (home: HomeResponse | null | undefined): boolean {
  return hasRunningTasks(home) || hasUncompletedImports(home)
}

/** The activator is a link on desktop (`mdAndDown` false) and a plain menu button below; the menu then carries a "go to" item. */
export function adminActivatorHref (home: HomeResponse | null | undefined, mdAndDown: boolean): string | undefined {
  return mdAndDown ? undefined : (adminAppUrl(home) ?? undefined)
}

/** Shortcut items in legacy order (migrations, logs, tasks, configuration) with their dot flags. */
export function adminMenuItems (home: HomeResponse | null | undefined): AdminMenuItem[] {
  const prefix = 'appSingleServer.adminAreaDropdown'
  return [
    { key: 'migrations', labelKey: `${prefix}.migrations`, path: '/migrations', badge: hasUncompletedImports(home) },
    { key: 'logs', labelKey: `${prefix}.logs`, path: '/logs', badge: false },
    { key: 'tasks', labelKey: `${prefix}.tasks`, path: '/tasks', badge: hasRunningTasks(home) },
    { key: 'configuration', labelKey: `${prefix}.configuration`, path: '/configuration', badge: false },
  ]
}

export function adminItemHref (home: HomeResponse | null | undefined, item: Pick<AdminMenuItem, 'path'>): string | undefined {
  const base = adminAppUrl(home)
  return base === null ? undefined : base + item.path
}
