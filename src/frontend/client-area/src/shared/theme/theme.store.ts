import type { HomeTheme, HomeThemeStyle } from '@/shared/session/session.api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type BrandColors,
  type BrandLogo,
  DEFAULT_BRAND_COLORS,
  readStoredTheme,
  type ThemePayload,
} from './brand-theme'

/**
 * One reactive source of the brand theme, in place of the Vuex `ThemeModule`.
 * The navbar, the auth screens, the 404 page and the onboarding modals read it. It is written by the hydration from `/home`,
 * `localStorage.theme` and the Style Manager drawer.
 */
export const useThemeStore = defineStore('theme', () => {
  const colors = ref<{ primary: BrandColors }>({ primary: { ...DEFAULT_BRAND_COLORS } })
  const style = ref<HomeThemeStyle>({ disableShadows: false, allowToChangeMode: false, darkMode: false })
  const lightLogo = ref<BrandLogo>(false)
  const darkLogo = ref<BrandLogo>(false)
  const favicon = ref<BrandLogo>(false)

  const isDark = computed(() => Boolean(style.value.darkMode))

  /**
   * `payload.logo` becomes `lightLogo`.
   * The store keeps copies of `style` and `colors`, not references: `/home` is cached (`cachedGet`), and a preview
   * from the drawer must not mutate the cache or `default_theme`. Empty `colors` keeps the previous ones.
   */
  function changeColorsTheme (payload: ThemePayload): void {
    if (payload.colors && Object.keys(payload.colors).length > 0) {
      colors.value = { primary: { ...colors.value.primary, ...payload.colors } }
    }
    if (payload.style) {
      style.value = { ...payload.style }
    }
    lightLogo.value = payload.logo ?? false
    darkLogo.value = payload.darkLogo ?? false
    favicon.value = payload.favicon ?? false
  }

  /** Commits the theme from `/home`; a missing theme changes nothing. */
  function hydrateFromHome (theme: HomeTheme | undefined | null): void {
    if (!theme) {
      return
    }
    changeColorsTheme(theme)
  }

  /**
   * A `localStorage.theme` entry overrides the `/home` theme.
   * `style.darkMode` stays from `/home` (unlike legacy), the rest comes from the entry.
   */
  function applyStoredTheme (storage: Pick<Storage, 'getItem'>): void {
    const stored = readStoredTheme(storage)
    if (!stored) {
      return
    }
    changeColorsTheme({
      ...stored,
      style: stored.style ? { ...stored.style, darkMode: style.value.darkMode } : undefined,
    })
  }

  function setDarkMode (dark: boolean): void {
    style.value = { ...style.value, darkMode: dark }
  }

  return {
    colors,
    style,
    lightLogo,
    darkLogo,
    favicon,
    isDark,
    changeColorsTheme,
    hydrateFromHome,
    applyStoredTheme,
    setDarkMode,
  }
})
