import type { HomeResponse } from '@/shared/session/session.api'

export function isSingleServer (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.single_server?.active)
}

/**
 * The admin area dropdown is for the default user of a single-server install.
 * The Community panel has no Admin Area.
 */
export function isUserSingleServerAdmin (home: HomeResponse | null | undefined): boolean {
  return isSingleServer(home) && !home?.app?.community_panel && Boolean(home?.user?.is_ss_default)
}

/**
 * The My Plans page and its menu item exist when billing is on or the build is paid. `community_panel` is false in every
 * paid build. An absent `community_panel` (no `/home` yet) is not "paid", so the page stays hidden until `/home` loads.
 */
export function servicesPageVisible (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.billing_enabled) || home?.app?.community_panel === false
}

export function hasHostingAccess (home: HomeResponse | null | undefined): boolean {
  return home?.user?.has_hosting_access === true
}

/** The Community panel build (`app.community_panel`); a paid build (Plus, Pro) has it false. An absent value is not the Community panel. */
export function isFreePanel (home: HomeResponse | null | undefined): boolean {
  return Boolean(home?.app?.community_panel)
}
