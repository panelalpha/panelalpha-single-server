import { describe, expect, it } from 'vitest'
import { nextLoginStepFromResponse } from './login-steps'

describe('nextLoginStepFromResponse', () => {
  it('maps intermediate flags to UI steps', () => {
    expect(nextLoginStepFromResponse({ use_password: true })).toBe('password')
    expect(nextLoginStepFromResponse({ set_password: true })).toBe('set_password')
    expect(nextLoginStepFromResponse({ verify_email: true })).toBe('verify_email')
    expect(nextLoginStepFromResponse({ two_factor: true })).toBe('two_factor')
  })

  it('prefers set_password over use_password when both present', () => {
    expect(nextLoginStepFromResponse({
      set_password: true,
      use_password: true,
    })).toBe('set_password')
  })

  it('returns null for redirect_to and final home payloads', () => {
    expect(nextLoginStepFromResponse({ redirect_to: '/elsewhere' })).toBeNull()
    expect(nextLoginStepFromResponse({
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c' },
    })).toBeNull()
  })
})
