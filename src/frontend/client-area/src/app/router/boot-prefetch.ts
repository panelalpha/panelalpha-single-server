import type { RouteComponent, RouteLocationNormalizedGeneric, Router } from 'vue-router'
import { getHomeCached } from '@/shared/session/session.api'
import { shouldBootHome } from './auth-guard'

/**
 * Start `GET /home` for the first URL while the translations still load. The guard reads the same
 * `cachedGet` entry (`ensureHome` → `getHomeCached()`), so the request is not repeated, only started earlier. Skipped where the
 * guard does not boot `/home` first: `/hub-login` (POST of the ticket first) and `standalone` routes (SSO login).
 */
export function prefetchBootHome (
  router: Pick<Router, 'resolve'>,
  url: string,
  fetchHome: () => Promise<unknown> = () => getHomeCached(),
): boolean {
  let to: ReturnType<Router['resolve']>
  try {
    to = router.resolve(url)
  } catch {
    return false
  }
  if (to.name === 'hub-login' || !shouldBootHome(to, false)) {
    return false
  }
  // A failed request is dropped from the cache (`cached-get.ts`), so the guard simply asks again.
  void fetchHome().catch(() => {})
  return true
}

type RouteComponentSlot = RouteComponent | (() => Promise<unknown>)

/** Stricter than vue-router `isRouteComponent` (it also skips `emits`): a function without these keys is a lazy loader, not a functional component. */
function isLazyLoader (component: RouteComponentSlot): component is RouteComponentSlot & (() => Promise<unknown>) {
  return typeof component === 'function'
    && !('displayName' in component)
    && !('props' in component)
    && !('emits' in component)
    && !('__vccOpts' in component)
}

/**
 * Start the lazy chunks of the target route at the top of `beforeEach`, so they download while the guard
 * waits for `/home`. vue-router calls the same loaders again after the guards (the result here is not stored on the record);
 * `import()` of one module resolves once. So a loader that reads state when it is called (`withProviderIcons` reads the providers
 * of `/home`) still sees `/home` on that second call. Errors are left to it as well (chunk reload, `chunk-reload.ts`).
 * Accepted cost: a signed-out visitor of a protected URL also fetches its chunks before the auth gate sends them to `/login`;
 * skipping `requiresAuth` routes while the user is unknown would drop the gain for every signed-in cold start.
 */
export function prefetchRouteComponents (to: Pick<RouteLocationNormalizedGeneric, 'matched'>): number {
  let started = 0
  for (const record of to.matched) {
    for (const component of Object.values(record.components ?? {})) {
      if (isLazyLoader(component)) {
        started += 1
        void Promise.resolve()
          .then(() => component())
          .catch(() => {})
      }
    }
  }
  return started
}
