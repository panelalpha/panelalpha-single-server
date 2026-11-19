import type { useThemeStore } from '@/shared/theme/theme.store'
import type { ThemeInstance } from 'vuetify'
import { putUserDarkMode } from '@/app/shell/shell.api'
import { applyBodyDarkClasses, setStoredDarkMode } from '@/shared/browser/dark-mode'

/**
 * Dark toggle.
 * Writes `style.darkMode` of `theme.store` first (`useThemeSync` re-applies the theme from it, so a missing write would
 * flip the theme back), then switches the Vuetify theme, the body class and `localStorage`.
 */

export function changeDarkMode (
  themeStore: Pick<ReturnType<typeof useThemeStore>, 'setDarkMode'>,
  theme: Pick<ThemeInstance, 'change'>,
  dark: boolean,
): void {
  themeStore.setDarkMode(dark)
  theme.change(dark ? 'dark' : 'light')
  setStoredDarkMode(dark)
  // Not awaited and errors ignored, as in legacy (`Api.put(...)` without `.then`/`.catch`).
  void putUserDarkMode(dark).catch(() => {})
  applyBodyDarkClasses(dark)
}
