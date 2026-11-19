import type { HomeResponse, LoginResponse } from './session.api'

export type PostLoginDestination
  = | { kind: 'external', url: string }
    | { kind: 'route', path: string, query?: Record<string, string> }

const SCHEME_AT_START = /^[a-z][a-z0-9+.-]*:/i

/**
 * Allow only same-app relative paths: single leading `/`, no scheme, no `//`.
 * Parses path + query via a fake origin so `?foo=bar` becomes a query object.
 */
export function sanitizeInternalPath (
  raw: string,
): { path: string, query?: Record<string, string> } | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null
  }
  if (trimmed.includes('://') || SCHEME_AT_START.test(trimmed)) {
    return null
  }

  try {
    const url = new URL(trimmed, 'https://spa.local')
    if (url.origin !== 'https://spa.local') {
      return null
    }
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
      return null
    }

    const query: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value
    }

    if (Object.keys(query).length > 0) {
      return { path: url.pathname, query }
    }
    return { path: url.pathname }
  } catch {
    return null
  }
}

function trySameOriginAbsolute (redirectTo: string): PostLoginDestination | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const url = new URL(redirectTo)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    if (url.hostname !== window.location.hostname) {
      return null
    }
    // Prefer converting same-origin absolute URLs to an internal route.
    const internal = sanitizeInternalPath(`${url.pathname}${url.search}`)
    if (internal) {
      return { kind: 'route', path: internal.path, query: internal.query }
    }
    return { kind: 'external', url: redirectTo }
  } catch {
    return null
  }
}

/**
 * Where a redirect value the API hands us points, when it is safe to follow: an internal path, or a same-origin absolute URL
 * turned into its internal route. Anything else (another origin, `javascript:`, `//host`, backslashes) gives null. This is the
 * gate of `redirect_to` and of `after_register_redirect_url`.
 */
export function resolveSafeRedirect (raw: string): PostLoginDestination | null {
  const internal = sanitizeInternalPath(raw)
  if (internal) {
    return { kind: 'route', path: internal.path, query: internal.query }
  }
  return trySameOriginAbsolute(raw)
}

/**
 * Resolve where to send the user after a successful login / 2FA / verify-code.
 * Same as legacy: API redirect_to wins (when safe); else forced account flags;
 * else safe ?redirect= or "/".
 */
export function resolvePostLoginDestination (options: {
  response?: Pick<LoginResponse, 'redirect_to' | 'admin' | 'user'> | HomeResponse | null
  redirectQuery?: string | null | (string | null)[]
}): PostLoginDestination {
  const redirectTo = options.response && 'redirect_to' in options.response
    ? options.response.redirect_to
    : undefined

  if (redirectTo) {
    const destination = resolveSafeRedirect(redirectTo)
    if (destination) {
      return destination
    }
    // Unsafe redirect_to: ignore and fall through.
  }

  const user = options.response && 'user' in options.response
    ? options.response.user
    : undefined
  const admin = options.response && 'admin' in options.response
    ? options.response.admin
    : undefined

  // Legacy only forces account redirects when not an admin impersonation payload.
  if (admin === undefined && user?.password_change_required) {
    return {
      kind: 'route',
      path: '/my-account',
      query: { change_password_required: 'true' },
    }
  }

  if (admin === undefined && user?.two_factor_auth_required) {
    return {
      kind: 'route',
      path: '/my-account',
      query: { two_factor_auth_required: 'true' },
    }
  }

  const raw = options.redirectQuery
  const redirect = Array.isArray(raw) ? raw[0] : raw
  if (typeof redirect === 'string' && redirect.length > 0) {
    const sanitized = sanitizeInternalPath(redirect)
    if (sanitized) {
      return { kind: 'route', path: sanitized.path, query: sanitized.query }
    }
  }

  return { kind: 'route', path: '/' }
}
