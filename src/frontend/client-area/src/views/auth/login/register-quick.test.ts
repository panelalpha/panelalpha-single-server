import { beforeEach, describe, expect, it } from 'vitest'
import { newSiteDescriptionStorageKey, redirectStorageKey, tokenStorageKey } from '@/shared/session/login-storage-keys'
import {
  firstQueryString,
  persistControlPanelUpgradeQuery,
  persistNewSiteQuery,
  queryHasKey,
  resolveAutoCompleteEmail,
} from './register-quick'

const ORIGIN = 'https://app.example.test'

function memoryStorage (): Storage {
  const map = new Map<string, string>()
  return {
    get length () {
      return map.size
    },
    clear () {
      map.clear()
    },
    getItem (key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key (index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem (key: string) {
      map.delete(key)
    },
    setItem (key: string, value: string) {
      map.set(key, String(value))
    },
  }
}

describe('queryHasKey / firstQueryString / resolveAutoCompleteEmail', () => {
  it('detects bare query flags via hasOwnProperty', () => {
    expect(queryHasKey({ 'control-panel-upgrade': null }, 'control-panel-upgrade')).toBe(true)
    expect(queryHasKey({ 'control-panel-upgrade': '' }, 'control-panel-upgrade')).toBe(true)
    expect(queryHasKey({}, 'control-panel-upgrade')).toBe(false)
  })

  it('reads the first string from query values', () => {
    expect(firstQueryString('a@b.c')).toBe('a@b.c')
    expect(firstQueryString(['x@y.z', 'other'])).toBe('x@y.z')
    expect(firstQueryString([null])).toBeUndefined()
    expect(firstQueryString(undefined)).toBeUndefined()
  })

  it('prefers predefinedEmail over query.email for autofill detection', () => {
    expect(resolveAutoCompleteEmail('prop@ex.com', 'query@ex.com')).toBe('prop@ex.com')
    expect(resolveAutoCompleteEmail('', 'query@ex.com')).toBe('query@ex.com')
    expect(resolveAutoCompleteEmail(undefined, ['auto@ex.com'])).toBe('auto@ex.com')
    expect(resolveAutoCompleteEmail(undefined, undefined)).toBe('')
  })
})

describe('persistControlPanelUpgradeQuery (before registration_enabled gate)', () => {
  let storage: Storage
  let tokenStorage: Storage

  beforeEach(() => {
    storage = memoryStorage()
    tokenStorage = memoryStorage()
  })

  it('stores the redirect in localStorage and the token in sessionStorage', () => {
    const result = persistControlPanelUpgradeQuery(
      { 'control-panel-upgrade': null, 'token': 'cp-tok' },
      { storage, tokenStorage, origin: ORIGIN },
    )
    expect(result).toEqual({ skipDashboard: true, controlPanelUpgrade: true })
    expect(storage.getItem(redirectStorageKey(ORIGIN))).toBe('control-panel-upgrade')
    expect(tokenStorage.getItem(tokenStorageKey(ORIGIN))).toBe('cp-tok')
    // The token is a one-shot credential: localStorage must not keep a readable copy.
    expect(storage.getItem(tokenStorageKey(ORIGIN))).toBeNull()
  })

  it('stores empty token string when token query is absent on CP upgrade', () => {
    const result = persistControlPanelUpgradeQuery(
      { 'control-panel-upgrade': '' },
      { storage, tokenStorage, origin: ORIGIN },
    )
    expect(result.controlPanelUpgrade).toBe(true)
    expect(tokenStorage.getItem(tokenStorageKey(ORIGIN))).toBe('')
    expect(storage.getItem(tokenStorageKey(ORIGIN))).toBeNull()
  })

  it('ignores new-site and new-import keys (those are written after the gate)', () => {
    const result = persistControlPanelUpgradeQuery(
      { 'new-site': null, 'description': 'x', 'new-import': null },
      { storage, origin: ORIGIN },
    )
    expect(result).toEqual({ skipDashboard: false, controlPanelUpgrade: false })
    expect(storage.getItem(redirectStorageKey(ORIGIN))).toBeNull()
    expect(storage.getItem(tokenStorageKey(ORIGIN))).toBeNull()
  })
})

describe('persistNewSiteQuery (after registration_enabled gate)', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('stores new-site redirect, skipDashboard, and trimmed description', () => {
    const result = persistNewSiteQuery(
      { 'new-site': null, 'description': '  Hello world  ' },
      { storage, origin: ORIGIN },
    )
    expect(result).toEqual({ skipDashboard: true, controlPanelUpgrade: false })
    expect(storage.getItem(redirectStorageKey(ORIGIN))).toBe('new-site')
    expect(storage.getItem(newSiteDescriptionStorageKey(ORIGIN))).toBe('Hello world')
  })

  it('removes new-site description key when description empty or missing', () => {
    storage.setItem(newSiteDescriptionStorageKey(ORIGIN), 'stale')
    persistNewSiteQuery(
      { 'new-site': '', 'description': ' '.repeat(3) },
      { storage, origin: ORIGIN },
    )
    expect(storage.getItem(newSiteDescriptionStorageKey(ORIGIN))).toBeNull()

    storage.setItem(newSiteDescriptionStorageKey(ORIGIN), 'stale2')
    persistNewSiteQuery(
      { 'new-site': null },
      { storage, origin: ORIGIN },
    )
    expect(storage.getItem(newSiteDescriptionStorageKey(ORIGIN))).toBeNull()
  })

  it('stores new-import redirect without skipDashboard or description', () => {
    const result = persistNewSiteQuery(
      { 'new-import': null },
      { storage, origin: ORIGIN },
    )
    expect(result).toEqual({ skipDashboard: false, controlPanelUpgrade: false })
    expect(storage.getItem(redirectStorageKey(ORIGIN))).toBe('new-import')
    expect(storage.getItem(newSiteDescriptionStorageKey(ORIGIN))).toBeNull()
  })

  it('writes nothing for a plain query', () => {
    const result = persistNewSiteQuery({}, { storage, origin: ORIGIN })
    expect(result).toEqual({ skipDashboard: false, controlPanelUpgrade: false })
    expect(storage.length).toBe(0)
  })

  it('leaves control-panel-upgrade keys alone (CP is handled by its own pre-gate step)', () => {
    const result = persistNewSiteQuery(
      { 'control-panel-upgrade': null, 'token': 't', 'new-site': null, 'description': 'nope' },
      { storage, origin: ORIGIN },
    )
    expect(result.controlPanelUpgrade).toBe(false)
    expect(storage.getItem(tokenStorageKey(ORIGIN))).toBeNull()
  })
})
