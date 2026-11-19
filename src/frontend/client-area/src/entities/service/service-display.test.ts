import type { ServiceSummary } from './service-display'
import { describe, expect, it } from 'vitest'
import { instanceLimitText, isUnlimitedLimit, serviceLabel, serviceLimitReached } from './service-display'

const UNLIMITED = Number('9223372036854775807')
const t = (key: string, options?: Record<string, unknown>) => `${key}|${JSON.stringify(options)}`

describe('serviceLabel', () => {
  it('adds the first hosting domain after the plan and the limit', () => {
    const service: ServiceSummary = { plan_name: 'Starter', instance_count: 1, instance_limit: 5, hosting_accounts: [{ domain: 'a.example.com' }, { domain: 'b.example.com' }] }

    expect(serviceLabel(service, t)).toBe('Starter (heading.onboarding.chooseProduct.product.instancesLimit|{"count":1,"limit":"5"}) - a.example.com')
  })

  it('leaves the domain out when there are no hosting accounts', () => {
    const service: ServiceSummary = { plan_name: 'Pro', instance_count: 2, instance_limit: 9, hosting_accounts: [] }

    expect(serviceLabel(service, t)).toBe('Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":2,"limit":"9"})')
  })

  it('leaves the domain out when the first account has an empty one', () => {
    const service: ServiceSummary = { plan_name: 'Pro', instance_count: 2, instance_limit: 9, hosting_accounts: [{ domain: '' }] }

    expect(serviceLabel(service, t)).toBe('Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":2,"limit":"9"})')
  })

  it('counts a missing count or limit as 0 and a missing plan as an empty name', () => {
    expect(serviceLabel({}, t)).toBe(' (heading.onboarding.chooseProduct.product.instancesLimit|{"count":0,"limit":"0"})')
  })
})

describe('isUnlimitedLimit (ID-56)', () => {
  it('is true for the largest 64 bit integer as a number or a string', () => {
    expect(isUnlimitedLimit(UNLIMITED)).toBe(true)
    expect(isUnlimitedLimit('9223372036854775807')).toBe(true)
  })

  it('is false for normal, zero, null and undefined limits', () => {
    expect(isUnlimitedLimit(5)).toBe(false)
    expect(isUnlimitedLimit(0)).toBe(false)
    expect(isUnlimitedLimit(null)).toBe(false)
    expect(isUnlimitedLimit(undefined)).toBe(false)
  })
})

describe('instanceLimitText (ID-56)', () => {
  const tt = (key: string) => key

  it('reads Unlimited for an unlimited limit', () => {
    expect(instanceLimitText(UNLIMITED, tt)).toBe('form.value.unlimited')
    expect(instanceLimitText('9223372036854775807', tt)).toBe('form.value.unlimited')
  })

  it('returns the number otherwise and 0 when missing', () => {
    expect(instanceLimitText(5, tt)).toBe('5')
    expect(instanceLimitText(0, tt)).toBe('0')
    expect(instanceLimitText(null, tt)).toBe('0')
    expect(instanceLimitText(undefined, tt)).toBe('0')
  })
})

describe('serviceLabel with an unlimited limit (ID-56)', () => {
  it('shows Unlimited instead of the raw number', () => {
    const service: ServiceSummary = { plan_name: 'Pro', instance_count: 2, instance_limit: UNLIMITED }

    expect(serviceLabel(service, t)).toBe('Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":2,"limit":"form.value.unlimited|undefined"})')
  })

  it('shows 0 for a null or undefined limit', () => {
    const nullLimit = { plan_name: 'Pro', instance_count: 1, instance_limit: null } as unknown as ServiceSummary

    expect(serviceLabel(nullLimit, t)).toBe('Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":1,"limit":"0"})')
    expect(serviceLabel({ plan_name: 'Pro', instance_count: 1 }, t)).toBe('Pro (heading.onboarding.chooseProduct.product.instancesLimit|{"count":1,"limit":"0"})')
  })
})

describe('serviceLimitReached', () => {
  it('compares like legacy JS: a missing count or limit is never reached, null counts as 0', () => {
    expect(serviceLimitReached({ instance_count: 5, instance_limit: 5 })).toBe(true)
    expect(serviceLimitReached({ instance_count: 4, instance_limit: 5 })).toBe(false)
    expect(serviceLimitReached({ instance_limit: undefined })).toBe(false)
    expect(serviceLimitReached({ instance_count: undefined })).toBe(false)
    expect(serviceLimitReached({ instance_count: 0, instance_limit: null as never })).toBe(true)
    expect(serviceLimitReached(undefined)).toBe(false)
  })
})
