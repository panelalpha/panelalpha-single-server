import i18next from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage, LANGUAGE_STORAGE_KEY, rememberStartLanguage } from './apply-language'

vi.mock('i18next', () => ({ default: { changeLanguage: vi.fn(async () => undefined) } }))

describe('applyLanguage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('stores the code and switches i18next', async () => {
    await applyLanguage('pl')

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('pl')
    expect(i18next.changeLanguage).toHaveBeenCalledWith('pl')
  })
})

describe('rememberStartLanguage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('stores the code for the next cold start without switching i18next', () => {
    rememberStartLanguage('de')

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('de')
    expect(i18next.changeLanguage).not.toHaveBeenCalled()
  })

  it('ignores storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => rememberStartLanguage('de')).not.toThrow()
  })
})
