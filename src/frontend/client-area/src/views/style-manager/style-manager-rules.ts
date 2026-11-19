import type { HomeResponse } from '@/shared/session/session.api'
import { isReseller } from '@/shared/session/style-manager-flag'
import { type BrandLogo, DEFAULT_BRAND_COLORS, type ThemePayload } from '@/shared/theme/brand-theme'

/** Delay before the drawer opens after `?branding` (`setTimeout` 1000 ms). */
export const BRANDING_OPEN_DELAY_MS = 1000

export type StyleManagerRole = 'reseller' | 'admin'

/**
 * The reseller variant when `'reseller_settings' in home.user && !== null`, otherwise
 * the admin variant when `'admin' in home`. Others get no drawer at all.
 */
export function resolveStyleManagerRole (home: HomeResponse | null | undefined): StyleManagerRole | null {
  if (!home) {
    return null
  }
  if (home.user && isReseller(home.user)) {
    return 'reseller'
  }
  if ('admin' in home) {
    return 'admin'
  }
  return null
}

export interface InitialActivatorInput {
  role: StyleManagerRole
  brandingQuery: unknown
  /** Value of `localStorage['<origin>-style-manager']`. */
  storedFlag: unknown
}

export interface InitialActivatorState {
  /** The tab is visible right away (the flag is already saved). */
  showActivator: boolean
  /** After this many ms show the tab and open the drawer (`?branding`), `null` for no opening. */
  openAfterMs: number | null
  /** Save the `<origin>-style-manager` flag on opening (legacy: only when it was not there yet). */
  writeFlag: boolean
}

/**
 * Legacy runs this in `router.onReady`. A reseller has no tab and no opening from `?branding`.
 * Call it after `await router.isReady()`: `src/main.ts` mounts the app without waiting for the first navigation.
 */
export function initialActivatorState ({ role, brandingQuery, storedFlag }: InitialActivatorInput): InitialActivatorState {
  if (role === 'reseller') {
    return { showActivator: false, openAfterMs: null, writeFlag: false }
  }
  const stored = Boolean(storedFlag)
  const branding = Boolean(brandingQuery)
  return {
    showActivator: stored,
    openAfterMs: branding ? BRANDING_OPEN_DELAY_MS : null,
    writeFlag: branding && !stored,
  }
}

/** In demo mode the `Login` route opens the drawer. */
export function shouldOpenOnRoute ({ routeName, demoMode }: { routeName: unknown, demoMode: boolean }): boolean {
  return demoMode && routeName === 'login'
}

export type SaveTarget = 'reseller' | 'admin'

/**
 * The reseller variant saves to the reseller endpoint, otherwise only a truthy
 * `home.admin` has one. Without either (e.g. the demo) there is no request.
 */
export function resolveSaveTarget (reseller: boolean, home: HomeResponse | null | undefined): SaveTarget | null {
  if (reseller) {
    return 'reseller'
  }
  return home?.admin ? 'admin' : null
}

export interface ThemeStoreState {
  colors: { primary: ThemePayload['colors'] }
  style: ThemePayload['style']
  lightLogo: BrandLogo
  darkLogo: BrandLogo
  favicon: BrandLogo
}

/** Body of Save and the `localStorage.theme` entry; `logo` is the light logo. */
export function buildThemePayload (state: ThemeStoreState): ThemePayload {
  return {
    colors: state.colors.primary,
    style: state.style,
    logo: state.lightLogo,
    darkLogo: state.darkLogo,
    favicon: state.favicon,
  }
}

/**
 * A copy of `home.app.default_theme` (never mutated), or the built-in defaults.
 * The built-in style carries `allowToChangeMode: false` (legacy wrote the unused `darkUserChangeMode`).
 */
export function defaultTheme (home: HomeResponse | null | undefined): ThemePayload {
  const theme = home?.app?.default_theme
  if (theme) {
    return {
      colors: theme.colors ? { ...theme.colors } : undefined,
      style: theme.style ? { ...theme.style } : undefined,
      logo: theme.logo,
      darkLogo: theme.darkLogo,
      favicon: theme.favicon,
    }
  }
  return {
    colors: { ...DEFAULT_BRAND_COLORS },
    style: { disableShadows: false, darkMode: false, allowToChangeMode: false },
    logo: false,
    darkLogo: false,
    favicon: false,
  }
}
