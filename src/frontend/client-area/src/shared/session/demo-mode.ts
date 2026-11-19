/** Replaces legacy VUE_APP_DEMO_MODE / Vuex demoMode for login autofill. */
export const DEMO_EMAIL = 'demo@panelalpha.com'
export const DEMO_PASSWORD = 'Password123'

export function isDemoMode (
  env: { VITE_DEMO_MODE?: string } = import.meta.env,
): boolean {
  return env.VITE_DEMO_MODE === 'true'
}

export function getDemoCredentials (): { email: string, password: string } {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD }
}

/** Presence of account_already_exists in the query (value may be empty). */
export function hasAccountAlreadyExistsQuery (
  query: Record<string, unknown> | { [key: string]: unknown },
): boolean {
  return Object.prototype.hasOwnProperty.call(query, 'account_already_exists')
}
