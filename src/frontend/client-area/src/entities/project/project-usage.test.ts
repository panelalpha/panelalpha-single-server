import type { ProjectResources } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { limitsSummary, serverTotals, usageRings } from './project-usage'

const MB = 1024 * 1024
const GB = 1024 * MB

function resources (overrides: Partial<ProjectResources> = {}): ProjectResources {
  return {
    usage: { cpu_percent: 38, memory_bytes: 512 * MB, memory_limit_bytes: 2048 * MB, sampled_at: '2026-11-17T10:00:00Z' },
    disk: { total_bytes: 5 * GB, limit_bytes: 10 * GB, measured_at: '2026-11-17T09:50:00Z' },
    limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: null, device_read_bps: null, device_write_bps: null },
    ceilings: { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null },
    ...overrides,
  }
}

describe('usageRings', () => {
  const server = { memoryBytes: 8 * GB, diskBytes: 100 * GB }

  it('measures RAM without a limit against the whole server when its size is known', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_bytes: 2 * GB, memory_limit_bytes: null },
      limits: { ...base.limits, memory_limit: null },
    }), undefined, false, server).ram

    expect(ring).toEqual({ percent: 25, used: '2 GB', limit: null, note: 'ofServer', server: '8 GB' })
  })

  it('measures a disk without a limit against the whole server when its size is known', () => {
    const base = resources()
    const ring = usageRings(resources({ disk: { ...base.disk!, limit_bytes: -1 } }), undefined, false, server).disk

    expect(ring).toEqual({ percent: 5, used: '5 GB', limit: null, note: 'ofServer', server: '100 GB' })
  })

  it('keeps a ring with a limit measured against the limit, also with the server size', () => {
    expect(usageRings(resources(), undefined, false, server).disk).toEqual({ percent: 50, used: '5 GB', limit: '10 GB' })
  })

  it('has no percent for a disk without a limit when the server size is not known', () => {
    const base = resources()
    const ring = usageRings(resources({ disk: { ...base.disk!, limit_bytes: -1 } }), undefined, false, { memoryBytes: 8 * GB, diskBytes: null }).disk

    expect(ring).toEqual({ percent: null, used: '5 GB', limit: null, note: 'unlimited' })
  })

  it('keeps CPU without a limit as the percent of one core with the server size', () => {
    const base = resources()
    const ring = usageRings(resources({ limits: { ...base.limits, cpu_limit: -1 } }), undefined, false, server).cpu

    expect(ring.note).toBe('perCore')
  })

  it('measures RAM against the limit of the sample', () => {
    expect(usageRings(resources()).ram).toEqual({ percent: 25, used: '512 MB', limit: '2 GB' })
  })

  it('rounds up and caps the percent at 100', () => {
    const base = resources()
    const rounded = usageRings(resources({ usage: { ...base.usage!, memory_bytes: 513 * MB } })).ram
    const capped = usageRings(resources({ usage: { ...base.usage!, memory_bytes: 3 * GB } })).ram

    expect(rounded.percent).toBe(26)
    expect(capped.percent).toBe(100)
  })

  it('falls back to the memory limit setting when the sample has no limit', () => {
    const base = resources()
    const ring = usageRings(resources({ usage: { ...base.usage!, memory_limit_bytes: null } })).ram

    expect(ring).toEqual({ percent: 25, used: '512 MB', limit: '2 GB' })
  })

  it('shows the limit of the sample on a classic project, since a new limit waits for a rebuild', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_limit_bytes: 1024 * MB },
      limits: { ...base.limits, memory_limit: 4096 },
    }), undefined, false).ram

    expect(ring).toEqual({ percent: 50, used: '512 MB', limit: '1 GB' })
  })

  it('falls back to the saved limit on a classic project when the sample has none', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_limit_bytes: null },
      limits: { ...base.limits, memory_limit: 4096 },
    }), undefined, false).ram

    expect(ring).toEqual({ percent: 13, used: '512 MB', limit: '4 GB' })
  })

  it('prefers the saved memory limit to the limit of an older sample on a container project', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_limit_bytes: 1024 * MB },
      limits: { ...base.limits, memory_limit: 4096 },
    }), undefined, true).ram

    expect(ring).toEqual({ percent: 13, used: '512 MB', limit: '4 GB' })
  })

  it('prefers the saved memory limit to the limit of an older sample', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_limit_bytes: 1024 * MB },
      limits: { ...base.limits, memory_limit: 4096 },
    }), undefined, true).ram

    expect(ring).toEqual({ percent: 13, used: '512 MB', limit: '4 GB' })
  })

  it('uses the limit of the sample when memory_limit is not set', () => {
    const base = resources()
    const ring = usageRings(resources({ limits: { ...base.limits, memory_limit: null } })).ram

    expect(ring).toEqual({ percent: 25, used: '512 MB', limit: '2 GB' })
  })

  it('shows CPU with a limit of 0 as no limit', () => {
    const base = resources()
    const ring = usageRings(resources({ limits: { ...base.limits, cpu_limit: 0 } })).cpu

    expect(ring.limit).toBeNull()
    expect(ring.note).toBe('perCore')
  })

  it('has no percent for RAM with no limit anywhere', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, memory_limit_bytes: null },
      limits: { ...base.limits, memory_limit: null },
    })).ram

    expect(ring).toEqual({ percent: null, used: '512 MB', limit: null, note: 'unlimited' })
  })

  it('measures CPU against the cores of the limit', () => {
    const base = resources()
    const ring = usageRings(resources({ limits: { ...base.limits, cpu_limit: 2 } })).cpu

    expect(ring).toEqual({ percent: 19, used: '0.38 cores', limit: '2 cores' })
  })

  it('measures CPU as percent of one core without a limit', () => {
    const base = resources()
    for (const cpuLimit of [null, -1, 0]) {
      const ring = usageRings(resources({ limits: { ...base.limits, cpu_limit: cpuLimit } })).cpu
      expect(ring).toEqual({ percent: 38, used: '38', limit: null, note: 'perCore' })
    }
  })

  it('caps CPU above one core at 100 percent', () => {
    const base = resources()
    const ring = usageRings(resources({
      usage: { ...base.usage!, cpu_percent: 240 },
      limits: { ...base.limits, cpu_limit: null },
    })).cpu

    expect(ring).toMatchObject({ percent: 100, used: '240', note: 'perCore' })
  })

  it('measures disk against the byte limit', () => {
    expect(usageRings(resources()).disk).toEqual({ percent: 50, used: '5 GB', limit: '10 GB' })
  })

  it('has no disk percent when the limit is -1, null or 0', () => {
    const base = resources()
    for (const limit of [-1, null, 0]) {
      const ring = usageRings(resources({ disk: { ...base.disk!, limit_bytes: limit } })).disk
      expect(ring).toEqual({ percent: null, used: '5 GB', limit: null, note: 'unlimited' })
    }
  })

  it('says no data for RAM and CPU when there is no recent sample, and still shows the disk', () => {
    const rings = usageRings(resources({ usage: null }))

    expect(rings.ram).toEqual({ percent: null, used: '', limit: null, note: 'noData' })
    expect(rings.cpu).toEqual({ percent: null, used: '', limit: null, note: 'noData' })
    expect(rings.disk.percent).toBe(50)
  })

  it('says no data for the disk when it was not measured', () => {
    expect(usageRings(resources({ disk: null })).disk.note).toBe('noData')
  })
})

describe('limitsSummary', () => {
  const none = { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }

  it('lists the main limits and counts no more when the others are not set', () => {
    const summary = limitsSummary({ ...none, memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: -1 })

    expect(summary).toEqual({ main: ['2 GB RAM', '1 core CPU', '10 GB disk'], more: 0 })
  })

  it('counts one more limit', () => {
    const summary = limitsSummary({ ...none, memory_limit: 512, cpu_limit: 0.5, disk_space_limit: 1024, inodes_limit: 500_000 })

    expect(summary).toEqual({ main: ['512 MB RAM', '0.5 cores CPU', '1 GB disk'], more: 1 })
  })

  it('counts three more limits and skips unlimited and unset main limits', () => {
    const summary = limitsSummary({ memory_limit: 4096, cpu_limit: -1, disk_space_limit: null, inodes_limit: 1000, device_read_bps: 1_048_576, device_write_bps: 0 })

    expect(summary).toEqual({ main: ['4 GB RAM'], more: 2 })
  })

  it('treats 0 like no limit, as the Engine does', () => {
    const summary = limitsSummary({ memory_limit: 2048, cpu_limit: 0, disk_space_limit: 0, inodes_limit: 0, device_read_bps: 0, device_write_bps: 0 })

    expect(summary).toEqual({ main: ['2 GB RAM'], more: 0 })
  })

  it('takes the texts from the translator, with the English text as default', () => {
    const t = (key: string, options: { [name: string]: unknown, defaultValue: string }) => `${key}|${options.value ?? options.count}`
    const summary = limitsSummary({ ...none, memory_limit: 2048, cpu_limit: 2, disk_space_limit: 1024 }, t)

    expect(summary.main).toEqual([
      'heading.instance.advanced.projectLimits.summary.ram|2 GB',
      'heading.instance.advanced.projectLimits.summary.cpu|heading.instance.advanced.projectLimits.summary.cores|2',
      'heading.instance.advanced.projectLimits.summary.disk|1 GB',
    ])
  })
})

describe('serverTotals', () => {
  it('turns the RAM of the server metrics from KB into bytes and keeps the disk in bytes', () => {
    expect(serverTotals({ ram_total: 8 * 1024 * 1024, disk_total: 100 * GB })).toEqual({ memoryBytes: 8 * GB, diskBytes: 100 * GB })
  })

  it('gives null for a size the engine could not measure', () => {
    expect(serverTotals({ ram_total: 0, disk_total: null })).toEqual({ memoryBytes: null, diskBytes: null })
  })
})
