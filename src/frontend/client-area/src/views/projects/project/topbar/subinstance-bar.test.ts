import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { barParent, barSubinstances, canSwitchTo, tabState } from './subinstance-bar'

function fakeResource (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 1,
    staging: false,
    parentInstance: null,
    subInstances: [],
    hasInstallStatus: () => false,
    hasInstallFailed: () => false,
    ...overrides,
  } as unknown as InstanceResource
}

describe('subinstance bar', () => {
  it('shows the live instance and its staging copies on the live page', () => {
    const staging = fakeResource({ id: 41, staging: true })
    const live = fakeResource({ id: 1, subInstances: [staging] })

    expect(barParent(live)).toBe(live)
    expect(barSubinstances(live)).toEqual([staging])
  })

  it('takes the live parent of a staging copy and shows only the copy itself', () => {
    const live = fakeResource({ id: 1 })
    const staging = fakeResource({ id: 41, staging: true, parentInstance: live })

    expect(barParent(staging)).toBe(live)
    expect(barSubinstances(staging)).toEqual([staging])
  })

  it('has no live tab for a staging copy whose parent is not loaded', () => {
    expect(barParent(fakeResource({ id: 41, staging: true, parentInstance: null }))).toBeNull()
  })

  it('reports an install in progress or failed as a state, and no state otherwise', () => {
    const running = fakeResource({ hasInstallStatus: () => true, hasInstallFailed: () => false })
    const failed = fakeResource({ hasInstallStatus: () => true, hasInstallFailed: () => true })

    expect(tabState(running)).toBe('in_progress')
    expect(tabState(failed)).toBe('error')
    expect(tabState(fakeResource())).toBe(false)
  })

  it('switches only a tab without state, as legacy switchInstance does', () => {
    expect(canSwitchTo(false)).toBe(true)
    expect(canSwitchTo('in_progress')).toBe(false)
    expect(canSwitchTo('error')).toBe(false)
  })
})
