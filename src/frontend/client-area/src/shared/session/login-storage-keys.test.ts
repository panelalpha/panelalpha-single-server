import { describe, expect, it } from 'vitest'
import { newSiteDescriptionStorageKey, redirectStorageKey, tokenStorageKey } from './login-storage-keys'

const ORIGIN = 'https://app.example.test'

describe('login-storage-keys', () => {
  it('prefixes every key with the origin, as legacy does', () => {
    expect(redirectStorageKey(ORIGIN)).toBe(`${ORIGIN}-redirect`)
    expect(tokenStorageKey(ORIGIN)).toBe(`${ORIGIN}-token`)
    expect(newSiteDescriptionStorageKey(ORIGIN)).toBe(`${ORIGIN}-new-site-description`)
  })
})
