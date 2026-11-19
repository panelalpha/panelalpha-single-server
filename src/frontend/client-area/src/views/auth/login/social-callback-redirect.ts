import type { HomeResponse } from '@/shared/session/session.api'

export type SocialCallbackDestination = {
  path: string
  query?: Record<string, string>
}

/**
 * Locked SocialLogin success matrix: forced account flags → /my-account;
 * else /projects for app-lite (single_server.active) or /instances for app.
 * Does not honor redirect_to / ?redirect= (unlike resolvePostLoginDestination).
 * Forced-account admin/pwd/2FA branches stay aligned with resolvePostLoginDestination.
 */
export function resolveSocialCallbackDestination (
  response: Pick<HomeResponse, 'admin' | 'user'> & Partial<Pick<HomeResponse, 'app'>>,
): SocialCallbackDestination {
  const admin = 'admin' in response ? response.admin : undefined
  const user = response.user

  // Legacy only forces account redirects when not an admin impersonation payload.
  if (admin === undefined && user?.password_change_required) {
    return {
      path: '/my-account',
      query: { change_password_required: 'true' },
    }
  }

  if (admin === undefined && user?.two_factor_auth_required) {
    return {
      path: '/my-account',
      query: { two_factor_auth_required: 'true' },
    }
  }

  if (response.app?.single_server?.active === true) {
    return { path: '/projects' }
  }

  return { path: '/instances' }
}

function readErrorType (error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  if (!('response' in error)) {
    return undefined
  }
  const response = (error as { response?: unknown }).response
  if (!response || typeof response !== 'object') {
    return undefined
  }
  if (!('data' in response)) {
    return undefined
  }
  const data = (response as { data?: unknown }).data
  if (!data || typeof data !== 'object') {
    return undefined
  }
  if (!('error_type' in data)) {
    return undefined
  }
  const errorType = (data as { error_type?: unknown }).error_type
  return typeof errorType === 'string' ? errorType : undefined
}

/** Null-safe failure matrix: account_already_exists → login query; else plain /login. */
export function resolveSocialCallbackFailure (error: unknown): SocialCallbackDestination {
  if (readErrorType(error) === 'account_already_exists') {
    return {
      path: '/login',
      query: { account_already_exists: 'true' },
    }
  }

  return { path: '/login' }
}
