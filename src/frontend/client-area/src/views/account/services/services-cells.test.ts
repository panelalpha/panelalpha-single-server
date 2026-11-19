import { describe, expect, it, vi } from 'vitest'
import { customLabelTone, domainTypeChip, statusChip, upgradeButtonColor } from './services-cells'

const t = (key: string) => key
const fromNow = vi.fn((date: string) => `in ${date}`)

describe('statusChip', () => {
  it('cancelled wins over suspended and trial', () => {
    expect(statusChip({ status: 'cancelled', is_trial: true }, t, fromNow)).toEqual({ type: 'expires', text: 'general.cancelled' })
  })

  it('suspended wins over trial', () => {
    expect(statusChip({ status: 'suspended', is_trial: true }, t, fromNow)).toEqual({ type: 'disabled', text: 'general.suspended' })
  })

  it('trial shows "Expires <fromNow>"', () => {
    expect(statusChip({ status: 'active', is_trial: true, trial_expiry_at: '2026-11-01' }, t, fromNow))
      .toEqual({ type: 'expires', text: 'Expires in 2026-11-01' })
  })

  it('billing off (trial: false) leaves the trial chip out and keeps cancelled and suspended (ID-56)', () => {
    expect(statusChip({ status: 'active', is_trial: true, trial_expiry_at: '2026-11-01' }, t, fromNow, { trial: false })).toBeNull()
    expect(statusChip({ status: 'suspended', is_trial: true }, t, fromNow, { trial: false })).toEqual({ type: 'disabled', text: 'general.suspended' })
    expect(statusChip({ status: 'cancelled', is_trial: true }, t, fromNow, { trial: false })).toEqual({ type: 'expires', text: 'general.cancelled' })
  })

  it('an active paid plan has no chip', () => {
    expect(statusChip({ status: 'active', is_trial: false }, t, fromNow)).toBeNull()
  })

  it('a trial without an expiry date passes an empty date on (moment(null) was invalid)', () => {
    statusChip({ status: 'active', is_trial: true, trial_expiry_at: null }, t, fromNow)
    expect(fromNow).toHaveBeenLastCalledWith('')
  })
})

describe('domainTypeChip', () => {
  it('maps the four known types to a chip key and a translated text', () => {
    expect(domainTypeChip('main', t)).toEqual({ key: 'maindomain', text: 'heading.hosting.domains.domain.main' })
    expect(domainTypeChip('addon', t)).toEqual({ key: 'addon', text: 'heading.hosting.domains.domain.addon' })
    expect(domainTypeChip('sub', t)).toEqual({ key: 'subdomain', text: 'heading.hosting.domains.domain.sub' })
    expect(domainTypeChip('alias', t)).toEqual({ key: 'alias', text: 'heading.hosting.domains.domain.alias' })
  })

  it('gives no chip for an unknown, empty or missing type (D4)', () => {
    expect(domainTypeChip('parked', t)).toBeNull()
    expect(domainTypeChip('constructor', t)).toBeNull()
    expect(domainTypeChip('', t)).toBeNull()
    expect(domainTypeChip(null, t)).toBeNull()
    expect(domainTypeChip(undefined, t)).toBeNull()
  })
})

describe('upgradeButtonColor', () => {
  it('is orange for a trial and primary otherwise', () => {
    expect(upgradeButtonColor({ is_trial: true })).toBe('orange')
    expect(upgradeButtonColor({ is_trial: false })).toBe('primary')
    expect(upgradeButtonColor({})).toBe('primary')
  })
})

describe('customLabelTone', () => {
  it('follows the legacy CustomLabel palette by type', () => {
    expect(customLabelTone('purple')).toBe('purple')
    expect(customLabelTone('maindomain')).toBe('purple')
    expect(customLabelTone('subdomain')).toBe('blue')
    expect(customLabelTone('premium')).toBe('blue')
    expect(customLabelTone('addon')).toBe('green')
    expect(customLabelTone('expires')).toBe('orange')
    expect(customLabelTone('free')).toBe('orange')
    expect(customLabelTone('disabled')).toBe('gray')
    expect(customLabelTone('alias')).toBe('gray')
    expect(customLabelTone(undefined)).toBe('gray')
  })
})
