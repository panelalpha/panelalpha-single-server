import type { ProjectState } from './service-limits'
import type { InstanceResource, ProjectLimitValues } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { hasLimits, limitsCell, limitsInstance, limitsProject } from './service-limits'

const NONE: ProjectLimitValues = { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }

function ready (limits: ProjectLimitValues | null, overrides: Record<string, unknown> = {}): ProjectState {
  const resources = limits ? { usage: null, disk: null, limits, ceilings: NONE } : null
  return { status: 'ready', instance: { id: 7, staging: false, resources, ...overrides } as unknown as InstanceResource }
}

describe('service limits', () => {
  it('takes the first top-level project of a plan, not a staging copy', () => {
    expect(limitsProject({ instances: [{ id: 2, domain: 's.test', parent_id: 1 }, { id: 3, domain: 'b.test' }] })?.id).toBe(3)
    expect(limitsProject({ instances: [] })).toBeNull()
  })

  it('has limits in a paid edition for a plan that is not cancelled and holds a project', () => {
    const instances = [{ id: 1, domain: 'a.test' }]
    expect(hasLimits({ instances, status: 'active' }, true)).toBe(true)
    expect(hasLimits({ instances, status: 'suspended' }, true)).toBe(true)
    expect(hasLimits({ instances, status: 'active' }, false)).toBe(false)
    expect(hasLimits({ instances, status: 'cancelled' }, true)).toBe(false)
    expect(hasLimits({ instances: [], status: 'active' }, true)).toBe(false)
  })

  it('offers a fetched project only with a resources block and when it is not a staging copy', () => {
    expect(limitsInstance(ready(NONE))).not.toBeNull()
    expect(limitsInstance(ready(null))).toBeNull()
    expect(limitsInstance(ready(NONE, { staging: true }))).toBeNull()
    expect(limitsInstance({ status: 'loading' })).toBeNull()
    expect(limitsInstance({ status: 'failed' })).toBeNull()
    expect(limitsInstance(undefined)).toBeNull()
  })

  it('shows chips of the main limits and how many others are set, as Project details', () => {
    const cell = limitsCell(ready({ memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: 200_000, device_read_bps: -1, device_write_bps: -1 }))
    expect(cell).toEqual({ kind: 'chips', chips: ['2 GB RAM', '1 core CPU', '10 GB disk'], more: 1 })
  })

  it('shows Unlimited without any limit, a skeleton while loading and a dash without data', () => {
    expect(limitsCell(ready({ ...NONE, memory_limit: -1, cpu_limit: -1 }))).toEqual({ kind: 'unlimited' })
    expect(limitsCell({ status: 'loading' })).toEqual({ kind: 'loading' })
    expect(limitsCell({ status: 'failed' })).toEqual({ kind: 'none' })
    expect(limitsCell(ready(null))).toEqual({ kind: 'none' })
    expect(limitsCell(undefined)).toEqual({ kind: 'none' })
  })
})
