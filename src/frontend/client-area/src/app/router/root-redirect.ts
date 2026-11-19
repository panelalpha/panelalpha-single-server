import type { HomeResponse } from '@/shared/session/session.api'
import { preferredSpaBase } from '@/shared/session/preferred-spa-base'

/**
 * Where `/` leads: `/projects` under single server, `/instances` otherwise.
 * Resolved in `router.beforeEach`, after `/home` has been read: a static `redirect` is resolved before any guard
 * and would not know the single-server flag on a first load.
 */
export function resolveRootRedirect (
  to: { name?: string | symbol | null },
  home: Pick<HomeResponse, 'app'> | null | undefined,
): { path: '/projects' | '/instances', replace: true } | undefined {
  return to.name === 'home' ? { path: preferredSpaBase(home), replace: true } : undefined
}
