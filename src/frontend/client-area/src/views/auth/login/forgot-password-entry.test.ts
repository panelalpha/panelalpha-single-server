import type { RouteLocationNormalized } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emit } from '@/shared/events/app-events'
import { type ForgotPasswordEntrySession, resolveForgotPasswordEntry } from './forgot-password-entry'

vi.mock('@/shared/events/app-events', () => ({
  emit: vi.fn(),
}))

function to (query: Record<string, string> = {}): Pick<RouteLocationNormalized, 'query'> {
  return { query }
}

function session (overrides: Partial<ForgotPasswordEntrySession> = {}): ForgotPasswordEntrySession {
  return {
    remoteAuthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('resolveForgotPasswordEntry', () => {
  beforeEach(() => {
    vi.mocked(emit).mockClear()
  })

  it('lets an anonymous visitor reach the form without emitting after-login', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockResolvedValue(false) })

    await expect(resolveForgotPasswordEntry(to(), s)).resolves.toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
  })

  it('lets the visitor reach the form when remoteAuthCheck throws', async () => {
    const s = session({ remoteAuthCheck: vi.fn().mockRejectedValue(new Error('offline')) })

    await expect(resolveForgotPasswordEntry(to(), s)).resolves.toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
  })

  it('redirects a logged-in visitor to the default route and emits after-login', async () => {
    await expect(resolveForgotPasswordEntry(to(), session())).resolves.toBe('/')
    expect(emit).toHaveBeenCalledWith('after-login')
  })

  it('redirects a logged-in visitor to the ?redirect= target', async () => {
    await expect(resolveForgotPasswordEntry(to({ redirect: '/instances' }), session())).resolves.toBe('/instances')
    expect(emit).toHaveBeenCalledWith('after-login')
  })
})
