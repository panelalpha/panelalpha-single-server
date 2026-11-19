import { describe, expect, it } from 'vitest'
import { resolveHubCompleteOutcome } from './hub-complete-outcome'

const retry = { state: 's1', result: 'r1' }

function failed (status: number | undefined, data?: unknown) {
  return { ok: false as const, error: status === undefined ? new Error('network') : { response: { status, data } } }
}

describe('resolveHubCompleteOutcome', () => {
  it('connected leaves for the summary', () => {
    expect(resolveHubCompleteOutcome({ ok: true, data: { status: 'connected' } }, 's1', 'r1'))
      .toEqual({ next: 'summary', failure: '', retry: null })
  })

  it('pending stays and keeps state and result for Check again', () => {
    expect(resolveHubCompleteOutcome({ ok: true, data: { status: 'pending' } }, 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'pending', retry })
  })

  it('any other status stays with that status and no retry', () => {
    expect(resolveHubCompleteOutcome({ ok: true, data: { status: 'denied' } }, 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'denied', retry: null })
  })

  it('409 confirming stays as pending', () => {
    expect(resolveHubCompleteOutcome(failed(409, { code: 'confirming' }), 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'pending', retry })
  })

  it('409 without confirming (or without data) leaves for the login', () => {
    expect(resolveHubCompleteOutcome(failed(409, { code: 'other' }), 's1', 'r1').next).toBe('login')
    expect(resolveHubCompleteOutcome(failed(409), 's1', 'r1').next).toBe('login')
    expect(resolveHubCompleteOutcome(failed(409, null), 's1', 'r1').next).toBe('login')
  })

  it('422 is expired', () => {
    expect(resolveHubCompleteOutcome(failed(422), 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'expired', retry: null })
  })

  it('other errors and a missing response are unreachable', () => {
    expect(resolveHubCompleteOutcome(failed(500), 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'unreachable', retry: null })
    expect(resolveHubCompleteOutcome(failed(undefined), 's1', 'r1'))
      .toEqual({ next: 'stay', failure: 'unreachable', retry: null })
    expect(resolveHubCompleteOutcome({ ok: false, error: null }, 's1', 'r1').failure).toBe('unreachable')
  })
})
