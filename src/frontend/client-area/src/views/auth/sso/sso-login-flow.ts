import type { HomeResponse } from '@/shared/session/session.api'
import { isReseller, syncStyleManagerFlag } from '@/shared/session/style-manager-flag'
import { resolveSsoLoginDestination } from './sso-login-redirect'

/**
 * Pending copy on /sso-login. Legacy writes it straight into `#app` as a plain English string,
 * not an i18n key, so it stays a constant outside the template.
 */
export const SSO_PENDING_TEXT = 'Redirecting... Please wait.'

export type SsoLoginFlowResult = 'navigated' | 'no-user' | 'failed'

export interface SsoLoginFlowDeps {
  exchange: () => Promise<HomeResponse>
  navigate: (to: { path: string, query?: Record<string, string> }) => Promise<unknown>
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  origin: string
  query: { redirect?: unknown, branding?: unknown }
}

/**
 * Flow after the token exchange: sync the style-manager flag for non-resellers,
 * then navigate once. A missing `user` makes legacy throw and stay on the screen ('no-user').
 */
export async function runSsoLoginFlow (deps: SsoLoginFlowDeps): Promise<SsoLoginFlowResult> {
  let home: HomeResponse
  try {
    home = await deps.exchange()
  } catch {
    return 'failed'
  }

  if (home.user == null) {
    return 'no-user'
  }

  if (!isReseller(home.user)) {
    try {
      syncStyleManagerFlag(deps.storage, deps.origin, deps.query.branding)
    } catch {
      // The flag is best-effort (blocked storage, quota): a valid session must still reach its destination.
    }
  }

  try {
    await deps.navigate(resolveSsoLoginDestination(home, deps.query.redirect))
  } catch {
    // A rejected navigation (e.g. aborted by a guard) keeps legacy's behavior: nothing more to do.
  }
  return 'navigated'
}
