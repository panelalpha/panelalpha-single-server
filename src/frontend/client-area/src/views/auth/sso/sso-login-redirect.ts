import type { HomeResponse } from '@/shared/session/session.api'
import { sanitizeInternalPath } from '@/shared/session/login-redirect'
import { preferredSpaBase } from '@/shared/session/preferred-spa-base'

/**
 * Where /sso-login goes after a successful exchange. Legacy pushes `?redirect=` as-is;
 * next only accepts safe internal paths and falls back to the base SPA path otherwise.
 */
export function resolveSsoLoginDestination (
  home: HomeResponse,
  redirectQuery: unknown,
): { path: string, query?: Record<string, string> } {
  const redirect = Array.isArray(redirectQuery) ? redirectQuery[0] : redirectQuery
  if (typeof redirect === 'string' && redirect.length > 0) {
    const sanitized = sanitizeInternalPath(redirect)
    if (sanitized) {
      return sanitized
    }
  }
  return { path: preferredSpaBase(home) }
}
