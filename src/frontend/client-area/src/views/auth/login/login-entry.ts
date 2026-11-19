import type { HomeResponse } from '@/shared/session/session.api'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { emit as emitAppEvent } from '@/shared/events/app-events'
import { resolvePostLoginDestination } from '@/shared/session/login-redirect'

export interface LoginEntrySession {
  home: HomeResponse | null
  remoteAuthCheck: () => Promise<boolean>
}

/**
 * A visitor with a live session leaves `/login` before the form renders.
 * Returns the redirect target, `false` when the target is external (the page navigates away), or `undefined` to show the form.
 * A failed `remoteAuthCheck` never blocks the form. Already-authed invite accept is out of scope: navigate without accept.
 */
export async function resolveLoginEntry (
  to: Pick<RouteLocationNormalized, 'query'>,
  session: LoginEntrySession,
): Promise<RouteLocationRaw | false | undefined> {
  const loggedIn = await session.remoteAuthCheck().catch(() => false)
  if (!loggedIn) {
    return undefined
  }

  emitAppEvent('after-login')
  const destination = resolvePostLoginDestination({
    response: session.home ?? { app: {} },
    redirectQuery: to.query.redirect as string | undefined,
  })
  if (destination.kind === 'external') {
    window.location.href = destination.url
    return false
  }
  return { path: destination.path, query: destination.query }
}
