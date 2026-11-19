import type { LoginEntrySession } from './login-entry'
import type { RouteLocationNormalized } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { resolveRegisterEntry } from './register-entry'

function to (query: Record<string, string> = {}): Pick<RouteLocationNormalized, 'query'> {
  return { query }
}

function session (overrides: Partial<LoginEntrySession> = {}): LoginEntrySession {
  return {
    home: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } } as never,
    remoteAuthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('resolveRegisterEntry', () => {
  it('lets an anonymous visitor reach the form', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockResolvedValue(false) })

    await expect(resolveRegisterEntry(to(), s)).resolves.toBeUndefined()
  })

  it('lets the visitor reach the form when remoteAuthCheck throws', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockRejectedValue(new Error('offline')) })

    await expect(resolveRegisterEntry(to(), s)).resolves.toBeUndefined()
  })

  it('redirects a logged-in visitor to the default list', async () => {
    await expect(resolveRegisterEntry(to(), session())).resolves.toEqual({ path: '/', query: undefined })
  })

  it('redirects a logged-in visitor to a safe ?redirect= target', async () => {
    await expect(resolveRegisterEntry(to({ redirect: '/instances?page=2' }), session())).resolves.toEqual({
      path: '/instances',
      query: { page: '2' },
    })
  })

  it('falls back to the default route when home is not loaded', async () => {
    await expect(resolveRegisterEntry(to(), session({ home: null }))).resolves.toEqual({ path: '/', query: undefined })
  })
})
