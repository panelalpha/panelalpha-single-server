import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { showVersionRow, trialState } from './site-details'

const now = new Date('2026-10-16T12:00:00Z')
const t = (key: string): string => key

function trial (overrides: Partial<Pick<InstanceResource, 'service_is_trial' | 'service_trial_expiry_at' | 'plan_upgrade_link'>> = {}) {
  return {
    service_is_trial: true,
    service_trial_expiry_at: '2026-10-20T12:00:00Z',
    plan_upgrade_link: 'https://example.test/upgrade',
    ...overrides,
  }
}

describe('trialState', () => {
  it('returns an empty state without a trial', () => {
    expect(trialState({ service_is_trial: false, service_trial_expiry_at: '2026-10-20T12:00:00Z', plan_upgrade_link: 'x' }, t, now))
      .toEqual({ isTrial: false, expired: false, text: '', upgradeUrl: 'x' })
  })

  it('reads a missing trial flag as no trial', () => {
    expect(trialState({ service_is_trial: undefined, service_trial_expiry_at: undefined, plan_upgrade_link: undefined }, t, now))
      .toEqual({ isTrial: false, expired: false, text: '', upgradeUrl: '' })
  })

  it('uses the expires text before the expiry date', () => {
    expect(trialState(trial(), t, now)).toEqual({
      isTrial: true,
      expired: false,
      text: 'general.trialExpires in 4 days',
      upgradeUrl: 'https://example.test/upgrade',
    })
  })

  it('uses the expired text after the expiry date', () => {
    const state = trialState(trial({ service_trial_expiry_at: '2026-10-10T12:00:00Z' }), t, now)
    expect(state.expired).toBe(true)
    expect(state.text).toBe('general.trialExpired 6 days ago')
  })

  it('does not treat the exact expiry instant as expired', () => {
    expect(trialState(trial({ service_trial_expiry_at: now.toISOString() }), t, now).expired).toBe(false)
  })

  it('shows no text for a trial with an unreadable expiry date', () => {
    expect(trialState(trial({ service_trial_expiry_at: null }), t, now)).toEqual({
      isTrial: true,
      expired: false,
      text: '',
      upgradeUrl: 'https://example.test/upgrade',
    })
  })

  it('returns an empty upgrade URL when the plan has no link', () => {
    expect(trialState(trial({ plan_upgrade_link: null }), t, now).upgradeUrl).toBe('')
    expect(trialState(trial({ plan_upgrade_link: '' }), t, now).upgradeUrl).toBe('')
  })
})

describe('showVersionRow', () => {
  it('hides the row when the WordPress version is explicitly null', () => {
    expect(showVersionRow({ status: { wordpress: null } } as Pick<InstanceResource, 'status'>)).toBe(false)
  })

  it('shows the row for a known version', () => {
    expect(showVersionRow({ status: { wordpress: '6.8' } } as Pick<InstanceResource, 'status'>)).toBe(true)
  })

  it('shows the row when the version is undefined', () => {
    expect(showVersionRow({ status: { wordpress: undefined } } as Pick<InstanceResource, 'status'>)).toBe(true)
  })
})
