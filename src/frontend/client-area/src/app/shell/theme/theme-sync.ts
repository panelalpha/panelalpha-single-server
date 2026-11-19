import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { applyBodyThemeClass } from '@/app/shell/app-head'
import { useSessionStore } from '@/shared/session/session.store'
import { useThemeStore } from '@/shared/theme/theme.store'
import { applyDocumentFavicon, readDocumentFaviconHref } from './favicon'
import { toVuetifyPrimary, writePrimaryVars } from './primary-shades'

/** `localStorage` may throw on access itself (blocked site data); then the theme stays from `/home`. */
function browserStorage (): Pick<Storage, 'getItem'> {
  try {
    return localStorage
  } catch {
    return { getItem: () => null }
  }
}

/**
 * Theme sync in the frame (setup of `App.vue`, outside the keyed `v-app`, so a remount after a language change does not repeat it).
 *
 * - A new `/home` hydrates `theme.store`. `refreshServices` keeps the `home.app` object, so it does not hydrate again, as in legacy.
 * - Once per page load `localStorage.theme` is laid over the theme from `/home`, with `style.darkMode` always from `/home`.
 * - Primary shades from the store: the base of the V4 `primary` keys of both themes and `<style id="brand-primary-vars">` with `--v-primary-*`.
 *   It works from the start and on every change, also from the Style Manager drawer.
 * - The favicon from the store is set on every change (app-lite variant); an empty one goes back to the href from the start.
 * - `forceLight` (a route with `meta.forceLightTheme`, the wizard) forces a light theme without changing the preference in the store; after the route is left, dark comes back.
 * - The dark mode of the store drives the Vuetify theme and the `is-dark` / `is-light` class on the body.
 */
export function useThemeSync (forceLight: () => boolean = () => false): void {
  const session = useSessionStore()
  const themeStore = useThemeStore()
  const theme = useTheme()

  let storedThemeApplied = false
  watch(
    () => session.home?.app,
    app => {
      if (!app) {
        return
      }
      themeStore.hydrateFromHome(app.theme)
      if (!storedThemeApplied) {
        storedThemeApplied = true
        themeStore.applyStoredTheme(browserStorage())
      }
    },
    { immediate: true },
  )

  watch(
    () => themeStore.isDark && !forceLight(),
    dark => {
      theme.change(dark ? 'dark' : 'light')
      applyBodyThemeClass(dark)
    },
    { immediate: true },
  )

  watch(
    () => themeStore.colors.primary,
    primary => {
      const shades = toVuetifyPrimary(primary)
      theme.themes.value.light.colors.primary = shades.primary
      theme.themes.value.dark.colors.primary = shades.primary
      writePrimaryVars(document, primary)
    },
    { immediate: true, deep: true },
  )

  const startFaviconHref = readDocumentFaviconHref(document)
  watch(
    () => themeStore.favicon,
    favicon => {
      applyDocumentFavicon(document, favicon, startFaviconHref)
    },
    { immediate: true },
  )
}
