import type { HomeService } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { getTrialService, hasExpiredTrial, trialUpgradeUrl, trialVariant } from './trial-rules'

const NOW = new Date('2026-10-05T12:00:00Z')
function service (overrides: Record<string, unknown> = {}): HomeService {
  return {
    id: 1,
    status: 'active',
    is_trial: true,
    trial_expiry_at: '2026-10-10T12:00:00Z',
    plan_upgrade_link: 'https://example.com/upgrade',
    ...overrides,
  }
}

describe('getTrialService', () => {
  it('takes the first active or suspended trial service', () => {
    const first = service({ id: 2, status: 'suspended' })
    expect(getTrialService([service({ id: 1, is_trial: false }), service({ id: 3, status: 'cancelled' }), first, service({ id: 4 })])).toBe(first)
  })

  it('is null without services or without a trial', () => {
    expect(getTrialService(undefined)).toBeNull()
    expect(getTrialService([service({ is_trial: false })])).toBeNull()
    expect(getTrialService([service({ status: 'terminated' })])).toBeNull()
  })
})

describe('trialVariant', () => {
  it('is warning before the expiry and danger after it', () => {
    expect(trialVariant([service()], NOW)).toBe('warning')
    expect(trialVariant([service({ trial_expiry_at: '2026-10-02T12:00:00Z' })], NOW)).toBe('danger')
  })

  it('is null without a trial service', () => {
    expect(trialVariant([], NOW)).toBeNull()
    expect(trialVariant(undefined, NOW)).toBeNull()
  })
})

describe('hasExpiredTrial', () => {
  it('is true only for an expired trial service', () => {
    expect(hasExpiredTrial([service({ trial_expiry_at: '2026-10-02T12:00:00Z' })], NOW)).toBe(true)
    expect(hasExpiredTrial([service()], NOW)).toBe(false)
    expect(hasExpiredTrial([], NOW)).toBe(false)
    expect(hasExpiredTrial(undefined, NOW)).toBe(false)
  })
})

describe('trialUpgradeUrl', () => {
  it('returns the plan upgrade link or an empty string', () => {
    expect(trialUpgradeUrl([service()])).toBe('https://example.com/upgrade')
    expect(trialUpgradeUrl([service({ plan_upgrade_link: undefined })])).toBe('')
    expect(trialUpgradeUrl([])).toBe('')
  })
})
