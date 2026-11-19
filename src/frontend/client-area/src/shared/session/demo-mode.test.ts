import { describe, expect, it } from 'vitest'
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  getDemoCredentials,
  hasAccountAlreadyExistsQuery,
  isDemoMode,
} from './demo-mode'

describe('isDemoMode / getDemoCredentials', () => {
  it('is true only when VITE_DEMO_MODE is the string true', () => {
    expect(isDemoMode({ VITE_DEMO_MODE: 'true' })).toBe(true)
    expect(isDemoMode({ VITE_DEMO_MODE: 'false' })).toBe(false)
    expect(isDemoMode({ VITE_DEMO_MODE: '1' })).toBe(false)
    expect(isDemoMode({})).toBe(false)
  })

  it('returns legacy hardcoded demo credentials', () => {
    expect(getDemoCredentials()).toEqual({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    })
    expect(DEMO_EMAIL).toBe('demo@panelalpha.com')
    expect(DEMO_PASSWORD).toBe('Password123')
  })
})

describe('hasAccountAlreadyExistsQuery', () => {
  it('detects presence of the query key even when empty', () => {
    expect(hasAccountAlreadyExistsQuery({ account_already_exists: '' })).toBe(true)
    expect(hasAccountAlreadyExistsQuery({ account_already_exists: '1' })).toBe(true)
    expect(hasAccountAlreadyExistsQuery({ account_already_exists: null })).toBe(true)
  })

  it('is false when the key is absent', () => {
    expect(hasAccountAlreadyExistsQuery({})).toBe(false)
    expect(hasAccountAlreadyExistsQuery({ email: 'a@b.c' })).toBe(false)
  })
})
