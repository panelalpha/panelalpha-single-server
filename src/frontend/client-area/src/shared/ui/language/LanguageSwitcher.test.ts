import type { HomeResponse } from '@/shared/session/session.api'
import type * as SessionApi from '@/shared/session/session.api'
import { flushPromises, mount } from '@vue/test-utils'
import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { putUserLanguage } from '@/shared/session/session.api'
import { useSessionStore } from '@/shared/session/session.store'
import LanguageSwitcher from './LanguageSwitcher.vue'

vi.mock('@/shared/session/session.api', async importOriginal => {
  const actual: typeof SessionApi = await importOriginal()
  return {
    ...actual,
    putUserLanguage: vi.fn(),
  }
})

const i18nState = vi.hoisted(() => ({ language: 'en' }))

vi.mock('i18next', () => {
  const t = (key: string) => key
  return {
    default: {
      get language () {
        return i18nState.language
      },
      changeLanguage: vi.fn(async (code: string) => {
        i18nState.language = code
      }),
      t,
      getFixedT: () => t,
      on: vi.fn(),
      off: vi.fn(),
      isInitialized: true,
    },
  }
})

describe('LanguageSwitcher Phase 4 language PUT', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    i18nState.language = 'en'
  })

  function mountSwitcher (isLogin: boolean) {
    return mount(LanguageSwitcher, {
      props: { isLogin },
      global: {
        plugins: [[I18NextVue, { i18next }]],
        stubs: {
          'v-menu': { template: '<div><slot /><slot name="activator" :props="{}" /></div>' },
          'v-icon': true,
          'v-text-field': true,
          'v-list': { template: '<div><slot /></div>' },
          'v-list-item': { template: '<div><slot /></div>' },
        },
      },
    })
  }

  function hydrateSignedInUser (language = 'en') {
    const session = useSessionStore()
    session.hydrateHome({
      app: {
        name: 'PanelAlpha',
        languages: ['en', 'pl', 'de'],
        language_flags: { en: 'us', pl: 'pl', de: 'de' },
        default_language: 'en',
      },
      user: { email: 'a@b.c', language },
    } as HomeResponse)
    return session
  }

  function laravelAxiosError (data: Record<string, unknown>, status = 422) {
    return {
      isAxiosError: true,
      response: {
        status,
        statusText: 'Error',
        headers: {},
        config: {},
        data,
      },
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed',
    }
  }

  it('PUTs /user/language from the shell switcher when session.user is set', async () => {
    const session = hydrateSignedInUser('en')
    vi.mocked(putUserLanguage).mockResolvedValueOnce(undefined)

    const wrapper = mountSwitcher(false)
    await wrapper.vm.selectLanguage('pl')
    await flushPromises()

    expect(putUserLanguage).toHaveBeenCalledWith('pl')
    expect(session.home?.user?.language).toBe('pl')
    expect(localStorage.getItem('client-area-language')).toBe('pl')
    expect(i18next.language).toBe('pl')
    expect(wrapper.emitted('language-changed')).toHaveLength(1)
  })

  it('does not PUT when is-login is set', async () => {
    hydrateSignedInUser('en')
    const wrapper = mountSwitcher(true)
    await wrapper.vm.selectLanguage('pl')
    await flushPromises()

    expect(putUserLanguage).not.toHaveBeenCalled()
    expect(localStorage.getItem('client-area-language')).toBe('pl')
    expect(i18next.language).toBe('pl')
    expect(wrapper.emitted('language-changed')).toBeUndefined()
  })

  it('keeps the new language and shows Laravel errors when PUT fails', async () => {
    hydrateSignedInUser('en')
    vi.mocked(putUserLanguage).mockRejectedValueOnce(
      laravelAxiosError({
        message: 'The given data was invalid.',
        errors: { language: ['The selected language is invalid.'] },
      }),
    )

    const wrapper = mountSwitcher(false)
    await wrapper.vm.selectLanguage('pl')
    await flushPromises()

    expect(localStorage.getItem('client-area-language')).toBe('pl')
    expect(i18next.language).toBe('pl')
    expect(wrapper.vm.errors).toEqual(['The selected language is invalid.'])
    expect(wrapper.emitted('language-changed')).toBeUndefined()
    expect(wrapper.get('[data-testid="language-errors"]').text())
      .toContain('The selected language is invalid.')
  })

  it('shows response.data.message when errors bag is absent on PUT failure', async () => {
    hydrateSignedInUser('en')
    vi.mocked(putUserLanguage).mockRejectedValueOnce(
      laravelAxiosError({ message: 'Server error saving language.' }, 500),
    )

    const wrapper = mountSwitcher(false)
    await wrapper.vm.selectLanguage('de')
    await flushPromises()

    expect(i18next.language).toBe('de')
    expect(wrapper.vm.errors).toEqual(['Server error saving language.'])
  })
})

describe('LanguageSwitcher onMounted boot language (Fix A)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    i18nState.language = 'en'
  })

  function mountSwitcher (isLogin = false) {
    return mount(LanguageSwitcher, {
      props: { isLogin },
      global: {
        plugins: [[I18NextVue, { i18next }]],
        stubs: {
          'v-menu': { template: '<div><slot /><slot name="activator" :props="{}" /></div>' },
          'v-icon': true,
          'v-text-field': true,
          'v-list': { template: '<div><slot /></div>' },
          'v-list-item': { template: '<div><slot /></div>' },
        },
      },
    })
  }

  it('prefers resolveBootLanguage over client-area-language when home is set', async () => {
    localStorage.setItem('client-area-language', 'de')
    const session = useSessionStore()
    session.hydrateHome({
      app: {
        name: 'PanelAlpha',
        languages: ['en', 'pl', 'de'],
        language_flags: { en: 'us', pl: 'pl', de: 'de' },
        default_language: 'en',
      },
      user: { email: 'a@b.c', language: 'pl' },
    } as HomeResponse)

    const wrapper = mountSwitcher(false)
    await flushPromises()

    expect(wrapper.vm.selectedCode).toBe('pl')
    expect(i18next.changeLanguage).toHaveBeenCalledWith('pl')
    expect(i18next.language).toBe('pl')
  })

  it('uses client-area-language when home is unset', async () => {
    localStorage.setItem('client-area-language', 'de')

    const wrapper = mountSwitcher(true)
    await flushPromises()

    expect(wrapper.vm.selectedCode).toBe('de')
    expect(i18next.changeLanguage).toHaveBeenCalledWith('de')
    expect(i18next.language).toBe('de')
  })

  it('uses app.default_language via resolveBootLanguage when home has no user', async () => {
    localStorage.setItem('client-area-language', 'de')
    const session = useSessionStore()
    session.hydrateHome({
      app: {
        name: 'PanelAlpha',
        languages: ['en', 'pl', 'de'],
        language_flags: { en: 'us', pl: 'pl', de: 'de' },
        default_language: 'pl',
      },
    } as HomeResponse)

    const wrapper = mountSwitcher(true)
    await flushPromises()

    expect(wrapper.vm.selectedCode).toBe('pl')
    expect(i18next.changeLanguage).toHaveBeenCalledWith('pl')
  })
})
