// The MCP state of an instance and the pure decision automaton.
// The functions take values, not refs, so the view keeps the refs and calls them. No I/O here.

import type { WordpressMcpStatus } from './wordpress-mcp.api'

/** `state` from `GET .../wordpress/mcp` plus the transient values the screen keeps while an action runs. */
export type McpState = 'disabled' | 'installing' | 'active' | 'endpoint_unavailable' | 'removing' | 'failed'

/** The action the user started on this screen; `null` when no action is pending. */
export type McpAction = 'enable' | 'disable'

/** What the screen keeps from a status payload: the state after the transient rules, plus endpoint and config (always from the API). */
export interface McpStatusSnapshot {
  state: McpState
  endpoint: string | null
  configJson: string | null
}

/** Polling interval of the status tick. */
export const MCP_POLL_INTERVAL_MS = 3000

/** The switch is on for installing, removing, active and endpoint_unavailable. */
export function isMcpOn (state: McpState): boolean {
  return ['installing', 'removing', 'active', 'endpoint_unavailable'].includes(state)
}

/** The switch is locked while installing or removing, a request is in flight, or the websocket update is awaited. */
export function isMcpBusy ({ state, submitting, awaitingWebsocketUpdate }: {
  state: McpState
  submitting: boolean
  awaitingWebsocketUpdate: boolean
}): boolean {
  return state === 'installing' || state === 'removing' || submitting || awaitingWebsocketUpdate
}

/** The raw state from the API, used when an action ends through the websocket (without the transient `installing`/`removing`). */
export function settleMcpStatus (payload: WordpressMcpStatus): McpStatusSnapshot {
  return {
    state: payload.state,
    endpoint: payload.endpoint,
    configJson: payload.config_json,
  }
}

/** Keeps `installing` after enable while the API still says `disabled`, and `removing` after disable while it still says `active` or `endpoint_unavailable`. */
export function applyMcpStatus (pending: McpAction | null, payload: WordpressMcpStatus): McpStatusSnapshot {
  const incoming = payload.state

  if (pending === 'enable' && incoming === 'disabled') {
    return { state: 'installing', endpoint: payload.endpoint, configJson: payload.config_json }
  }

  if (pending === 'disable' && (incoming === 'active' || incoming === 'endpoint_unavailable')) {
    return { state: 'removing', endpoint: payload.endpoint, configJson: payload.config_json }
  }

  return settleMcpStatus(payload)
}

/** Without a pending action it is `false`. */
export function isTerminalForAction (pending: McpAction | null, state: McpState): boolean {
  if (pending === 'enable') {
    return ['active', 'endpoint_unavailable', 'failed'].includes(state)
  }

  if (pending === 'disable') {
    return ['disabled', 'failed'].includes(state)
  }

  return false
}

/** Without an action, poll only while `installing` or `removing`; with an action, poll until the websocket update arrives and the state is terminal. */
export function shouldKeepPolling ({ pending, state, awaitingWebsocketUpdate }: {
  pending: McpAction | null
  state: McpState
  awaitingWebsocketUpdate: boolean
}): boolean {
  if (!pending) {
    return state === 'installing' || state === 'removing'
  }

  return awaitingWebsocketUpdate || !isTerminalForAction(pending, state)
}

/** Result of a finished action, for the alert. `key` is the short name under `heading.instance.advanced.wordpressMcp.`. */
export interface McpActionResult {
  success: boolean
  key: 'enableSuccess' | 'disableSuccess' | 'failed'
}

/** Enable succeeds on `active` or `endpoint_unavailable`, disable succeeds on `disabled`, anything else is `failed`. */
export function mcpActionResult (action: McpAction, state: McpState): McpActionResult {
  if (action === 'enable') {
    if (state === 'active' || state === 'endpoint_unavailable') {
      return { success: true, key: 'enableSuccess' }
    }
    return { success: false, key: 'failed' }
  }

  if (state === 'disabled') {
    return { success: true, key: 'disableSuccess' }
  }
  return { success: false, key: 'failed' }
}
