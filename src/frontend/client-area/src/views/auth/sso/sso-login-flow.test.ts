import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it, vi } from 'vitest'
import { runSsoLoginFlow, type SsoLoginFlowDeps } from './sso-login-flow'

const origin = 'https://app.test'
const key = `${origin}-style-manager`

function setup (home: HomeResponse | Error, query: SsoLoginFlowDeps['query'] = {}, storedFlag?: string) {
  const calls: string[] = []
  const data = new Map<string, string>()
  if (storedFlag !== undefined) {
    data.set(key, storedFlag)
  }
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      calls.push('storage')
      data.set(k, v)
    },
    removeItem: (k: string) => {
      calls.push('storage')
      data.delete(k)
    },
  }
  const navigate = vi.fn((_to: { path: string, query?: Record<string, string> }) => {
    calls.push('navigate')
    return Promise.resolve()
  })
  const deps: SsoLoginFlowDeps = {
    exchange: () => (home instanceof Error ? Promise.reject(home) : Promise.resolve(home)),
    navigate,
    storage,
    origin,
    query,
  }
  return { deps, navigate, data, calls }
}

describe('runSsoLoginFlow', () => {
  it('returns failed without navigating or touching storage when the exchange rejects', async () => {
    const { deps, navigate, data, calls } = setup(new Error('401'), { branding: 'true' })
    await expect(runSsoLoginFlow(deps)).resolves.toBe('failed')
    expect(navigate).not.toHaveBeenCalled()
    expect(data.size).toBe(0)
    expect(calls).toEqual([])
  })

  it('returns no-user without navigating when home has no user', async () => {
    const { deps, navigate, calls } = setup({ app: {} }, { branding: 'true' })
    await expect(runSsoLoginFlow(deps)).resolves.toBe('no-user')
    expect(navigate).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('syncs the flag before navigating exactly once', async () => {
    const { deps, navigate, data, calls } = setup({ app: {}, user: {} }, { branding: 'true', redirect: '/my-account' })
    await expect(runSsoLoginFlow(deps)).resolves.toBe('navigated')
    expect(calls).toEqual(['storage', 'navigate'])
    expect(data.get(key)).toBe('true')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ path: '/my-account' })
  })

  it('navigates to the base path when redirect is unsafe', async () => {
    const { deps, navigate } = setup({ app: { single_server: { active: true } }, user: {} }, { redirect: '//evil.com' })
    await runSsoLoginFlow(deps)
    expect(navigate).toHaveBeenCalledWith({ path: '/projects' })
  })

  it('leaves the flag alone for resellers but still navigates', async () => {
    const { deps, navigate, data } = setup({ app: {}, user: { reseller_settings: {} } }, { branding: 'true' })
    await expect(runSsoLoginFlow(deps)).resolves.toBe('navigated')
    expect(data.size).toBe(0)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('removes the flag when branding is absent and it was on', async () => {
    const { deps, data } = setup({ app: {}, user: { reseller_settings: null } }, {}, 'true')
    await runSsoLoginFlow(deps)
    expect(data.has(key)).toBe(false)
  })

  it('still navigates when the storage throws', async () => {
    const { deps, navigate } = setup({ app: {}, user: {} }, { branding: 'true' })
    deps.storage.getItem = () => {
      throw new Error('SecurityError')
    }
    await expect(runSsoLoginFlow(deps)).resolves.toBe('navigated')
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected navigation', async () => {
    const { deps, navigate } = setup({ app: {}, user: {} })
    navigate.mockRejectedValueOnce(new Error('aborted'))
    await expect(runSsoLoginFlow(deps)).resolves.toBe('navigated')
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
