import type { PostProcessorModule } from 'i18next'
import i18next from 'i18next'
import HttpBackend from 'i18next-http-backend'
import { getActivePinia } from 'pinia'
import vuetify from '@/app/plugins/vuetify'
import { rebrandCopy } from '@/shared/api/resource-paths'
import { useSessionStore } from '@/shared/session/session.store'
import { LANGUAGE_STORAGE_KEY } from '@/shared/ui/language/apply-language'

const apiBase = import.meta.env.VITE_API_URL || '/api'

const projectTerminologyPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'projectTerminology',
  process (value: string) {
    if (typeof value !== 'string') {
      return value
    }

    try {
      if (!getActivePinia()) {
        return value
      }
      const session = useSessionStore()
      if (session.home?.app?.single_server?.active !== true) {
        return value
      }
      return rebrandCopy(value)
    } catch {
      return value
    }
  },
}

function setDirection (lang: string) {
  const dir = i18next.dir(lang)
  // Legacy set only the global `$vuetify.rtl` from i18next and left Vuetify's own
  // language alone. V4 reads RTL per locale (`rtl[current]`), so flag the current Vuetify locale:
  // `useRtl()` (e.g. `PendingSslIndicator`) then agrees with `[dir=rtl]` even where Vuetify's own
  // RTL list differs. On the instance these are Refs; only `$vuetify` unwraps them.
  vuetify.locale.rtl.value[vuetify.locale.current.value] = dir === 'rtl'
  if (typeof document !== 'undefined') {
    document.documentElement.dir = dir
  }
}

function registerCapitaliseFirstLetterFormat () {
  i18next.services.formatter?.add(
    'capitaliseFirstLetter',
    (value: unknown) => {
      if (typeof value !== 'string') {
        return String(value ?? '')
      }
      return value.replace(/\b\w/g, match => match.toUpperCase())
    },
  )
}

// A language code as the API names it (`en`, `pt_BR`, `zh-Hant`); anything else would end up in the translation URL.
const LANGUAGE_CODE = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i

/**
 * The language of the last visit (`client-area-language`, written by the language switcher and by the boot language in
 * `App.vue`), so a returning user loads their translation first instead of English and a second file after `/home`.
 * `/home` still decides: `App.vue` switches when `resolveBootLanguage` differs.
 */
export function readStartLanguage (): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.trim()
    return stored && LANGUAGE_CODE.test(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

/**
 * Resolves when HttpBackend has finished the initial language load (or failed).
 * main.ts awaits this before mount so the first t() sees loaded resources.
 */
export const i18nReady = i18next
  .use(HttpBackend)
  .use(projectTerminologyPostProcessor)
  .init({
    fallbackLng: 'en',
    lng: readStartLanguage(),
    postProcess: ['projectTerminology'],
    backend: {
      loadPath: `${apiBase}/{{lng}}/translation.json`,
      requestOptions: {
        mode: 'cors',
        credentials: 'include' as RequestCredentials,
        cache: 'default',
      },
    },
    interpolation: {
      escapeValue: false,
    },
    parseMissingKeyHandler (key, defaultValue) {
      let missingLang: string[]
      try {
        const raw = localStorage.getItem('missingLang')
        const parsed = raw ? JSON.parse(raw) as unknown : []
        missingLang = Array.isArray(parsed) ? parsed as string[] : []
      } catch {
        missingLang = []
      }
      if (!missingLang.includes(key)) {
        missingLang.push(key)
        localStorage.setItem('missingLang', JSON.stringify(missingLang))
      }
      // i18next also calls this handler for `t(key, { defaultValue })`; the default wins over the raw key.
      return defaultValue ?? key
    },
  })
  .then(() => {
    registerCapitaliseFirstLetterFormat()
    setDirection(i18next.language)
  })

i18next.on('languageChanged', lang => {
  setDirection(lang)
})

export { default as i18next } from 'i18next'
