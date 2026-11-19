import { api } from '@/shared/api/client'

// The Hub calls of the panel: status, start, complete and disconnect. `hubCancel` belongs to the setup wizard.
// The bodies are flat: legacy reads `response.data`.

export interface HubStatus {
  paired: boolean
  account_name?: string | null
  /** Address of the Hub account page (wizard: "Use another account"). */
  hub_url?: string | null
  connected_at?: string | null
}

/** `unsupported`: the Hub shared no email, so a guest's admin cannot be created (only the wizard's `complete` of a guest answers it). */
export type HubCompleteStatus = 'connected' | 'denied' | 'expired' | 'pending' | 'unsupported'

export interface HubCompleteResult {
  status: HubCompleteStatus
  account_name?: string | null
  hub_url?: string | null
  /** The panel finished the first-run setup with this call (a guest connected through Hub). */
  setup_completed?: boolean
  reported?: boolean
}

/** `GET /community/hub`. */
export async function getHubStatus (): Promise<HubStatus> {
  const { data } = await api.get<HubStatus>('/community/hub')
  return data
}

/** `POST /community/hub/start`: the Hub link to send the browser to. `server_name` is the wizard's: a guest sends the name the panel has. */
export async function startHub (body: { admin_url: string, server_name?: string }): Promise<{ link: string }> {
  const payload: { admin_url: string, server_name?: string } = { admin_url: body.admin_url }
  if (body.server_name !== undefined) {
    payload.server_name = body.server_name
  }
  const { data } = await api.post<{ link: string }>('/community/hub/start', payload)
  return data
}

/** `POST /community/hub/complete`: confirms the Hub return (the panel asks the Hub, up to ~10 s). */
export async function completeHub (body: { state: string, result: string }): Promise<HubCompleteResult> {
  const { data } = await api.post<HubCompleteResult>('/community/hub/complete', { state: body.state, result: body.result })
  return data
}

/** `POST /community/hub/disconnect` (used by the disconnect modal). */
export async function disconnectHub (): Promise<HubStatus> {
  const { data } = await api.post<HubStatus>('/community/hub/disconnect')
  return data
}
