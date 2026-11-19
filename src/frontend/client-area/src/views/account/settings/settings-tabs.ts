import type { LocationQuery } from 'vue-router'

// The tabs in order; `?tab=<name>` opens one, anything else opens General.
export const SETTINGS_TABS: readonly string[] = ['general', 'backups']

export function tabIndex (tab: unknown): number {
  const name = Array.isArray(tab) ? tab[0] : tab
  return Math.max(SETTINGS_TABS.indexOf(name as string), 0)
}

/**
 * The query that puts the open tab into the URL (General is the default: no `tab`), keeping the rest of it (`state` / `result`
 * belong to the Hub connection). `null` when the URL already says so: nothing to replace.
 */
export function tabQuery (index: number, query: LocationQuery): LocationQuery | null {
  const tab = index === 0 ? undefined : SETTINGS_TABS[index]
  if (query.tab === tab) {
    return null
  }
  const next = { ...query }
  if (tab) {
    next.tab = tab
  } else {
    delete next.tab
  }
  return next
}
