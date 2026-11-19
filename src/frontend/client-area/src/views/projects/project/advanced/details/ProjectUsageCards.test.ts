import type { ProjectResources } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ProjectUsageCards from './ProjectUsageCards.vue'

const MB = 1024 * 1024
const GB = 1024 * MB
const PREFIX = 'heading.instance.advanced.projectUsage'

function resources (overrides: Partial<ProjectResources> = {}): ProjectResources {
  return {
    usage: { cpu_percent: 50, memory_bytes: 512 * MB, memory_limit_bytes: 2048 * MB, sampled_at: new Date().toISOString() },
    disk: { total_bytes: 5 * GB, limit_bytes: 10 * GB, measured_at: new Date().toISOString() },
    limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: null, device_read_bps: null, device_write_bps: null },
    ceilings: { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null },
    ...overrides,
  }
}

async function mountCards (props: { resources: ProjectResources | null, loading?: boolean, server?: { memoryBytes: number | null, diskBytes: number | null } | null }) {
  return mountKit(ProjectUsageCards, { props: { loading: false, ...props } })
}

describe('ProjectUsageCards', () => {
  it('shows the heading and three cards with the percent, used and limit', async () => {
    const wrapper = await mountCards({ resources: resources() })

    expect(wrapper.text()).toContain(`${PREFIX}.title`)
    expect(wrapper.text()).toContain(`${PREFIX}.card.ram`)
    expect(wrapper.text()).toContain(`${PREFIX}.card.cpu`)
    expect(wrapper.text()).toContain(`${PREFIX}.card.disk`)
    expect(wrapper.get('[data-testid="project-usage-ring-ram"]').text()).toBe('25%')
    expect(wrapper.get('[data-testid="project-usage-used-ram"]').text()).toBe('512 MB')
    expect(wrapper.get('[data-testid="project-usage-limit-ram"]').text()).toBe('2 GB')
    expect(wrapper.get('[data-testid="project-usage-ring-cpu"]').text()).toBe('50%')
    expect(wrapper.get('[data-testid="project-usage-limit-cpu"]').text()).toBe('1 core')
    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').text()).toBe('50%')
    expect(wrapper.get('[data-testid="project-usage-limit-disk"]').text()).toBe('10 GB')
    // The sample is fresh, so the caption is the "Updated" text and not "No recent data".
    expect(wrapper.get('[data-testid="project-usage-caption"]').text()).toBe(`${PREFIX}.updated`)
    wrapper.unmount()
  })

  it('shows the percent of one core and "No limit" for a CPU without a limit', async () => {
    const base = resources()
    const wrapper = await mountCards({ resources: resources({ limits: { ...base.limits, cpu_limit: -1 } }) })

    expect(wrapper.get('[data-testid="project-usage-used-cpu"]').text()).toBe(`50${PREFIX}.perCore`)
    expect(wrapper.get('[data-testid="project-usage-limit-cpu"]').text()).toBe(`${PREFIX}.noLimit`)
    wrapper.unmount()
  })

  it('shows the used disk and "No limit" with no ring percent for an unlimited disk', async () => {
    const base = resources()
    const wrapper = await mountCards({ resources: resources({ disk: { ...base.disk!, limit_bytes: -1 } }) })

    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').text()).toBe('5 GB')
    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').classes()).toContain('usage-stat__ring--small')
    expect(wrapper.get('[data-testid="project-usage-limit-disk"]').text()).toBe(`${PREFIX}.noLimit`)
    wrapper.unmount()
  })

  it('shows the percent of the whole server and its size for an unlimited disk on a single server', async () => {
    const base = resources()
    const wrapper = await mountCards({
      resources: resources({ disk: { ...base.disk!, limit_bytes: -1 } }),
      server: { memoryBytes: 8 * GB, diskBytes: 100 * GB },
    })

    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').text()).toBe('5%')
    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').classes()).not.toContain('usage-stat__ring--small')
    expect(wrapper.get('[data-testid="project-usage-limit-disk"]').text()).toBe(`${PREFIX}.noLimit`)
    expect(wrapper.get('[data-testid="project-usage-server-disk"]').text()).toBe('100 GB')
    // RAM has a limit, so it has no server row.
    expect(wrapper.find('[data-testid="project-usage-server-ram"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says "No recent data" in the note for RAM and CPU without a sample, and keeps the disk', async () => {
    const wrapper = await mountCards({ resources: resources({ usage: null }) })

    expect(wrapper.get('[data-testid="project-usage-caption"]').text()).toBe(`${PREFIX}.noRecentData`)
    expect(wrapper.get('[data-testid="project-usage-ring-ram"]').text()).toBe('-')
    expect(wrapper.get('[data-testid="project-usage-card-ram-note"]').text()).toBe(`${PREFIX}.noRecentData`)
    expect(wrapper.get('[data-testid="project-usage-card-cpu-note"]').text()).toBe(`${PREFIX}.noRecentData`)
    expect(wrapper.find('[data-testid="project-usage-used-ram"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="project-usage-limit-ram"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="project-usage-ring-disk"]').text()).toBe('50%')
    expect(wrapper.find('[data-testid="project-usage-card-disk-note"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the plain stat card look: no colour classes and no limit chip', async () => {
    const wrapper = await mountCards({ resources: resources() })

    expect(wrapper.find('[class*="stat--"]').exists()).toBe(false)
    expect(wrapper.find('.manage-panel').exists()).toBe(false)
    expect(wrapper.get('[data-testid="project-usage-limit-ram"]').classes()).toEqual([])
    expect(wrapper.get('[data-testid="project-usage-ring-ram"]').classes()).not.toContain('usage-stat__ring--small')
    wrapper.unmount()
  })

  it('shows skeletons while loading', async () => {
    const wrapper = await mountCards({ resources: null, loading: true })

    expect(wrapper.text()).toContain(`${PREFIX}.title`)
    expect(wrapper.findAll('[data-testid="project-usage-skeleton"]')).toHaveLength(3)
    expect(wrapper.find('[data-testid="project-usage-ring-ram"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders nothing without resources once loaded', async () => {
    const wrapper = await mountCards({ resources: null })

    expect(wrapper.find('[data-testid="project-usage"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
