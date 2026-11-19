import type * as SessionApi from './session.api'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet, clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  clearTestCookies,
  installTestCookies,
  setTestCookie,
} from './cookie-jar.fixtures'
import { onSessionCleared } from './session-reset'
import * as sessionApi from './session.api'
import { clearLoggedInFlag, setLoggedInFlag } from './session.gate'
import { useSessionStore } from './session.store'

const actualSessionApi = await vi.importActual<typeof SessionApi>('./session.api')

vi.mock('./session.api', async importOriginal => {
  const actual: typeof SessionApi = await importOriginal()
  return {
    ...actual,
    getHomeCached: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    verifyEmailCode: vi.fn(),
    postSocialCallback: vi.fn(),
    postSsoLogin: vi.fn(),
    postHubLogin: vi.fn(),
    submitTwoFactorChallenge: vi.fn(),
  }
})

const HOME = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c', services: [{ id: 1 }] } }

// `getHomeCached` runs the real cache with `api.get` spied, so the tests see the requests the cache lets through.
const apiGet = vi.spyOn(api, 'get')

describe('useSessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    setActivePinia(createPinia())
    installTestCookies()
    clearLoggedInFlag()
    clearTestCookies()
    vi.clearAllMocks()
    clearAllCachedGet()
    vi.mocked(sessionApi.getHomeCached).mockReset()
    vi.mocked(sessionApi.getHomeCached).mockImplementation(actualSessionApi.getHomeCached)
    apiGet.mockReset()
    apiGet.mockResolvedValue({ data: HOME } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    clearLoggedInFlag()
    clearTestCookies()
  })

  /** Primes a cache entry on an url no session action touches, then reports whether the action cleared it. */
  async function clearsCache (action: () => Promise<unknown>): Promise<boolean> {
    await cachedGet('/labels')
    await action()
    const before = apiGet.mock.calls.length
    await cachedGet('/labels')
    return apiGet.mock.calls.length > before
  }

  it('starts signed out', () => {
    const session = useSessionStore()

    expect(session.isLoggedIn).toBe(false)
    expect(session.home).toBeNull()
    expect(session.services).toEqual([])
  })

  it('patchUser merges into the cached home user and ignores a missing home', () => {
    const session = useSessionStore()

    session.patchUser({ email: 'ignored@example.com' })
    expect(session.home).toBeNull()

    session.hydrateHome({ app: {}, user: { email: 'a@example.com', language: 'en' } })
    session.patchUser({ email: 'b@example.com' })

    expect(session.user).toEqual({ email: 'b@example.com', language: 'en' })
  })

  it('isLoggedIn requires flag and XSRF cookie', () => {
    const session = useSessionStore()

    setLoggedInFlag()
    session.markLoggedIn()
    expect(session.isLoggedIn).toBe(false)

    setTestCookie('XSRF-TOKEN', 'token')
    session.markLoggedIn()
    expect(session.isLoggedIn).toBe(true)
  })

  it('hydrates home and services from login success', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = {
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c', services: [{ id: 1 }] },
    }
    vi.mocked(sessionApi.login).mockResolvedValueOnce(home)

    const session = useSessionStore()
    await session.login({ email: 'a@b.c', password: 'secret' })

    expect(session.home).toEqual(home)
    expect(session.user?.email).toBe('a@b.c')
    expect(session.services).toEqual([{ id: 1 }])
    expect(session.isLoggedIn).toBe(true)
  })

  it('does not mark logged in on intermediate login flags', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.login).mockResolvedValueOnce({ two_factor: true })

    const session = useSessionStore()
    await session.login({ email: 'a@b.c', password: 'secret' })

    expect(session.isLoggedIn).toBe(false)
    expect(session.home).toBeNull()
  })

  it('login clears the cache after hydrating home, but not on an intermediate flag', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const session = useSessionStore()

    vi.mocked(sessionApi.login).mockResolvedValueOnce({ two_factor: true })
    expect(await clearsCache(() => session.login({ email: 'a@b.c', password: 'x' }))).toBe(false)

    vi.mocked(sessionApi.login).mockResolvedValueOnce(HOME)
    expect(await clearsCache(() => session.login({ email: 'a@b.c', password: 'x' }))).toBe(true)
    expect(session.home).toEqual(HOME)
  })

  it('completes 2FA via challenge then GET /home with seconds 0, and clears the cache', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.submitTwoFactorChallenge).mockResolvedValueOnce(undefined)
    const home = {
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c', services: [] },
    }
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce(home)

    const session = useSessionStore()
    expect(await clearsCache(async () => {
      await session.completeTwoFactor({ code: '123456' })
    })).toBe(true)

    expect(sessionApi.submitTwoFactorChallenge).toHaveBeenCalledWith({ code: '123456' })
    expect(sessionApi.getHomeCached).toHaveBeenCalledWith(0)
    expect(session.home).toEqual(home)
    expect(session.isLoggedIn).toBe(true)
  })

  it('clears gate and home on logout', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    setLoggedInFlag()
    const session = useSessionStore()
    session.hydrateHome({ app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } })
    session.markLoggedIn()
    vi.mocked(sessionApi.logout).mockResolvedValueOnce(undefined)

    expect(await clearsCache(() => session.logout())).toBe(true)

    expect(session.home).toBeNull()
    expect(session.isLoggedIn).toBe(false)
  })

  it('runs the registered sign-out handlers on logout (the SSL caches of the ssl entity)', async () => {
    const handler = vi.fn()
    onSessionCleared(handler)
    const session = useSessionStore()
    vi.mocked(sessionApi.logout).mockResolvedValueOnce(undefined)

    await session.logout()

    expect(handler).toHaveBeenCalled()
  })

  it('clearSession (401 path) clears the cache', async () => {
    const session = useSessionStore()

    expect(await clearsCache(async () => session.clearSession())).toBe(true)
  })

  it('remoteAuthCheck sets gate when /home has a user', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce({
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c', services: [] },
    })

    const session = useSessionStore()
    await expect(session.remoteAuthCheck()).resolves.toBe(true)
    expect(sessionApi.getHomeCached).toHaveBeenCalledWith(0)
    expect(session.isLoggedIn).toBe(true)
  })

  it('remoteAuthCheck clears gate when /home has no user', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    setLoggedInFlag()
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce({
      app: { name: 'PanelAlpha' },
    })

    const session = useSessionStore()
    await expect(session.remoteAuthCheck()).resolves.toBe(false)
    expect(session.isLoggedIn).toBe(false)
  })

  it('remoteAuthCheck reuses the /home of the running boot navigation once (audit D6)', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const session = useSessionStore()
    session.hydrateHome({ app: { name: 'PanelAlpha' }, user: { email: 'a@b.c', services: [] } })
    session.markBootHome(true)

    await expect(session.remoteAuthCheck()).resolves.toBe(true)
    expect(sessionApi.getHomeCached).not.toHaveBeenCalled()
    expect(session.isLoggedIn).toBe(true)

    // The mark is spent: the next check asks the server again.
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce({ app: { name: 'PanelAlpha' } })
    await expect(session.remoteAuthCheck()).resolves.toBe(false)
    expect(sessionApi.getHomeCached).toHaveBeenCalledWith(0)
  })

  it('remoteAuthCheck asks the server when the boot mark is cleared', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const session = useSessionStore()
    session.hydrateHome({ app: { name: 'PanelAlpha' } })
    session.markBootHome(true)
    session.markBootHome(false)
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce(HOME)

    await expect(session.remoteAuthCheck()).resolves.toBe(true)
    expect(sessionApi.getHomeCached).toHaveBeenCalledWith(0)
  })

  it('hydrates home and marks logged in on register success', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = {
      app: { name: 'PanelAlpha' },
      user: { email: 'new@example.com', services: [{ id: 2 }] },
    }
    vi.mocked(sessionApi.register).mockResolvedValueOnce(home)

    const session = useSessionStore()
    await session.register({ email: 'new@example.com', password: 'secret123' })

    expect(session.home).toEqual(home)
    expect(session.user?.email).toBe('new@example.com')
    expect(session.services).toEqual([{ id: 2 }])
    expect(session.isLoggedIn).toBe(true)
  })

  it('does not mark logged in on register set_password intermediate', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.register).mockResolvedValueOnce({ set_password: true })

    const session = useSessionStore()
    await session.register({ email: 'new@example.com' })

    expect(session.isLoggedIn).toBe(false)
    expect(session.home).toBeNull()
  })

  it('does not mark logged in on register verify_email intermediate', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.register).mockResolvedValueOnce({ verify_email: true })

    const session = useSessionStore()
    await session.register({ email: 'new@example.com', password: 'secret123' })

    expect(session.isLoggedIn).toBe(false)
    expect(session.home).toBeNull()
  })

  it('register clears the cache on success only', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const session = useSessionStore()

    vi.mocked(sessionApi.register).mockResolvedValueOnce({ verify_email: true })
    expect(await clearsCache(() => session.register({ email: 'new@example.com', password: 'secret123' }))).toBe(false)

    vi.mocked(sessionApi.register).mockResolvedValueOnce(HOME)
    expect(await clearsCache(() => session.register({ email: 'new@example.com', password: 'secret123' }))).toBe(true)
  })

  it('verifyEmailCode clears the cache on success only', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const session = useSessionStore()

    vi.mocked(sessionApi.verifyEmailCode).mockResolvedValueOnce({ use_password: true })
    expect(await clearsCache(() => session.verifyEmailCode('123456'))).toBe(false)

    vi.mocked(sessionApi.verifyEmailCode).mockResolvedValueOnce(HOME)
    expect(await clearsCache(() => session.verifyEmailCode('123456'))).toBe(true)
    expect(session.isLoggedIn).toBe(true)
  })

  it('hydrates home and marks logged in on socialLogin success', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = {
      app: { name: 'PanelAlpha' },
      user: { email: 'social@example.com', services: [{ id: 3 }] },
    }
    vi.mocked(sessionApi.postSocialCallback).mockResolvedValueOnce(home)

    const session = useSessionStore()
    await session.socialLogin('github', '?code=abc')

    expect(sessionApi.postSocialCallback).toHaveBeenCalledWith('github', '?code=abc')
    expect(session.home).toEqual(home)
    expect(session.user?.email).toBe('social@example.com')
    expect(session.services).toEqual([{ id: 3 }])
    expect(session.isLoggedIn).toBe(true)
  })

  it('hydrates home and marks logged in on any 2xx socialLogin response without app', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = { user: { email: 'social@example.com', services: [] } }
    vi.mocked(sessionApi.postSocialCallback).mockResolvedValueOnce(home as never)

    const session = useSessionStore()
    await session.socialLogin('github', '?code=abc')

    expect(session.home).toEqual(home)
    expect(session.isLoggedIn).toBe(true)
  })

  it('socialLogin clears the cache on success', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postSocialCallback).mockResolvedValueOnce(HOME)

    const session = useSessionStore()
    expect(await clearsCache(() => session.socialLogin('github', '?code=abc'))).toBe(true)
  })

  it('does not mark logged in when socialLogin fails', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postSocialCallback).mockRejectedValueOnce(new Error('oauth failed'))

    const session = useSessionStore()
    await expect(session.socialLogin('github', '?code=bad')).rejects.toThrow('oauth failed')
    expect(session.isLoggedIn).toBe(false)
    expect(session.home).toBeNull()
  })

  it('ssoLogin POSTs the token, marks the session, then forces GET /home', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = { app: { name: 'PanelAlpha' }, user: { email: 'sso@example.com' } }
    const session = useSessionStore()
    // A pre-login /home is already cached: the forced GET must still happen.
    session.hydrateHome({ app: { name: 'PanelAlpha' } })
    vi.mocked(sessionApi.postSsoLogin).mockImplementationOnce(async () => {
      expect(session.isLoggedIn).toBe(false)
    })
    vi.mocked(sessionApi.getHomeCached).mockImplementationOnce(async () => {
      expect(session.isLoggedIn).toBe(true)
      return home
    })

    await expect(session.ssoLogin('abc')).resolves.toEqual(home)

    expect(sessionApi.postSsoLogin).toHaveBeenCalledWith('abc')
    expect(vi.mocked(sessionApi.postSsoLogin).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(sessionApi.getHomeCached).mock.invocationCallOrder[0]!)
    expect(sessionApi.getHomeCached).toHaveBeenCalledWith(0)
    expect(session.home).toEqual(home)
  })

  it('ssoLogin does not clear the cache', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postSsoLogin).mockResolvedValueOnce(undefined)

    const session = useSessionStore()
    expect(await clearsCache(() => session.ssoLogin('abc'))).toBe(false)
  })

  it('ssoLogin does not mark logged in or GET /home when the POST rejects', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postSsoLogin).mockRejectedValueOnce(new Error('bad token'))

    const session = useSessionStore()
    await expect(session.ssoLogin('bad')).rejects.toThrow('bad token')

    expect(session.isLoggedIn).toBe(false)
    expect(sessionApi.getHomeCached).not.toHaveBeenCalled()
  })

  it('ssoLogin exchanges the token once per page load and reuses cached /home afterwards', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = { app: { name: 'PanelAlpha' }, user: { email: 'sso@example.com' } }
    vi.mocked(sessionApi.postSsoLogin).mockResolvedValueOnce(undefined)
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce(home)

    const session = useSessionStore()
    await session.ssoLogin('abc')
    await expect(session.ssoLogin('abc')).resolves.toEqual(home)

    expect(sessionApi.postSsoLogin).toHaveBeenCalledTimes(1)
    expect(sessionApi.getHomeCached).toHaveBeenCalledTimes(1)
  })

  it('ssoLogin does not retry the POST after a failed exchange', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = { app: { name: 'PanelAlpha' } }
    vi.mocked(sessionApi.postSsoLogin).mockRejectedValueOnce(new Error('bad token'))
    vi.mocked(sessionApi.getHomeCached).mockResolvedValueOnce(home)

    const session = useSessionStore()
    await expect(session.ssoLogin('bad')).rejects.toThrow('bad token')
    await expect(session.ssoLogin('bad')).resolves.toEqual(home)

    expect(sessionApi.postSsoLogin).toHaveBeenCalledTimes(1)
  })

  it('hubLogin POSTs the ticket and marks the session without clearing the cache or reading /home', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postHubLogin).mockResolvedValueOnce(undefined)

    const session = useSessionStore()
    expect(session.hubExchangeStarted).toBe(false)
    expect(await clearsCache(() => session.hubLogin('tkt'))).toBe(false)

    expect(sessionApi.postHubLogin).toHaveBeenCalledWith('tkt')
    expect(session.hubExchangeStarted).toBe(true)
    expect(session.hubLoginFailed).toBe(false)
    expect(session.isLoggedIn).toBe(true)
    expect(sessionApi.getHomeCached).not.toHaveBeenCalled()
  })

  it('hubLogin keeps the project page a ticket for one app lands on, and nothing else', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postHubLogin).mockResolvedValueOnce('/projects/12')

    const session = useSessionStore()
    expect(session.hubLoginDestination).toBeNull()
    await session.hubLogin('tkt')
    expect(session.hubLoginDestination).toBe('/projects/12')

    setActivePinia(createPinia())
    vi.mocked(sessionApi.postHubLogin).mockResolvedValueOnce('https://evil.example/projects/12')
    const other = useSessionStore()
    await other.hubLogin('tkt')
    expect(other.hubLoginDestination).toBeNull()
    expect(other.isLoggedIn).toBe(true)
  })

  it('hubLogin without a ticket fails with no request, and the flag is set', async () => {
    const session = useSessionStore()
    await session.hubLogin(null)

    expect(sessionApi.postHubLogin).not.toHaveBeenCalled()
    expect(session.hubExchangeStarted).toBe(true)
    expect(session.hubLoginFailed).toBe(true)
    expect(session.isLoggedIn).toBe(false)
  })

  it('hubLogin swallows a rejected POST into hubLoginFailed', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.postHubLogin).mockRejectedValueOnce(new Error('bad ticket'))

    const session = useSessionStore()
    await expect(session.hubLogin('bad')).resolves.toBeUndefined()

    expect(session.hubExchangeStarted).toBe(true)
    expect(session.hubLoginFailed).toBe(true)
    expect(session.isLoggedIn).toBe(false)
  })

  it('hubLogin sets the started flag before the POST settles', async () => {
    let resolvePost: () => void = () => {}
    vi.mocked(sessionApi.postHubLogin).mockReturnValueOnce(new Promise<void>(resolve => {
      resolvePost = resolve
    }))

    const session = useSessionStore()
    const pending = session.hubLogin('tkt')
    expect(session.hubExchangeStarted).toBe(true)

    resolvePost()
    await pending
  })

  it('ensureHome reads /home through the cache and skips the request while a home is loaded', async () => {
    const session = useSessionStore()

    await session.ensureHome()
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/home', { timeout: 30_000 })
    expect(session.home).toEqual(HOME)

    await session.ensureHome()
    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('ensureHome(true) asks for a fresh /home', async () => {
    const session = useSessionStore()
    await session.ensureHome()

    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'))
    await session.ensureHome(true)

    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('refreshServices after login makes one GET /home, the next call none, and a patchUser before it survives', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    vi.mocked(sessionApi.login).mockResolvedValueOnce(HOME)
    const session = useSessionStore()
    await session.login({ email: 'a@b.c', password: 'secret' })
    apiGet.mockClear()
    apiGet.mockResolvedValueOnce({
      data: { app: HOME.app, user: { email: 'a@b.c', services: [{ id: 1 }, { id: 2 }] } },
    } as never)

    session.patchUser({ email: 'edited@example.com' })
    await session.refreshServices()
    await session.refreshServices()

    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/home', { timeout: 30_000 })
    expect(session.services).toEqual([{ id: 1 }, { id: 2 }])
    expect(session.user?.email).toBe('edited@example.com')
  })

  it('refreshServices replaces only user.services', async () => {
    const session = useSessionStore()
    session.hydrateHome({ app: { name: 'Old' }, user: { email: 'a@b.c', name: 'Jane', services: [] } })
    apiGet.mockResolvedValueOnce({
      data: { app: { name: 'New' }, user: { email: 'other@b.c', name: 'Other', services: [{ id: 9 }] } },
    } as never)

    await session.refreshServices()

    expect(session.home).toEqual({ app: { name: 'Old' }, user: { email: 'a@b.c', name: 'Jane', services: [{ id: 9 }] } })
  })

  it('does not introduce onboarding side effects on socialLogin success', async () => {
    setTestCookie('XSRF-TOKEN', 'token')
    const home = {
      app: { name: 'PanelAlpha' },
      user: { email: 'social@example.com', services: [] },
    }
    vi.mocked(sessionApi.postSocialCallback).mockResolvedValueOnce(home)

    const session = useSessionStore()
    const result = await session.socialLogin('github')

    expect(result).toEqual(home)
    expect(session.home).toEqual(home)
    expect(session.isLoggedIn).toBe(true)
  })
})
