import type { InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLoggedInFlag, loggedInStorageKey, setLoggedInFlag } from '@/shared/session/session.gate'
import { useSessionStore } from '@/shared/session/session.store'
import { api, isBareLoginRedirectPath, resetUnauthorizedRedirect } from './client'

describe('api', () => {
  beforeEach(() => {
    clearLoggedInFlag()
    resetUnauthorizedRedirect()
  })

  afterEach(() => {
    clearLoggedInFlag()
    vi.unstubAllGlobals()
  })

  it('calls PanelAlpha with the session cookie and XSRF token', () => {
    expect(api.defaults.baseURL).toBe('/api')
    expect(api.defaults.withCredentials).toBe(true)
    expect(api.defaults.withXSRFToken).toBe(true)
  })

  it('on 401 clears the logged-in flag and redirects away from protected routes', async () => {
    setLoggedInFlag()
    const assign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/instances',
      search: '?page=2',
      assign,
      origin: window.location.origin,
    })

    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: unknown) => Promise<unknown> }>
    }).handlers
    const rejected = handlers.find(handler => handler.rejected)?.rejected
    expect(rejected).toBeTypeOf('function')

    await expect(
      rejected!({ response: { status: 401 } }),
    ).rejects.toEqual({ response: { status: 401 } })

    expect(localStorage.getItem(loggedInStorageKey())).toBeNull()
    expect(assign).toHaveBeenCalledWith('/login?redirect=%2Finstances%3Fpage%3D2')
  })

  it('several 401 at once lead to one redirect (audit D10)', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/instances',
      search: '',
      assign,
      origin: window.location.origin,
    })
    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: unknown) => Promise<unknown> }>
    }).handlers
    const rejected = handlers.find(handler => handler.rejected)?.rejected

    await Promise.allSettled([
      rejected!({ response: { status: 401 } }),
      rejected!({ response: { status: 401 } }),
      rejected!({ response: { status: 401 } }),
    ])

    expect(assign).toHaveBeenCalledTimes(1)

    // A page that stayed (or came back from the bfcache) redirects again on the next 401.
    window.dispatchEvent(new Event('pageshow'))
    await rejected!({ response: { status: 401 } }).catch(() => undefined)
    expect(assign).toHaveBeenCalledTimes(2)
  })

  it('on 401 at /sso-login redirects to a bare /login without redirect-back', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/sso-login',
      search: '?token=abc',
      assign,
      origin: window.location.origin,
    })

    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: unknown) => Promise<unknown> }>
    }).handlers
    const rejected = handlers.find(handler => handler.rejected)?.rejected

    await expect(
      rejected!({ response: { status: 401 } }),
    ).rejects.toEqual({ response: { status: 401 } })

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('on 401 from the social login callback redirects to bare /login without ?redirect=', async () => {
    setLoggedInFlag()
    const assign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/auth/google/callback',
      search: '?code=abc',
      assign,
      origin: window.location.origin,
    })

    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: unknown) => Promise<unknown> }>
    }).handlers
    const rejected = handlers.find(handler => handler.rejected)?.rejected

    await expect(
      rejected!({ response: { status: 401 } }),
    ).rejects.toEqual({ response: { status: 401 } })

    expect(localStorage.getItem(loggedInStorageKey())).toBeNull()
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('isBareLoginRedirectPath matches only /sso-login and the social login callback', () => {
    expect(isBareLoginRedirectPath('/sso-login')).toBe(true)
    expect(isBareLoginRedirectPath('/sso-login/')).toBe(true)
    expect(isBareLoginRedirectPath('/hub-login')).toBe(true)
    expect(isBareLoginRedirectPath('/hub-login/')).toBe(true)
    expect(isBareLoginRedirectPath('/hub-login/x')).toBe(false)
    expect(isBareLoginRedirectPath('/auth/google/callback')).toBe(true)
    expect(isBareLoginRedirectPath('/instances')).toBe(false)
    expect(isBareLoginRedirectPath('/sso-login/x')).toBe(false)
    expect(isBareLoginRedirectPath('/auth/google/callback/x')).toBe(false)
  })

  it('on 401 does not redirect when already on /login', async () => {
    setLoggedInFlag()
    const assign = vi.fn()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/login',
      assign,
      origin: window.location.origin,
    })

    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: unknown) => Promise<unknown> }>
    }).handlers
    const rejected = handlers.find(handler => handler.rejected)?.rejected

    await expect(
      rejected!({ response: { status: 401 } }),
    ).rejects.toEqual({ response: { status: 401 } })

    expect(localStorage.getItem(loggedInStorageKey())).toBeNull()
    expect(assign).not.toHaveBeenCalled()
  })

  describe('resource path rewrite (app-lite single server)', () => {
    type RequestHandlers = { handlers: Array<{ fulfilled?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }> }

    function rewrite (url: string): string | undefined {
      const handlers = (api.interceptors.request as unknown as RequestHandlers).handlers
      const fulfilled = handlers.find(handler => handler?.fulfilled)?.fulfilled
      expect(fulfilled).toBeTypeOf('function')
      return fulfilled!({ url, headers: {} } as InternalAxiosRequestConfig).url
    }

    function homeWith (singleServer: { active: boolean } | undefined) {
      setActivePinia(createPinia())
      useSessionStore().hydrateHome({ app: { single_server: singleServer }, user: {} } as never)
    }

    it('reads instances as projects in every request path when single_server.active', () => {
      homeWith({ active: true })
      expect(rewrite('/instances')).toBe('/projects')
      expect(rewrite('/instances/5/deploy-logs/live?offset=3')).toBe('/projects/5/deploy-logs/live?offset=3')
      expect(rewrite('/instances?page=1')).toBe('/projects?page=1')
      expect(rewrite('/server-accounts/3/instances')).toBe('/server-accounts/3/projects')
      expect(rewrite('/labels')).toBe('/labels')
      expect(rewrite('/instances-other')).toBe('/instances-other')
    })

    it('leaves the multi-server paths as they are', () => {
      homeWith({ active: false })
      expect(rewrite('/instances/5/clear-cache')).toBe('/instances/5/clear-cache')
      homeWith(undefined)
      expect(rewrite('/instances')).toBe('/instances')
    })

    it('leaves the path as it is while Pinia holds no home yet', () => {
      setActivePinia(createPinia())
      expect(rewrite('/instances')).toBe('/instances')
    })
  })
})
