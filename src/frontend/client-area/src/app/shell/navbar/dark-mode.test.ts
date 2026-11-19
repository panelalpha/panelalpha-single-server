import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { putUserDarkMode } from '@/app/shell/shell.api'
import { useThemeStore } from '@/shared/theme/theme.store'
import { changeDarkMode } from './dark-mode'

vi.mock('@/app/shell/shell.api', () => ({ putUserDarkMode: vi.fn() }))

function makeThemeStore () {
  setActivePinia(createPinia())
  const store = useThemeStore()
  store.changeColorsTheme({ style: { darkMode: false, allowToChangeMode: true } })
  return store
}

describe('changeDarkMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    document.body.className = 'is-light'
    vi.mocked(putUserDarkMode).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the theme store style, Vuetify theme, body class and localStorage', () => {
    vi.mocked(putUserDarkMode).mockResolvedValue()
    const store = makeThemeStore()
    const theme = { change: vi.fn() }

    changeDarkMode(store, theme, true)

    expect(store.style.darkMode).toBe(true)
    expect(store.isDark).toBe(true)
    expect(store.style.allowToChangeMode).toBe(true)
    expect(theme.change).toHaveBeenCalledWith('dark')
    expect(localStorage.getItem('isDarkMode')).toBe('true')
    expect(document.body.classList.contains('is-dark')).toBe(true)
    expect(document.body.classList.contains('is-light')).toBe(false)
    expect(document.body.classList.contains('no-transition')).toBe(true)
    vi.advanceTimersByTime(100)
    expect(document.body.classList.contains('no-transition')).toBe(false)
    expect(putUserDarkMode).toHaveBeenCalledWith(true)
  })

  it('switches back to light', () => {
    vi.mocked(putUserDarkMode).mockResolvedValue()
    const store = makeThemeStore()
    store.setDarkMode(true)
    const theme = { change: vi.fn() }
    changeDarkMode(store, theme, false)
    expect(store.isDark).toBe(false)
    expect(theme.change).toHaveBeenCalledWith('light')
    expect(localStorage.getItem('isDarkMode')).toBe('false')
    expect(document.body.classList.contains('is-light')).toBe(true)
  })

  it('does not wait for the request and ignores its failure', async () => {
    vi.mocked(putUserDarkMode).mockRejectedValue(new Error('500'))
    const theme = { change: vi.fn() }
    expect(() => changeDarkMode(makeThemeStore(), theme, true)).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(theme.change).toHaveBeenCalledWith('dark')
  })
})
