import type { HomeResponse } from '@/shared/session/session.api'
import { hasHostingAccess, isSingleServer } from '@/shared/session/home-access'
import { type BrandLogoValues, resolveBrandLogoSrc } from '@/shared/ui/logo/brand-logo'

/**
 * Pure visibility rules of the signed-in frame. The single-server branches are the app-lite ones (`single_server.active`).
 */

export type NavTabKey = 'my-instances' | 'my-hosting' | 'reseller-area' | 'connect-ai'

export interface NavTab {
  key: NavTabKey
  /** Legacy i18n key under `heading.navbar.tab.*`. */
  labelKey: string
  route: string
  exact?: boolean
  /** App-lite Connect AI tab: the label gets the gradient `span.connect-ai-label`. */
  gradient?: boolean
}

/**  `"reseller_settings" in user && reseller_settings !== null`. */
export function hasResellerAreaAccess (home: HomeResponse | null | undefined): boolean {
  const user = home?.user
  return Boolean(user) && 'reseller_settings' in user! && user!.reseller_settings !== null
}

export function navTabs (home: HomeResponse | null | undefined): NavTab[] {
  const singleServer = isSingleServer(home)
  const tabs: NavTab[] = [
    singleServer
      ? { key: 'my-instances', labelKey: 'heading.navbar.tab.myProjects', route: '/projects/', exact: true }
      : { key: 'my-instances', labelKey: 'heading.navbar.tab.myInstances', route: '/instances/', exact: true },
  ]
  // Single-server has no hosting tab; "My Server" is a user menu item instead.
  if (hasHostingAccess(home) && !singleServer) {
    tabs.push({ key: 'my-hosting', labelKey: 'heading.navbar.tab.myHosting', route: '/hosting/' })
  }
  if (hasResellerAreaAccess(home)) {
    tabs.push({ key: 'reseller-area', labelKey: 'heading.navbar.tab.resellerArea', route: '/reseller-area/' })
  }
  if (singleServer) {
    tabs.push({ key: 'connect-ai', labelKey: 'heading.navbar.tab.connectAi', route: '/connect-ai', gradient: true })
  }
  return tabs
}

/**
 * Below an instance (or, single-server, a project) page no tab is active
 * and the slider is hidden. The list screens themselves (`instances`, `projects`) keep the tab.
 */
export function isInstanceDetails (path: string, routeName: string | symbol | null | undefined, singleServer: boolean): boolean {
  const onResource = path.includes('/instances') || (singleServer && path.includes('/projects'))
  return onResource && routeName !== 'instances' && !(singleServer && routeName === 'projects')
}

/**
 * The tab V2 `router-link` marks active for `path`: an `exact` tab matches its own path (with or without the trailing slash), any
 * other tab its path and everything below it (`/hosting/` is active on `/hosting/summary`). Without a model V4 `v-tabs` force-selects
 * the first tab on mount, so the slider would sit under My Instances on a hosting page. `null` when no tab matches.
 */
export function activeTabKey (path: string, tabs: NavTab[]): NavTabKey | null {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path
  for (const tab of tabs) {
    const base = tab.route.length > 1 ? tab.route.replace(/\/+$/, '') : tab.route
    if (normalized === base || (!tab.exact && normalized.startsWith(`${base}/`))) {
      return tab.key
    }
  }
  return null
}

/**  `smAndDown ? 100 : mobile ? 64 : 88`. */
export function navbarHeight (display: { smAndDown: boolean, mobile: boolean }): 100 | 64 | 88 {
  if (display.smAndDown) {
    return 100
  }
  return display.mobile ? 64 : 88
}

/** Add new is a desktop button, the FAB takes over on mobile. */
export function showAddNewButton (mobile: boolean): boolean {
  return !mobile
}

export function showFloatingButton (displayNavbar: boolean, mobile: boolean): boolean {
  return displayNavbar && mobile
}

/** The tabs sit next to the logo on desktop and in a second row at `smAndDown`. */
export function tabsPlacement (smAndDown: boolean): 'inline' | 'second-row' {
  return smAndDown ? 'second-row' : 'inline'
}

/**
 * `src` of the navbar `img` from the theme store logos (`darkLogo` in dark, `logo` in light), the
 * bundled default when none is set. Raw SVG markup becomes a data URL, where legacy rendered it through `v-html`.
 */
export function resolveNavbarLogo (logos: BrandLogoValues, dark: boolean): string {
  return resolveBrandLogoSrc(logos, dark)
}
