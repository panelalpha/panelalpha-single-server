import type { LocationQuery } from 'vue-router'

export interface HubLoginRouteLike {
  name?: string | symbol | null
  path: string
  query: LocationQuery
}

/** The ticket sits in the URL hash (`/hub-login#ticket=<jwt>`). */
export function readHubTicket (hash: string): string | null {
  return new URLSearchParams(hash.slice(1)).get('ticket')
}

/**
 * Where a ticket for one app lands (the `redirect` of `POST /hub-login`, the Hub's "Open in panel"): only the project
 * page the panel built from its own id, `/projects/<id>`; anything else is no destination (the dashboard).
 */
export function hubLoginDestination (redirect: unknown): string | null {
  return typeof redirect === 'string' && /^\/projects\/[1-9]\d{0,17}$/.test(redirect) ? redirect : null
}

/**
 * Guard decision for the one-time hub exchange: the first pass onto `hub-login` is redirected to the same path and
 * query without the hash (vue-router would otherwise write the `fullPath` with the ticket back). Later passes go on.
 */
export function hubLoginRedirect (
  to: HubLoginRouteLike,
  started: boolean,
): { path: string, query: LocationQuery, replace: true } | undefined {
  if (to.name !== 'hub-login' || started) {
    return undefined
  }

  return { path: to.path, query: to.query, replace: true }
}
