import type { RouteLocationNormalized } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emit } from '@/shared/events/app-events'
import { type LoginEntrySession, resolveLoginEntry } from './login-entry'

vi.mock('@/shared/events/app-events', () => ({
  emit: vi.fn(),
}))

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

describe('resolveLoginEntry', () => {
  beforeEach(() => {
    vi.mocked(emit).mockClear()
  })

  it('lets an anonymous visitor reach the form without emitting after-login', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockResolvedValue(false) })

    await expect(resolveLoginEntry(to(), s)).resolves.toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
  })

  it('lets the visitor reach the form when remoteAuthCheck throws', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockRejectedValue(new Error('offline')) })

    await expect(resolveLoginEntry(to(), s)).resolves.toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
  })

  it('redirects a logged-in visitor to the default list and emits after-login', async () => {
    await expect(resolveLoginEntry(to(), session())).resolves.toEqual({ path: '/', query: undefined })
    expect(emit).toHaveBeenCalledWith('after-login')
  })

  it('redirects a logged-in visitor to a safe ?redirect= target', async () => {
    await expect(resolveLoginEntry(to({ redirect: '/instances?page=2' }), session())).resolves.toEqual({
      path: '/instances',
      query: { page: '2' },
    })
  })

  it('redirects to the forced my-account stub when a password change is required', async () => {
    const s = session({
      home: { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c', password_change_required: true } } as never,
    })

    await expect(resolveLoginEntry(to({ redirect: '/instances' }), s)).resolves.toEqual({
      path: '/my-account',
      query: { change_password_required: 'true' },
    })
  })

  it('falls back to the default route when home is not loaded', async () => {
    await expect(resolveLoginEntry(to(), session({ home: null }))).resolves.toEqual({ path: '/', query: undefined })
  })
})
