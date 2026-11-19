import { describe, expect, it } from 'vitest'
import { CANCEL_REASON_KEYS, canSubmit, describeAfterReasonPick, resolveCancelOutcome } from './cancel-service'

describe('cancel-service', () => {
  it('offers the six reasons in legacy order', () => {
    expect(CANCEL_REASON_KEYS.map(key => key.split('.').pop())).toEqual(['performance', 'expensive', 'support', 'technical', 'panel', 'other'])
  })

  it('allows Submit from a reason and 10 characters, not from 9 or without a reason', () => {
    expect(canSubmit('Too expensive', '123456789')).toBe(false)
    expect(canSubmit('Too expensive', '1234567890')).toBe(true)
    expect(canSubmit('', '1234567890')).toBe(false)
    expect(canSubmit(null, '1234567890')).toBe(false)
    expect(canSubmit(undefined, 'x'.repeat(50))).toBe(false)
  })

  it('fills an empty description with the picked reason and leaves typed text alone', () => {
    expect(describeAfterReasonPick('Too expensive', '')).toBe('Too expensive')
    expect(describeAfterReasonPick('Too expensive', 'my own words')).toBe('my own words')
  })

  it('redirects when the answer has a cancel_url, otherwise reports the plan cancelled', () => {
    expect(resolveCancelOutcome({ cancel_url: 'https://pay.test/cancel' })).toEqual({ redirect: 'https://pay.test/cancel' })
    expect(resolveCancelOutcome({})).toEqual({ cancelled: true })
    expect(resolveCancelOutcome(undefined)).toEqual({ cancelled: true })
    expect(resolveCancelOutcome({ cancel_url: '' })).toEqual({ cancelled: true })
  })
})
