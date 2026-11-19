import type { HomeThemeStyle } from '@/shared/session/session.api'

/** Shades of the brand primary: a flat shape from `/home`, `localStorage.theme` and the `PUT` payload. */
export interface BrandColors {
  base: string
  lighten1: string
  lighten2: string
  lighten4: string
  darken1: string
}

export type BrandLogo = string | false | null

/** Shape of the theme from `/home`, `localStorage.theme` and the `changeColorsTheme` commit. */
export interface ThemePayload {
  colors?: Partial<BrandColors>
  style?: HomeThemeStyle
  logo?: BrandLogo
  darkLogo?: BrandLogo
  favicon?: BrandLogo
  title?: string
}

/** The default palette of legacy. */
export const DEFAULT_BRAND_COLORS: Readonly<BrandColors> = Object.freeze({
  base: '#07C07E',
  lighten1: '#1FD895',
  lighten2: '#CDF2E5',
  lighten4: '#E6F9F2',
  darken1: '#0AAA71',
})

/** The `localStorage` key under which Save stores the theme. */
export const STORED_THEME_KEY = 'theme'

/** Same as legacy `JSON.parse(localStorage.getItem('theme'))`: a missing entry, bad JSON or a value that is not an object gives `null`. */
export function readStoredTheme (storage: Pick<Storage, 'getItem'>): ThemePayload | null {
  try {
    const raw = storage.getItem(STORED_THEME_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as ThemePayload
  } catch {
    return null
  }
}
