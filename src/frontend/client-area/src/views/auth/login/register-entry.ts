import type { LoginEntrySession } from './login-entry'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { resolvePostLoginDestination } from '@/shared/session/login-redirect'

/**
 * A visitor with a live session leaves `/register` before the form renders.
 * Same redirect as `resolveLoginEntry`, but without `after-login` (legacy Register does not emit it).
 * Returns the redirect target, `false` when the target is external (the page navigates away), or `undefined` to show the form.
 * A failed `remoteAuthCheck` never blocks the form.
 */
export async function resolveRegisterEntry (
  to: Pick<RouteLocationNormalized, 'query'>,
  session: LoginEntrySession,
): Promise<RouteLocationRaw | false | undefined> {
  const loggedIn = await session.remoteAuthCheck().catch(() => false)
  if (!loggedIn) {
    return undefined
  }

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
