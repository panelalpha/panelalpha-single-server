import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it, vi } from 'vitest'
import { runSocialCallback, type SocialCallbackFlowDeps } from './social-callback-flow'

function makeDeps (overrides: Partial<SocialCallbackFlowDeps> = {}) {
  return {
    provider: 'google',
    stateParam: undefined,
    href: 'https://app.example.com/auth/google/callback?code=1',
    replaceLocation: vi.fn(),
    socialLogin: vi.fn(async () => ({ user: { email: 'a@b.c' } }) as unknown as HomeResponse),
    emitAfterLogin: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  }
}

describe('runSocialCallback', () => {
  it('jumps to reseller host and does nothing else', async () => {
    const deps = makeDeps({ stateParam: JSON.stringify({ reseller_domain: 'reseller.test' }) })
    await runSocialCallback(deps)
    expect(deps.replaceLocation).toHaveBeenCalledWith('https://reseller.test/auth/google/callback?code=1')
    expect(deps.socialLogin).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
  })

  it('navigates to /instances on plain success', async () => {
    const deps = makeDeps()
    await runSocialCallback(deps)
    expect(deps.socialLogin).toHaveBeenCalledWith('google')
    expect(deps.navigate).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledWith({ path: '/instances' })
  })

  it('navigates to /projects for single-server', async () => {
    const deps = makeDeps({
      socialLogin: vi.fn(async () => ({
        user: { email: 'a@b.c' },
        app: { single_server: { active: true } },
      }) as unknown as HomeResponse),
    })
    await runSocialCallback(deps)
    expect(deps.navigate).toHaveBeenCalledWith({ path: '/projects' })
  })

  it('navigates to /my-account when 2FA is required', async () => {
    const deps = makeDeps({
      socialLogin: vi.fn(async () => ({
        user: { email: 'a@b.c', two_factor_auth_required: true },
      }) as unknown as HomeResponse),
    })
    await runSocialCallback(deps)
    expect(deps.navigate).toHaveBeenCalledWith({
      path: '/my-account',
      query: { two_factor_auth_required: 'true' },
    })
  })

  it('navigates to login with flag on account_already_exists', async () => {
    const deps = makeDeps({
      socialLogin: vi.fn(async () => {
        throw { response: { data: { error_type: 'account_already_exists' } } }
      }),
    })
    await runSocialCallback(deps)
    expect(deps.navigate).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledWith({
      path: '/login',
      query: { account_already_exists: 'true' },
    })
  })

  it('emits after-login on success, before navigating', async () => {
    const deps = makeDeps()
    await runSocialCallback(deps)
    expect(deps.emitAfterLogin).toHaveBeenCalledTimes(1)
    expect(deps.emitAfterLogin.mock.invocationCallOrder[0]).toBeLessThan(deps.navigate.mock.invocationCallOrder[0])
  })

  it('does not emit after-login when social login fails', async () => {
    const deps = makeDeps({
      socialLogin: vi.fn(async () => {
        throw new Error('Network Error')
      }),
    })
    await runSocialCallback(deps)
    expect(deps.emitAfterLogin).not.toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith({ path: '/login' })
  })

  it('navigates to /login on network error without response', async () => {
    const deps = makeDeps({
      socialLogin: vi.fn(async () => {
        throw new Error('Network Error')
      }),
    })
    await runSocialCallback(deps)
    expect(deps.navigate).toHaveBeenCalledWith({ path: '/login' })
  })

  it('does not navigate twice when navigate throws synchronously', async () => {
    const navigate = vi.fn(() => {
      throw new Error('boom')
    })
    const deps = makeDeps({ navigate })
    await expect(runSocialCallback(deps)).resolves.toBeUndefined()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('does not navigate twice when navigate returns a rejected promise', async () => {
    const navigate = vi.fn(() => Promise.reject(new Error('nav failed')))
    const deps = makeDeps({ navigate })
    await expect(runSocialCallback(deps)).resolves.toBeUndefined()
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
