import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearControlPanelUpgradeToken,
  readControlPanelUpgradeToken,
  storeControlPanelUpgradeToken,
} from './control-panel-upgrade-token'
import { tokenStorageKey } from './login-storage-keys'
import { runSessionClearedHandlers } from './session-reset'

const ORIGIN = 'https://app.example.test'
const KEY = tokenStorageKey(ORIGIN)

function memoryStorage () {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

describe('control-panel-upgrade-token', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('keeps the token in sessionStorage and never in localStorage', () => {
    storeControlPanelUpgradeToken('cp-token', { origin: ORIGIN })

    expect(sessionStorage.getItem(`${ORIGIN}-token`)).toBe('cp-token')
    expect(localStorage.getItem(`${ORIGIN}-token`)).toBeNull()
    expect(readControlPanelUpgradeToken({ origin: ORIGIN })).toBe('cp-token')
  })

  it('uses window.location.origin as the key prefix by default', () => {
    storeControlPanelUpgradeToken('cp-token')

    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBe('cp-token')
  })

  it('drops a legacy localStorage copy without reading it back', () => {
    localStorage.setItem(KEY, 'legacy-token')

    expect(readControlPanelUpgradeToken({ origin: ORIGIN })).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('drops the legacy copy when storing a new token', () => {
    localStorage.setItem(KEY, 'legacy-token')

    storeControlPanelUpgradeToken('fresh', { origin: ORIGIN })

    expect(localStorage.getItem(KEY)).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBe('fresh')
  })

  it('stores an absent token as an empty string, as legacy did', () => {
    storeControlPanelUpgradeToken('', { origin: ORIGIN })

    expect(sessionStorage.getItem(KEY)).toBe('')
    expect(readControlPanelUpgradeToken({ origin: ORIGIN })).toBe('')
  })

  it('clear removes the token from both storages', () => {
    sessionStorage.setItem(KEY, 'cp-token')
    localStorage.setItem(KEY, 'legacy-token')

    clearControlPanelUpgradeToken({ origin: ORIGIN })

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('clearSession drops the token with the rest of the session', () => {
    storeControlPanelUpgradeToken('cp-token')

    runSessionClearedHandlers()

    expect(sessionStorage.getItem(`${window.location.origin}-token`)).toBeNull()
    expect(readControlPanelUpgradeToken()).toBeNull()
  })

  it('takes an injected storage and tolerates a blocked one', () => {
    const session = memoryStorage()
    const legacy = memoryStorage()
    legacy.data.set(KEY, 'legacy-token')

    storeControlPanelUpgradeToken('cp-token', { session, legacy, origin: ORIGIN })
    expect(session.data.get(KEY)).toBe('cp-token')
    expect(legacy.data.has(KEY)).toBe(false)
    expect(readControlPanelUpgradeToken({ session, legacy, origin: ORIGIN })).toBe('cp-token')

    clearControlPanelUpgradeToken({ session, legacy, origin: ORIGIN })
    expect(session.data.has(KEY)).toBe(false)
  })

  it('survives a storage that throws on access', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }

    expect(() => storeControlPanelUpgradeToken('x', { session: throwing, legacy: throwing })).not.toThrow()
    expect(readControlPanelUpgradeToken({ session: throwing, legacy: throwing })).toBeNull()
    expect(() => clearControlPanelUpgradeToken({ session: throwing, legacy: throwing })).not.toThrow()
  })
})
