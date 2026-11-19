import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'

function mockOkFetch (body: Record<string, unknown> = {}) {
  return vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => {
    return Response.json(body)
  }) as typeof fetch
}

describe('i18n runtime', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('loads en translation.json on init with credentials include', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return Response.json({
        heading: { 'loginPage.login.title': 'Welcome Back' },
      })
    })
    globalThis.fetch = fetchMock as typeof fetch
    localStorage.clear()

    const { i18nReady, i18next } = await import('./i18n')
    await i18nReady

    const enCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/en/translation.json'),
    )
    expect(enCalls.length).toBeGreaterThanOrEqual(1)
    const [url, init] = enCalls[0]!
    expect(String(url)).toMatch(/\/en\/translation\.json$/)
    expect(init?.credentials).toBe('include')
    expect(i18next.t('heading.loginPage.login.title')).toBe('Welcome Back')
  })

  it('requests pt_BR translation.json with credentials include', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return Response.json({ greeting: 'olá' })
    })
    globalThis.fetch = fetchMock as typeof fetch
    localStorage.clear()

    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    await i18next.changeLanguage('pt_BR')

    const ptCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/pt_BR/translation.json'),
    )
    expect(ptCalls.length).toBeGreaterThanOrEqual(1)
    const [url, init] = ptCalls[0]!
    expect(String(url)).toMatch(/\/pt_BR\/translation\.json$/)
    expect(init?.credentials).toBe('include')
  })

  it('drives Vuetify RTL from i18next.dir, also where Vuetify\'s own RTL list says LTR', async () => {
    // `ur` is RTL in i18next but not in Vuetify's defaults.
    globalThis.fetch = mockOkFetch()
    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    const vuetify = (await import('@/app/plugins/vuetify')).default

    await i18next.changeLanguage('ur')
    expect(vuetify.locale.isRtl.value).toBe(true)
    expect(document.documentElement.dir).toBe('rtl')

    await i18next.changeLanguage('en')
    expect(vuetify.locale.isRtl.value).toBe(false)
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('starts in the language of the last visit (client-area-language), English beside it as fallback', async () => {
    const fetchMock = mockOkFetch({ greeting: 'hallo' })
    globalThis.fetch = fetchMock
    localStorage.setItem('client-area-language', 'de')

    const { i18nReady, i18next } = await import('./i18n')
    await i18nReady

    expect(i18next.language).toBe('de')
    const urls = vi.mocked(fetchMock).mock.calls.map(([input]) => String(input))
    expect(urls.some(url => url.endsWith('/de/translation.json'))).toBe(true)
    expect(urls.some(url => url.endsWith('/en/translation.json'))).toBe(true)
  })

  it('falls back to en for a stored value that is not a language code', async () => {
    globalThis.fetch = mockOkFetch({})
    localStorage.setItem('client-area-language', '../../evil')

    const { i18nReady, i18next, readStartLanguage } = await import('./i18n')
    await i18nReady

    expect(i18next.language).toBe('en')
    expect(readStartLanguage()).toBe('en')
    localStorage.setItem('client-area-language', 'pt_BR')
    expect(readStartLanguage()).toBe('pt_BR')
  })

  it('returns missing key and stores it once in missingLang', async () => {
    globalThis.fetch = mockOkFetch({ known: 'yes' })
    localStorage.clear()

    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    await i18next.changeLanguage('en')

    const missing = 'definitely.missing.key.path'
    expect(i18next.t(missing)).toBe(missing)
    expect(i18next.t(missing)).toBe(missing)

    const stored = JSON.parse(localStorage.getItem('missingLang') || '[]') as string[]
    expect(stored.filter(k => k === missing)).toHaveLength(1)
  })

  it('returns the default value of a missing key and stores the key once in missingLang', async () => {
    globalThis.fetch = mockOkFetch({ known: 'yes' })
    localStorage.clear()

    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    await i18next.changeLanguage('en')

    const missing = 'definitely.missing.with.default'
    expect(i18next.t(missing, 'Fallback')).toBe('Fallback')
    expect(i18next.t(missing, 'Fallback')).toBe('Fallback')
    expect(i18next.t(missing, { defaultValue: 'Fallback' })).toBe('Fallback')

    const stored = JSON.parse(localStorage.getItem('missingLang') || '[]') as string[]
    expect(stored.filter(k => k === missing)).toHaveLength(1)
  })

  it('rewrites Instance to Project only when single_server.active is true', async () => {
    globalThis.fetch = mockOkFetch({ title: 'My Instances' })
    localStorage.clear()
    setActivePinia(createPinia())

    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    await i18next.changeLanguage('en')

    const session = useSessionStore()

    session.hydrateHome({
      app: { name: 'Test', single_server: { active: false } },
    })
    expect(i18next.t('title')).toBe('My Instances')

    session.hydrateHome({
      app: { name: 'Test', single_server: { active: true } },
    })
    expect(i18next.t('title')).toBe('My Projects')
  })

  it('leaves Instance unchanged when pinia store is unset', async () => {
    globalThis.fetch = mockOkFetch({ title: 'My Instances' })
    localStorage.clear()
    setActivePinia(undefined as never)

    const { i18nReady } = await import('./i18n')
    await i18nReady
    const i18next = (await import('i18next')).default
    await i18next.changeLanguage('en')

    expect(i18next.t('title')).toBe('My Instances')
  })
})
