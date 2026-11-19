import type { HomeResponse } from '@/shared/session/session.api'

/**
 * Pure boot-language helper: user.language when home.user is set,
 * otherwise app.default_language, otherwise en. Empty strings count as unset.
 */
export function resolveBootLanguage (home: HomeResponse | null | undefined): string {
  if (home?.user) {
    const userLang = home.user.language?.trim()
    if (userLang) {
      return userLang
    }
  }

  const appLang = home?.app?.default_language?.trim()
  if (appLang) {
    return appLang
  }

  return 'en'
}
