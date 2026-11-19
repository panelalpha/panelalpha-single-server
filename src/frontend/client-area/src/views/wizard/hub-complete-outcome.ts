export type HubCompleteSettled
  = | { ok: true, data: { status: string } }
    | { ok: false, error: unknown }

export interface HubCompleteOutcome {
  /** `summary` and `login` leave the screen, `stay` keeps it. */
  next: 'summary' | 'login' | 'stay'
  failure: string
  retry: { state: string, result: string } | null
}

interface ResponseLike {
  response?: {
    status?: number
    data?: { code?: string } | null
  }
}

/**
 * The branches for the answer of `POST /community/hub/complete` or its error.
 * For `login` (409 without `confirming`) `failure` and `retry` are not used: the view leaves the screen and keeps its state.
 */
export function resolveHubCompleteOutcome (settled: HubCompleteSettled, state: string, result: string): HubCompleteOutcome {
  if (settled.ok) {
    const { status } = settled.data
    if (status === 'connected') {
      return { next: 'summary', failure: '', retry: null }
    }
    return { next: 'stay', failure: status, retry: status === 'pending' ? { state, result } : null }
  }

  const response = (settled.error as ResponseLike | null | undefined)?.response
  if (response?.status === 409 && response.data?.code === 'confirming') {
    // The same return is being confirmed (second tab, double click): the state is still valid.
    return { next: 'stay', failure: 'pending', retry: { state, result } }
  }
  if (response?.status === 409) {
    return { next: 'login', failure: '', retry: null }
  }
  // 422 means the panel no longer knows this state; 5xx/network can be checked again.
  return { next: 'stay', failure: response?.status === 422 ? 'expired' : 'unreachable', retry: null }
}
