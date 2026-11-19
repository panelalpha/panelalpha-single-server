import type { HubCompleteResult, HubStatus } from '@/entities/hub/hub.api'
import { isHttpUrl } from '@/entities/hub/hub-connection'
import { getErrorMessages } from '@/shared/api/error-message'
import { resolveHubCompleteOutcome } from './hub-complete-outcome'

// Step 1 of the wizard (calls of the Community panel `/community/hub*` instead of
// `/configurator/hub*`). The pure part of the step: the name of the account, the answers of the Hub calls and their outcomes.

export type ConnectState = 'idle' | 'completing' | 'connected'

export interface HubReturn {
  state: string
  result: string
}

/** The Hub may send "first last" with both parts equal; the name is shown once. */
export function displayAccountName (name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 2 && parts[0] === parts[1]) {
    return parts[0]!
  }
  return trimmed
}

/** English text of a failed Connect try; the key is `setup.wizard.connect.failure.<failure>`. An unknown status reads as unreachable. */
const FAILURE_COPY: Record<string, string> = {
  denied: 'Not connected. The request was denied on PanelAlpha.',
  expired: 'The link expired or the connection could not be confirmed. Start again.',
  unreachable: 'PanelAlpha could not be reached. Try again in a moment.',
  unsupported: 'PanelAlpha did not share an email address for this account, so the connection could not be finished.',
  pending: 'PanelAlpha has not confirmed the connection yet. Check again in a moment.',
}

export function failureCopy (failure: string): { key: string, defaultValue: string } {
  const known = Object.hasOwn(FAILURE_COPY, failure) ? failure : 'unreachable'
  return { key: `setup.wizard.connect.failure.${known}`, defaultValue: FAILURE_COPY[known]! }
}

export interface ConnectDeps {
  fetchCsrfCookie: () => Promise<unknown>
  getFreeHub: () => Promise<HubStatus>
  startFreeHub: (adminUrl: string, serverName?: string) => Promise<{ link: string }>
  completeFreeHub: (state: string, result: string) => Promise<HubCompleteResult>
  /** The browser leaves the SPA for the Hub (`window.location.assign`). */
  assignLocation: (url: string) => void
  /** The session is read again after a pairing (a guest is signed in by the panel then) and after a conflict, before the sign-in. */
  refreshHome: () => Promise<unknown>
}

export interface PairingStatus {
  connected: boolean
  accountName: string
}

/** `GET /community/hub`. A failed call leaves the step as it is (the source swallows it). */
export async function loadConnectStatus (deps: Pick<ConnectDeps, 'getFreeHub'>): Promise<PairingStatus> {
  try {
    const data = await deps.getFreeHub()
    return { connected: !!data.paired, accountName: data.account_name ?? '' }
  } catch {
    return { connected: false, accountName: '' }
  }
}

export type ConnectCompleteOutcome
  = | { kind: 'connected', accountName: string, hubUrl: string | null }
  // Someone else finished the setup first (409): `/home` is read again and the user signs in.
    | { kind: 'login' }
    | { kind: 'failed', failure: string, retry: HubReturn | null }

/** `POST /community/hub/complete` and what its answer or error means (`resolveHubCompleteOutcome`). */
export async function completeConnect (hubReturn: HubReturn, deps: ConnectDeps): Promise<ConnectCompleteOutcome> {
  const { state, result } = hubReturn
  let data: HubCompleteResult
  try {
    data = await deps.completeFreeHub(state, result)
  } catch (error) {
    const outcome = resolveHubCompleteOutcome({ ok: false, error }, state, result)
    if (outcome.next === 'login') {
      await refreshQuietly(deps)
      return { kind: 'login' }
    }
    return { kind: 'failed', failure: outcome.failure, retry: outcome.retry }
  }

  const outcome = resolveHubCompleteOutcome({ ok: true, data }, state, result)
  if (outcome.next !== 'summary') {
    return { kind: 'failed', failure: outcome.failure, retry: outcome.retry }
  }
  await refreshQuietly(deps)
  // The answer of the panel may not carry the name; the status call has it.
  const accountName = data.account_name ?? (await loadConnectStatus(deps)).accountName
  return { kind: 'connected', accountName, hubUrl: data.hub_url ?? null }
}

async function refreshQuietly (deps: Pick<ConnectDeps, 'refreshHome'>): Promise<void> {
  try {
    await deps.refreshHome()
  } catch {
    // The pairing itself succeeded; the shell catches up on the next reload.
  }
}

/** `failure` names the copy (`failureCopy`) when the start failed without a message of the panel. */
export type ConnectStartOutcome = { kind: 'redirected' } | { kind: 'failed', messages: string[], failure?: string }

/** `POST /community/hub/start` with the origin of the panel, then the browser goes to the link. */
export async function startConnect (origin: string, serverName: string | undefined, deps: ConnectDeps): Promise<ConnectStartOutcome> {
  try {
    await deps.fetchCsrfCookie()
    const { link } = await deps.startFreeHub(origin, serverName)
    if (!isHttpUrl(link)) {
      return { kind: 'failed', messages: [], failure: 'unreachable' }
    }
    deps.assignLocation(link)
    return { kind: 'redirected' }
  } catch (error) {
    return { kind: 'failed', messages: getErrorMessages(error) }
  }
}
