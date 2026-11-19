import i18next from 'i18next'

export const LANGUAGE_STORAGE_KEY = 'client-area-language'

/** Remember the choice and switch i18next. Server sync stays with the caller. */
export async function applyLanguage (code: string): Promise<void> {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  await i18next.changeLanguage(code)
}

/** Stores the language for the next cold start; storage that throws (private mode, blocked) is ignored. */
export function rememberStartLanguage (code: string): void {
  try {
    if (localStorage.getItem(LANGUAGE_STORAGE_KEY) !== code) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    }
  } catch {
    // Nothing to remember without storage.
  }
}
