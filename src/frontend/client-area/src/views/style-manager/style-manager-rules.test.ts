import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import {
  BRANDING_OPEN_DELAY_MS,
  buildThemePayload,
  defaultTheme,
  initialActivatorState,
  resolveSaveTarget,
  resolveStyleManagerRole,
  shouldOpenOnRoute,
} from './style-manager-rules'

const PLAIN_USER = { email: 'a@b.c' }

function home (extra: Record<string, unknown> = {}, user: Record<string, unknown> | null = PLAIN_USER) {
  return ({ app: {}, ...(user ? { user } : {}), ...extra }) as HomeResponse
}

describe('resolveStyleManagerRole', () => {
  it('returns reseller for a user with reseller_settings', () => {
    expect(resolveStyleManagerRole(home({}, { reseller_settings: { id: 1 } }))).toBe('reseller')
  })

  it('does not treat reseller_settings: null as a reseller', () => {
    expect(resolveStyleManagerRole(home({}, { reseller_settings: null }))).toBeNull()
  })

  it('returns admin when the key admin is present, even with a falsy value', () => {
    expect(resolveStyleManagerRole(home({ admin: { app_url: 'https://x' } }))).toBe('admin')
    expect(resolveStyleManagerRole(home({ admin: null }))).toBe('admin')
  })

  it('prefers reseller over admin', () => {
    expect(resolveStyleManagerRole(home({ admin: {} }, { reseller_settings: {} }))).toBe('reseller')
  })

  it('returns null for a plain user, a missing user and no home', () => {
    expect(resolveStyleManagerRole(home())).toBeNull()
    expect(resolveStyleManagerRole(home({}, null))).toBeNull()
    expect(resolveStyleManagerRole(null)).toBeNull()
    expect(resolveStyleManagerRole(undefined)).toBeNull()
  })
})

describe('initialActivatorState', () => {
  it('gives a reseller neither activator nor delayed open', () => {
    expect(initialActivatorState({ role: 'reseller', brandingQuery: '1', storedFlag: 'true' }))
      .toEqual({ showActivator: false, openAfterMs: null, writeFlag: false })
  })

  it('shows the activator for an admin whose flag is stored, without opening', () => {
    expect(initialActivatorState({ role: 'admin', brandingQuery: undefined, storedFlag: 'true' }))
      .toEqual({ showActivator: true, openAfterMs: null, writeFlag: false })
  })

  it('opens after 1000 ms on ?branding and writes the flag when it was missing', () => {
    expect(initialActivatorState({ role: 'admin', brandingQuery: '1', storedFlag: null }))
      .toEqual({ showActivator: false, openAfterMs: BRANDING_OPEN_DELAY_MS, writeFlag: true })
    expect(BRANDING_OPEN_DELAY_MS).toBe(1000)
  })

  it('does not rewrite the flag when it is already stored', () => {
    expect(initialActivatorState({ role: 'admin', brandingQuery: '1', storedFlag: 'true' }))
      .toEqual({ showActivator: true, openAfterMs: BRANDING_OPEN_DELAY_MS, writeFlag: false })
  })

  it('does nothing for an admin without flag and without ?branding', () => {
    expect(initialActivatorState({ role: 'admin', brandingQuery: undefined, storedFlag: null }))
      .toEqual({ showActivator: false, openAfterMs: null, writeFlag: false })
  })

  it('treats an empty ?branding value as absent (legacy truthiness)', () => {
    expect(initialActivatorState({ role: 'admin', brandingQuery: '', storedFlag: null }).openAfterMs).toBeNull()
  })
})

describe('shouldOpenOnRoute', () => {
  it('opens on the login route in demo mode only', () => {
    expect(shouldOpenOnRoute({ routeName: 'login', demoMode: true })).toBe(true)
    expect(shouldOpenOnRoute({ routeName: 'login', demoMode: false })).toBe(false)
    expect(shouldOpenOnRoute({ routeName: 'register', demoMode: true })).toBe(false)
  })
})

describe('resolveSaveTarget', () => {
  it('targets the reseller endpoint for the reseller variant', () => {
    expect(resolveSaveTarget(true, home())).toBe('reseller')
    expect(resolveSaveTarget(true, null)).toBe('reseller')
  })

  it('targets the admin endpoint only for a truthy home.admin', () => {
    expect(resolveSaveTarget(false, home({ admin: { app_url: 'x' } }))).toBe('admin')
    expect(resolveSaveTarget(false, home({ admin: undefined }))).toBeNull()
    expect(resolveSaveTarget(false, home())).toBeNull()
    expect(resolveSaveTarget(false, null)).toBeNull()
  })
})

describe('buildThemePayload', () => {
  it('maps the store to the legacy payload, light logo as `logo`', () => {
    const colors = { base: '#1', lighten1: '#2', lighten2: '#3', lighten4: '#4', darken1: '#5' }
    const style = { darkMode: true, disableShadows: false, allowToChangeMode: true }
    expect(buildThemePayload({ colors: { primary: colors }, style, lightLogo: 'L', darkLogo: false, favicon: null })).toEqual({
      colors,
      style,
      logo: 'L',
      darkLogo: false,
      favicon: null,
    })
  })
})

describe('defaultTheme', () => {
  it('copies home.app.default_theme without sharing references', () => {
    const source = { colors: { base: '#abc' }, style: { darkMode: true }, logo: 'L', darkLogo: 'D', favicon: 'F' }
    const h = home({ app: { default_theme: source } })
    const result = defaultTheme(h)
    expect(result).toEqual(source)
    expect(result.colors).not.toBe(source.colors)
    expect(result.style).not.toBe(source.style)
  })

  it('falls back to the built-in defaults with allowToChangeMode false (D5)', () => {
    for (const h of [home(), null]) {
      expect(defaultTheme(h)).toEqual({
        colors: { base: '#07C07E', lighten1: '#1FD895', lighten2: '#CDF2E5', lighten4: '#E6F9F2', darken1: '#0AAA71' },
        style: { disableShadows: false, darkMode: false, allowToChangeMode: false },
        logo: false,
        darkLogo: false,
        favicon: false,
      })
    }
  })
})
