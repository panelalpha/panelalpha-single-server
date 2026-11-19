/**
 * Auth gate redirect for protected routes.
 * Unauthenticated access → `/login?redirect=<safePath>` (legacy parity, with the path sanitized).
 * requiresAuth allows navigation only when session has a hydrated user,
 * not merely localStorage+XSRF gate hints.
 */

import { sanitizeInternalPath } from '@/shared/session/login-redirect'

export interface AuthGuardRouteLike {
  fullPath: string
  matched: ReadonlyArray<{ meta: Record<string, unknown> }>
}

export type AuthGuardResult
  = | true
    | { path: '/login', query: { redirect: string } }

/** Rebuild a safe redirect query value from sanitizeInternalPath output. */
function safeRedirectQuery (fullPath: string): string {
  const sanitized = sanitizeInternalPath(fullPath)
  if (!sanitized) {
    return '/'
  }
  if (!sanitized.query) {
    return sanitized.path
  }
  return `${sanitized.path}?${new URLSearchParams(sanitized.query).toString()}`
}

export function resolveAuthGuardRedirect (
  to: AuthGuardRouteLike,
  hasUser: boolean,
): AuthGuardResult {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth === true)

  if (requiresAuth && !hasUser) {
    return {
      path: '/login',
      query: { redirect: safeRedirectQuery(to.fullPath) },
    }
  }

  return true
}

/**
 * Pre-login GET /home before every navigation until the app is hydrated. A `standalone` route (SSO login) skips it:
 * legacy calls nothing before its own POST there, so the route starts its flow itself. A paid area's page boots it
 * even so: only `/home` says whether the edition serves it.
 */
export function shouldBootHome (
  to: Pick<AuthGuardRouteLike, 'matched'>,
  hasHomeApp: boolean,
): boolean {
  if (hasHomeApp) {
    return false
  }

  if (to.matched.some(record => record.meta.paidArea !== undefined)) {
    return true
  }

  return !to.matched.some(record => record.meta.standalone === true)
}
