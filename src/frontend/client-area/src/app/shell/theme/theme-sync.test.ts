import type { HomeResponse } from '@/shared/session/session.api'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useTheme } from 'vuetify'
import { useSessionStore } from '@/shared/session/session.store'
import { useThemeStore } from '@/shared/theme/theme.store'
import { mountKit } from '@/test/mount-kit'
import { useThemeSync } from './theme-sync'

const colors = { base: '#111111', lighten1: '#222222', lighten2: '#333333', lighten4: '#444444', darken1: '#555555' }
const home = (theme?: Record<string, unknown>) => ({ app: { name: 'x', theme } }) as unknown as HomeResponse

async function setup (forceLight: () => boolean = () => false) {
  setActivePinia(createPinia())
  let vuetifyTheme!: ReturnType<typeof useTheme>
  await mountKit(defineComponent({
    setup () {
      vuetifyTheme = useTheme()
      useThemeSync(forceLight)
      return () => null
    },
  }))
  return { session: useSessionStore(), themeStore: useThemeStore(), vuetifyTheme }
}

beforeEach(() => {
  localStorage.clear()
  document.body.className = ''
})

describe('useThemeSync', () => {
  it('starts light with the default palette before /home', async () => {
    const { themeStore, vuetifyTheme } = await setup()
    expect(themeStore.isDark).toBe(false)
    expect(vuetifyTheme.global.name.value).toBe('light')
    expect(document.body.classList.contains('is-light')).toBe(true)
  })

  it('forces light on a forceLightTheme route without touching the stored preference, and dark returns after it', async () => {
    const forced = ref(true)
    const { session, themeStore, vuetifyTheme } = await setup(() => forced.value)
    session.hydrateHome(home({ style: { darkMode: true } }))
    await nextTick()
    expect(themeStore.isDark).toBe(true)
    expect(vuetifyTheme.global.name.value).toBe('light')
    expect(document.body.classList.contains('is-light')).toBe(true)
    expect(document.body.classList.contains('is-dark')).toBe(false)

    forced.value = false
    await nextTick()
    expect(vuetifyTheme.global.name.value).toBe('dark')
    expect(document.body.classList.contains('is-dark')).toBe(true)
  })

  it('hydrates the store from the first /home, colors included', async () => {
    const { session, themeStore } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: false }, logo: 'data:image/png;base64,L' }))
    await nextTick()
    expect(themeStore.colors.primary).toEqual(colors)
    expect(themeStore.lightLogo).toBe('data:image/png;base64,L')
  })

  it('switches Vuetify and the body class with style.darkMode of /home', async () => {
    const { session, vuetifyTheme } = await setup()
    session.hydrateHome(home({ style: { darkMode: true } }))
    await nextTick()
    expect(vuetifyTheme.global.name.value).toBe('dark')
    expect(document.body.classList.contains('is-dark')).toBe(true)
    expect(document.body.classList.contains('is-light')).toBe(false)
  })

  it('localStorage.theme overrides the colors but not darkMode', async () => {
    localStorage.setItem('theme', JSON.stringify({
      colors: { ...colors, base: '#999999' },
      style: { darkMode: false, disableShadows: true },
    }))
    const { session, themeStore, vuetifyTheme } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: true } }))
    await nextTick()
    expect(themeStore.colors.primary.base).toBe('#999999')
    expect(themeStore.style.disableShadows).toBe(true)
    expect(themeStore.isDark).toBe(true)
    expect(vuetifyTheme.global.name.value).toBe('dark')
  })

  it('a new /home hydrates again but localStorage.theme is applied only once per load', async () => {
    localStorage.setItem('theme', JSON.stringify({ colors: { ...colors, base: '#999999' } }))
    const { session, themeStore } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: false } }))
    await nextTick()
    expect(themeStore.colors.primary.base).toBe('#999999')

    session.hydrateHome(home({ colors: { ...colors, base: '#aaaaaa' }, style: { darkMode: false } }))
    await nextTick()
    expect(themeStore.colors.primary.base).toBe('#aaaaaa')
  })

  it('does not hydrate again when only user.services is refreshed', async () => {
    const { session, themeStore } = await setup()
    const loaded = { ...home({ colors, style: { darkMode: false } }), user: { email: 'a@b.c', services: [] } } as HomeResponse
    session.hydrateHome(loaded)
    await nextTick()

    // Preview from the Style Manager, then the `refreshServices` shape: same `app`, new `user.services`.
    themeStore.changeColorsTheme({ colors: { base: '#abcdef' } })
    session.hydrateHome({ ...loaded, user: { ...loaded.user, services: [] } } as HomeResponse)
    await nextTick()
    expect(themeStore.colors.primary.base).toBe('#abcdef')
  })

  it('ignores a /home without a theme and keeps the defaults', async () => {
    const { session, themeStore } = await setup()
    session.hydrateHome(home())
    await nextTick()
    expect(themeStore.isDark).toBe(false)
    expect(themeStore.colors.primary.base).toBe('#07C07E')
  })

  it('applies the /home primary base to both Vuetify themes and writes --v-primary-* from the start', async () => {
    const { session, vuetifyTheme } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: false } }))
    await nextTick()
    expect(vuetifyTheme.themes.value.light.colors.primary).toBe('#111111')
    expect(vuetifyTheme.themes.value.dark.colors.primary).toBe('#111111')
    const css = document.querySelector('#brand-primary-vars')?.textContent ?? ''
    expect(css).toContain('--v-primary-darken1: #555555;')
  })

  it('localStorage.theme colors reach Vuetify and the style element, and later store changes follow', async () => {
    localStorage.setItem('theme', JSON.stringify({ colors: { ...colors, base: '#999999' } }))
    const { session, themeStore, vuetifyTheme } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: false } }))
    await nextTick()
    expect(vuetifyTheme.themes.value.light.colors.primary).toBe('#999999')

    themeStore.changeColorsTheme({ colors: { lighten2: '#abcdef' } })
    await nextTick()
    expect(document.querySelector('#brand-primary-vars')?.textContent).toContain('--v-primary-lighten2: #abcdef;')
    expect(document.querySelectorAll('style[id="brand-primary-vars"]')).toHaveLength(1)
  })

  it('a non-hex base from localStorage.theme never reaches the style element or Vuetify', async () => {
    localStorage.setItem('theme', JSON.stringify({ colors: { ...colors, base: 'red; } body { display: none', lighten2: '#abcdef' } }))
    const { session, vuetifyTheme } = await setup()
    session.hydrateHome(home({ colors, style: { darkMode: false } }))
    await nextTick()
    const css = document.querySelector('#brand-primary-vars')?.textContent ?? ''
    expect(css).not.toContain('display: none')
    expect(css).not.toContain('--v-primary-base')
    expect(css).toContain('--v-primary-lighten2: #abcdef;')
    expect(vuetifyTheme.themes.value.light.colors.primary).toBe('#07C07E')
    expect(vuetifyTheme.themes.value.dark.colors.primary).toBe('#07C07E')
  })

  it('sets the favicon on every change and falls back to the start href', async () => {
    document.head.innerHTML = '<link rel="icon" href="/favicon.svg">'
    const { session, themeStore } = await setup()
    const icon = () => document.head.querySelector('link[rel~=\'icon\']')?.getAttribute('href')
    expect(icon()).toBe('/favicon.svg')

    session.hydrateHome(home({ colors, style: { darkMode: false }, favicon: 'data:image/png;base64,F' }))
    await nextTick()
    expect(icon()).toBe('data:image/png;base64,F')

    themeStore.changeColorsTheme({ favicon: 'data:image/png;base64,G' })
    await nextTick()
    expect(icon()).toBe('data:image/png;base64,G')

    themeStore.changeColorsTheme({ favicon: false })
    await nextTick()
    expect(icon()).toBe('/favicon.svg')
  })

  it('follows store.setDarkMode', async () => {
    const { themeStore, vuetifyTheme } = await setup()
    themeStore.setDarkMode(true)
    await nextTick()
    expect(vuetifyTheme.global.name.value).toBe('dark')
    expect(document.body.classList.contains('is-dark')).toBe(true)
  })
})
