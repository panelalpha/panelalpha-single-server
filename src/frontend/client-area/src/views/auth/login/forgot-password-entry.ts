import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { emit as emitAppEvent } from '@/shared/events/app-events'

export interface ForgotPasswordEntrySession {
  remoteAuthCheck: () => Promise<boolean>
}

/**
 * A visitor with a live session leaves `/forgot-password`
 * before the form renders. Returns the redirect target (`?redirect=` or `/`), or `undefined` to show the form.
 * A failed `remoteAuthCheck` never blocks the form.
 */
export async function resolveForgotPasswordEntry (
  to: Pick<RouteLocationNormalized, 'query'>,
  session: ForgotPasswordEntrySession,
): Promise<RouteLocationRaw | undefined> {
  const loggedIn = await session.remoteAuthCheck().catch(() => false)
  if (!loggedIn) {
    return undefined
  }

  emitAppEvent('after-login')
  return (to.query.redirect as string | undefined) || '/'
}
