import type { LocationQuery } from 'vue-router'
import { FREE_HUB_RETURN_KEY } from '@/entities/hub/hub-return'

// Connect sends the browser back to `/hub-connected?state&result`.
// A pairing started from Settings returns there (`free-hub-return`); one started by the wizard returns to
// `/wizard/panelalpha-connect`, which completes it. The route runs before any guard, so a guest in the wizard keeps `state` and `result`.

type ReturnStorage = Pick<Storage, 'getItem' | 'removeItem'>

export interface HubConnectedRedirect {
  path: '/wizard/panelalpha-connect' | '/settings'
  query: { state: LocationQuery[string] | undefined, result: LocationQuery[string] | undefined }
}

export function resolveHubConnectedRedirect (query: LocationQuery, storage: ReturnStorage | null): HubConnectedRedirect {
  let path: HubConnectedRedirect['path'] = '/wizard/panelalpha-connect'
  try {
    if (storage?.getItem(FREE_HUB_RETURN_KEY) === 'settings') {
      storage.removeItem(FREE_HUB_RETURN_KEY)
      path = '/settings'
    }
  } catch {
    // No storage: the wizard completes the pairing too.
  }
  return { path, query: { state: query.state, result: query.result } }
}
