import type { HubCompleteResult, HubStatus } from './hub.api'
import type { LocationQuery } from 'vue-router'

// The state machine of the Hub section without the DOM.

export interface HubRetry {
  state: string
  result: string
}

export interface HubPairing {
  connected: boolean
  accountName: string
}

/** `applyPairing`: the status call (and a disconnect) gives the pairing. */
export function pairingOf (data: HubStatus): HubPairing {
  return { connected: !!data.paired, accountName: data.account_name || '' }
}

export interface CompleteOutcome {
  /** The pairing to show, when the answer is `connected`. */
  pairing: HubPairing | null
  /** `/home` is refreshed after a connected answer only. */
  refreshHome: boolean
  /** The toast key for `denied | expired | pending`. */
  toastKey: string | null
  /** A pending answer keeps the state, so the panel can be checked again. */
  retry: HubRetry | null
}

/**
 * The toast key of a `denied | expired | pending` answer (anything else, e.g. `unsupported`, keeps its old key). ui-fix-v2: `denied` and
 * `pending` say "PanelAlpha Hub" (keys of the front; their `defaultValue` texts are copy of the Settings view, `hub-copy.ts`).
 */
export function toastKeyOf (status: string): string {
  return status === 'denied' || status === 'pending' ? `settings.panelalphaHub.toast.${status}` : `settings.hub.${status}`
}

/** What a `POST /community/hub/complete` answer does to the section. */
export function outcomeOf (data: HubCompleteResult, retry: HubRetry): CompleteOutcome {
  if (data.status === 'connected') {
    return { pairing: pairingOf({ ...data, paired: true }), refreshHome: true, toastKey: null, retry: null }
  }
  // denied | expired | pending
  return {
    pairing: null,
    refreshHome: false,
    toastKey: toastKeyOf(data.status),
    retry: data.status === 'pending' ? retry : null,
  }
}

/** After a failed complete: 422 means the panel no longer knows this state; 409 / 502 / network can be checked again. */
export function retryAfterError (error: unknown, current: HubRetry | null): HubRetry | null {
  const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status
  return status === 422 ? null : current
}

/** The Hub return in the address bar (`state`, `result` as strings; `result` may be missing). */
export function hubReturnOf (query: LocationQuery): HubRetry | null {
  const first = (value: LocationQuery[string]) => (Array.isArray(value) ? value[0] : value)
  const state = first(query.state)
  if (!state) {
    return null
  }
  const result = first(query.result)
  return { state: String(state), result: result ? String(result) : '' }
}

/** Never leave the state in the address bar; the rest of the query (Settings' `tab`) stays. */
export function queryWithoutHubReturn (query: LocationQuery): LocationQuery {
  const next = { ...query }
  delete next.state
  delete next.result
  return next
}

/** An address the browser may follow: absolute `http:` or `https:` (the Hub link and the Hub account page come from the API of the panel). */
export function isHttpUrl (value: string | null | undefined): value is string {
  if (!value) {
    return false
  }
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
