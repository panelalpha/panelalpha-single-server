import type { HomeResponse } from '@/shared/session/session.api'
import type { LocationQuery, RouteLocationRaw } from 'vue-router'
import { hasResellerAreaAccess } from '@/app/shell/navbar/navbar-rules'
import { isFreePanel } from '@/app/shell/navbar/user-menu-rules'

/** The areas only a paid edition serves; every edition's Client Area registers their pages. */
export type PaidArea = 'reseller-area' | 'admin-area'

/**
 * Who offers an area: the navbar's own rule where there is a tab, else the edition `/home` names.
 * A guest has no `user` to read the reseller settings from, so the edition decides and the auth guard sends them to sign in.
 */
const AREA_OFFERED: Record<PaidArea, (home: HomeResponse) => boolean> = {
  'reseller-area': home => home.user ? hasResellerAreaAccess(home) : !isFreePanel(home),
  'admin-area': home => !isFreePanel(home),
}

export interface PaidAreaRouteLike {
  path: string
  query?: LocationQuery
  hash?: string
  matched: ReadonlyArray<{ meta: Record<string, unknown> }>
}

function isPaidArea (value: unknown): value is PaidArea {
  return typeof value === 'string' && value in AREA_OFFERED
}

/** The catch-all not-found record under the same path, where an unknown address lands. */
function notFoundLocation (to: PaidAreaRouteLike): RouteLocationRaw {
  return {
    name: 'error',
    params: { pathMatch: to.path.split('/').filter(segment => segment !== '') },
    query: to.query,
    hash: to.hash,
    replace: true,
  }
}

/** The not-found location for a page of an area the edition does not offer; nothing while `/home` is unknown. */
export function resolvePaidAreaRedirect (
  to: PaidAreaRouteLike,
  home: HomeResponse | null | undefined,
): RouteLocationRaw | undefined {
  const areas = to.matched
    .map(record => record.meta.paidArea)
    .filter(isPaidArea)

  if (areas.length === 0 || !home?.app) {
    return undefined
  }

  return areas.some(area => AREA_OFFERED[area](home)) ? undefined : notFoundLocation(to)
}
