import { describe, expect, it } from 'vitest'
import { isReseller, syncStyleManagerFlag } from './style-manager-flag'

const origin = 'https://app.test'
const key = `${origin}-style-manager`

function memoryStorage (initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) {
    data.set(key, initial)
  }
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('syncStyleManagerFlag', () => {
  it('sets the flag when branding is requested and it is off', () => {
    const storage = memoryStorage()
    syncStyleManagerFlag(storage, origin, 'true')
    expect(storage.data.get(key)).toBe('true')
  })

  it('removes the flag when branding is not requested and it is on', () => {
    const storage = memoryStorage('true')
    syncStyleManagerFlag(storage, origin, undefined)
    expect(storage.data.has(key)).toBe(false)
  })

  it('does nothing when already in the requested state', () => {
    const on = memoryStorage('true')
    syncStyleManagerFlag(on, origin, 'true')
    expect(on.data.get(key)).toBe('true')

    const off = memoryStorage()
    syncStyleManagerFlag(off, origin, undefined)
    expect(off.data.size).toBe(0)
  })

  it('treats ?branding=false as truthy', () => {
    const storage = memoryStorage()
    syncStyleManagerFlag(storage, origin, 'false')
    expect(storage.data.get(key)).toBe('true')
  })

  it('treats ?branding (null) and ?branding= (empty) as falsy', () => {
    for (const q of [null, '']) {
      const storage = memoryStorage('true')
      syncStyleManagerFlag(storage, origin, q)
      expect(storage.data.has(key)).toBe(false)
    }
  })

  it('treats an array query as truthy', () => {
    const storage = memoryStorage()
    syncStyleManagerFlag(storage, origin, ['a', 'b'])
    expect(storage.data.get(key)).toBe('true')
  })
})

describe('isReseller', () => {
  it('is true for present, non-null reseller_settings', () => {
    expect(isReseller({ reseller_settings: {} })).toBe(true)
    expect(isReseller({ reseller_settings: undefined })).toBe(true)
  })

  it('is false when reseller_settings is null or absent', () => {
    expect(isReseller({ reseller_settings: null })).toBe(false)
    expect(isReseller({})).toBe(false)
  })
})
