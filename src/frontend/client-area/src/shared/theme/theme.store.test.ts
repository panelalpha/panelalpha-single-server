import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COLORS } from './brand-theme'
import { useThemeStore } from './theme.store'

const colors = { base: '#111111', lighten1: '#222222', lighten2: '#333333', lighten4: '#444444', darken1: '#555555' }

function storage (value: unknown): Pick<Storage, 'getItem'> {
  return { getItem: () => (value === null ? null : JSON.stringify(value)) }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('theme.store', () => {
  it('starts from the legacy ThemeModule defaults', () => {
    const store = useThemeStore()
    expect(store.colors.primary).toEqual(DEFAULT_BRAND_COLORS)
    expect(store.style).toEqual({ disableShadows: false, allowToChangeMode: false, darkMode: false })
    expect(store.lightLogo).toBe(false)
    expect(store.darkLogo).toBe(false)
    expect(store.favicon).toBe(false)
    expect(store.isDark).toBe(false)
  })

  it('changeColorsTheme maps logo to lightLogo and replaces colors, style and favicon', () => {
    const store = useThemeStore()
    store.changeColorsTheme({
      colors,
      style: { darkMode: true, disableShadows: true, allowToChangeMode: true },
      logo: 'data:image/png;base64,L',
      darkLogo: 'data:image/png;base64,D',
      favicon: 'data:image/png;base64,F',
    })
    expect(store.colors.primary).toEqual(colors)
    expect(store.style).toEqual({ darkMode: true, disableShadows: true, allowToChangeMode: true })
    expect(store.lightLogo).toBe('data:image/png;base64,L')
    expect(store.darkLogo).toBe('data:image/png;base64,D')
    expect(store.favicon).toBe('data:image/png;base64,F')
    expect(store.isDark).toBe(true)
  })

  it('keeps the previous colors when the payload has none or empty ones', () => {
    const store = useThemeStore()
    store.changeColorsTheme({ colors })
    store.changeColorsTheme({ colors: {}, style: { darkMode: false } })
    store.changeColorsTheme({})
    expect(store.colors.primary).toEqual(colors)
  })

  it('stores copies of style and colors, not the caller references', () => {
    const store = useThemeStore()
    const style = { darkMode: false, disableShadows: false }
    const incoming = { ...colors }
    store.changeColorsTheme({ colors: incoming, style })

    store.changeColorsTheme({ colors: { base: '#abcdef' }, style: { ...store.style, disableShadows: true } })
    store.setDarkMode(true)

    expect(style).toEqual({ darkMode: false, disableShadows: false })
    expect(incoming).toEqual(colors)
  })

  it('hydrateFromHome commits the home theme and ignores a missing one', () => {
    const store = useThemeStore()
    store.hydrateFromHome({ colors, style: { darkMode: true }, logo: 'data:image/png;base64,L' })
    expect(store.colors.primary).toEqual(colors)
    expect(store.isDark).toBe(true)
    expect(store.lightLogo).toBe('data:image/png;base64,L')

    store.hydrateFromHome(undefined)
    store.hydrateFromHome(null)
    expect(store.colors.primary).toEqual(colors)
    expect(store.isDark).toBe(true)
  })

  it('hydrateFromHome does not alias the home theme objects', () => {
    const store = useThemeStore()
    const homeTheme = { colors: { ...colors }, style: { darkMode: false, disableShadows: false } }
    store.hydrateFromHome(homeTheme)
    store.changeColorsTheme({ colors: { base: '#abcdef' }, style: { ...store.style, disableShadows: true } })
    store.setDarkMode(true)
    expect(homeTheme.style).toEqual({ darkMode: false, disableShadows: false })
    expect(homeTheme.colors).toEqual(colors)
  })

  it('applyStoredTheme overrides the home theme but keeps darkMode from /home', () => {
    const store = useThemeStore()
    store.hydrateFromHome({ colors, style: { darkMode: true, disableShadows: false, allowToChangeMode: false } })

    store.applyStoredTheme(storage({
      colors: { ...colors, base: '#999999' },
      style: { darkMode: false, disableShadows: true, allowToChangeMode: true },
      logo: 'data:image/png;base64,S',
      darkLogo: false,
      favicon: false,
    }))

    expect(store.colors.primary.base).toBe('#999999')
    expect(store.style).toEqual({ darkMode: true, disableShadows: true, allowToChangeMode: true })
    expect(store.isDark).toBe(true)
    expect(store.lightLogo).toBe('data:image/png;base64,S')
  })

  it('applyStoredTheme without an entry or with invalid JSON changes nothing', () => {
    const store = useThemeStore()
    store.hydrateFromHome({ colors, style: { darkMode: true } })
    store.applyStoredTheme(storage(null))
    store.applyStoredTheme({ getItem: () => '{nope' })
    expect(store.colors.primary).toEqual(colors)
    expect(store.isDark).toBe(true)
  })

  it('setDarkMode flips isDark and keeps the rest of the style', () => {
    const store = useThemeStore()
    store.changeColorsTheme({ style: { disableShadows: true, allowToChangeMode: true } })
    store.setDarkMode(true)
    expect(store.isDark).toBe(true)
    expect(store.style).toEqual({ disableShadows: true, allowToChangeMode: true, darkMode: true })
    store.setDarkMode(false)
    expect(store.isDark).toBe(false)
  })
})
