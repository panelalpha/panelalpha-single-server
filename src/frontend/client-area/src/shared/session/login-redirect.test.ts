import { describe, expect, it } from 'vitest'
import { resolvePostLoginDestination, resolveSafeRedirect, sanitizeInternalPath } from './login-redirect'

describe('sanitizeInternalPath', () => {
  it('accepts a safe relative path', () => {
    expect(sanitizeInternalPath('/instances')).toEqual({ path: '/instances' })
  })

  it('parses path and query', () => {
    expect(sanitizeInternalPath('/instances?page=2')).toEqual({
      path: '/instances',
      query: { page: '2' },
    })
  })

  it('rejects protocol-relative and absolute URLs', () => {
    expect(sanitizeInternalPath('//evil')).toBeNull()
    expect(sanitizeInternalPath('https://evil.com')).toBeNull()
    expect(sanitizeInternalPath('javascript:alert(1)')).toBeNull()
  })
})

describe('resolveSafeRedirect', () => {
  it('maps an internal path to a route', () => {
    expect(resolveSafeRedirect('/instances?page=2')).toEqual({ kind: 'route', path: '/instances', query: { page: '2' } })
    expect(resolveSafeRedirect('/')).toEqual({ kind: 'route', path: '/' })
  })

  it('turns a same-origin absolute URL into its internal route', () => {
    expect(resolveSafeRedirect(`${window.location.origin}/instances?page=2`)).toEqual({
      kind: 'route',
      path: '/instances',
      query: { page: '2' },
    })
  })

  it('rejects another origin, protocol-relative URLs, schemes and backslashes', () => {
    expect(resolveSafeRedirect('https://evil.com/instances')).toBeNull()
    expect(resolveSafeRedirect('https://evil.com')).toBeNull()
    expect(resolveSafeRedirect('//evil.com/instances')).toBeNull()
    expect(resolveSafeRedirect('javascript:alert(1)')).toBeNull()
    expect(resolveSafeRedirect('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(resolveSafeRedirect(String.raw`\\evil.com\instances`)).toBeNull()
    expect(resolveSafeRedirect(String.raw`/\\evil.com`)).toBeNull()
    expect(resolveSafeRedirect('instances')).toBeNull()
  })
})

describe('resolvePostLoginDestination', () => {
  it('maps safe API redirect_to to an internal route', () => {
    expect(resolvePostLoginDestination({
      response: { redirect_to: '/dashboard' },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/dashboard' })
  })

  it('ignores unsafe API redirect_to and falls through to ?redirect=', () => {
    expect(resolvePostLoginDestination({
      response: { redirect_to: 'https://evil.com' },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/instances' })

    expect(resolvePostLoginDestination({
      response: { redirect_to: '//evil' },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/instances' })

    expect(resolvePostLoginDestination({
      response: { redirect_to: 'javascript:alert(1)' },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/instances' })
  })

  it('ignores unsafe redirect_to when forced flags are absent (no redirect query)', () => {
    expect(resolvePostLoginDestination({
      response: {
        app: { name: 'PanelAlpha' },
        user: { email: 'a@b.c' },
        redirect_to: 'https://evil.com',
      },
    })).toEqual({ kind: 'route', path: '/' })
  })

  it('routes password_change_required to my-account stub', () => {
    expect(resolvePostLoginDestination({
      response: {
        app: { name: 'PanelAlpha' },
        user: { email: 'a@b.c', password_change_required: true },
      },
      redirectQuery: '/instances',
    })).toEqual({
      kind: 'route',
      path: '/my-account',
      query: { change_password_required: 'true' },
    })
  })

  it('routes two_factor_auth_required to my-account stub', () => {
    expect(resolvePostLoginDestination({
      response: {
        app: { name: 'PanelAlpha' },
        user: { email: 'a@b.c', two_factor_auth_required: true },
      },
    })).toEqual({
      kind: 'route',
      path: '/my-account',
      query: { two_factor_auth_required: 'true' },
    })
  })

  it('skips forced flags when admin payload is present', () => {
    expect(resolvePostLoginDestination({
      response: {
        app: { name: 'PanelAlpha' },
        admin: { id: 1 },
        user: { email: 'a@b.c', password_change_required: true },
      },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/instances' })
  })

  it('uses the first entry when redirectQuery is an array', () => {
    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: ['/instances', '/other'],
    })).toEqual({ kind: 'route', path: '/instances' })
  })

  it('honors safe ?redirect= with path+query then defaults to /', () => {
    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: '/instances?page=2',
    })).toEqual({
      kind: 'route',
      path: '/instances',
      query: { page: '2' },
    })

    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: '/instances',
    })).toEqual({ kind: 'route', path: '/instances' })

    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
    })).toEqual({ kind: 'route', path: '/' })
  })

  it('rejects unsafe ?redirect= values and falls through to /', () => {
    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: '//evil',
    })).toEqual({ kind: 'route', path: '/' })

    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: 'https://evil.com',
    })).toEqual({ kind: 'route', path: '/' })

    expect(resolvePostLoginDestination({
      response: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } },
      redirectQuery: 'javascript:alert(1)',
    })).toEqual({ kind: 'route', path: '/' })
  })
})
