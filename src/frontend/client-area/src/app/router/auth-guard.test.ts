import { describe, expect, it } from 'vitest'
import { resolveAuthGuardRedirect, shouldBootHome } from './auth-guard'

describe('resolveAuthGuardRedirect', () => {
  it('redirects unauthenticated users from requiresAuth routes to login with redirect query', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/instances?page=2',
        matched: [{ meta: { requiresAuth: true } }],
      },
      false,
    )).toEqual({
      path: '/login',
      query: { redirect: '/instances?page=2' },
    })
  })

  it('allows access to requiresAuth routes only when session has a hydrated user', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/instances',
        matched: [{ meta: { requiresAuth: true } }],
      },
      true,
    )).toBe(true)
  })

  it('treats gate-hint-without-user as unauthenticated on requiresAuth routes', () => {
    // hasUser=false models isLoggedInGate() true but no session.user after hydrate
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/instances',
        matched: [{ meta: { requiresAuth: true } }],
      },
      false,
    )).toEqual({
      path: '/login',
      query: { redirect: '/instances' },
    })
  })

  it('sanitizes unsafe fullPath into a safe redirect query', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '//evil.example/phish',
        matched: [{ meta: { requiresAuth: true } }],
      },
      false,
    )).toEqual({
      path: '/login',
      query: { redirect: '/' },
    })
  })

  it('does not redirect public routes when signed out', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/login',
        matched: [{ meta: { requiresAuth: false } }],
      },
      false,
    )).toBe(true)
  })

  it('treats missing requiresAuth as public', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/',
        matched: [{ meta: {} }],
      },
      false,
    )).toBe(true)
  })
})

describe('shouldBootHome', () => {
  it('skips the pre-login /home on standalone routes', () => {
    expect(shouldBootHome({ matched: [{ meta: { requiresAuth: false, standalone: true } }] }, false)).toBe(false)
  })

  it('boots /home on a standalone route gated on the edition (the gate needs it before the page starts)', () => {
    expect(shouldBootHome({ matched: [{ meta: { requiresAuth: false, standalone: true, paidArea: 'admin-area' } }] }, false)).toBe(true)
  })

  it('boots /home on a regular route while home is not hydrated', () => {
    expect(shouldBootHome({ matched: [{ meta: { requiresAuth: false } }] }, false)).toBe(true)
  })

  it('skips /home when only a nested child is standalone', () => {
    expect(shouldBootHome({
      matched: [{ meta: { requiresAuth: false } }, { meta: { standalone: true } }],
    }, false)).toBe(false)
  })

  it('boots /home when nothing matched yet', () => {
    expect(shouldBootHome({ matched: [] }, false)).toBe(true)
  })

  it('does not boot /home again once home is hydrated', () => {
    expect(shouldBootHome({ matched: [{ meta: { requiresAuth: true } }] }, true)).toBe(false)
  })
})
