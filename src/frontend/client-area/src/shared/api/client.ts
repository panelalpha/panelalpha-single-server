import axios from 'axios'
import { sanitizeInternalPath } from '@/shared/session/login-redirect'
import { clearLoggedInFlag } from '@/shared/session/session.gate'
import { socialCallbackPathPattern } from '@/shared/session/social-callback-path'
import { isSingleServerActive, rewriteResourcePath } from './resource-paths'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  withXSRFToken: true,
})

/** The API base URL without a trailing slash, for URLs the browser loads itself (screenshots). */
export function apiBaseUrl (): string {
  const base = api.defaults.baseURL
  return typeof base === 'string' && base.length > 0 ? base.replace(/\/$/, '') : '/api'
}

// Under single server the `instances` segment of every request path reads `projects`
// (and the other way round). The multi-server branch leaves the path as it is.
api.interceptors.request.use(config => {
  if (config.url) {
    config.url = rewriteResourcePath(config.url, isSingleServerActive())
  }
  return config
})

/**
 * Paths where a 401 goes to a bare `/login`, without `?redirect=`: /sso-login, /hub-login, and the OAuth
 * callback, where a ?redirect= back would replay a spent code.
 */
export function isBareLoginRedirectPath (pathname: string): boolean {
  return /^\/(?:sso-login|hub-login)\/?$/.test(pathname) || socialCallbackPathPattern.test(pathname)
}

// Several requests failing with 401 at once (a list, the bell, the modes) lead to one full-page redirect, not one per request.
// The page does not always unload after it ("Stay on page" of a `beforeunload` prompt, a page back
// from the bfcache), so the mark only covers one burst: it clears after a few seconds and on `pageshow`.
const REDIRECT_BURST_MS = 3000
let redirectingAfter401 = false

/** For tests: forget the redirect of an earlier 401. */
export function resetUnauthorizedRedirect (): void {
  redirectingAfter401 = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', resetUnauthorizedRedirect)
}

function assignOnce (url: string): void {
  if (redirectingAfter401) {
    return
  }
  redirectingAfter401 = true
  setTimeout(resetUnauthorizedRedirect, REDIRECT_BURST_MS)
  window.location.assign(url)
}

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      clearLoggedInFlag()

      void import('@/shared/session/session.store').then(({ useSessionStore }) => {
        try {
          useSessionStore().clearSession()
        } catch {
          // Pinia may not be active (e.g. early boot / unit tests).
        }
      })

      if (isBareLoginRedirectPath(window.location.pathname)) {
        assignOnce('/login')
      } else if (!window.location.pathname.startsWith('/login')) {
        const fullPath = `${window.location.pathname}${window.location.search}`
        const sanitized = sanitizeInternalPath(fullPath)
        const safePath = sanitized
          ? `${sanitized.path}${sanitized.query ? `?${new URLSearchParams(sanitized.query).toString()}` : ''}`
          : '/'
        assignOnce(`/login?redirect=${encodeURIComponent(safePath)}`)
      }
    }

    return Promise.reject(error)
  },
)
