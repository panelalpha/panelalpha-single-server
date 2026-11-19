import type { InstanceResource, ProjectLimitValues, ProjectResources } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ServiceLimitsButton from './ServiceLimitsButton.vue'

const apiMock = vi.hoisted(() => ({ updateLimits: vi.fn() }))

vi.mock('@/entities/project/project-limits.api', () => ({ updateLimits: apiMock.updateLimits }))

const MB = 1024 * 1024
const NONE: ProjectLimitValues = { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }

function resources (): ProjectResources {
  return {
    usage: { cpu_percent: 50, memory_bytes: 512 * MB, memory_limit_bytes: 2048 * MB, sampled_at: null },
    disk: { total_bytes: 5 * 1024 * MB, limit_bytes: 10 * 1024 * MB, measured_at: null },
    limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: -1, device_read_bps: -1, device_write_bps: -1 },
    ceilings: NONE,
  }
}

function project (manage = true): InstanceResource {
  return {
    id: 7,
    domain: 'site7.test',
    type: 'wordpress',
    staging: false,
    resources: resources(),
    hasManageLimitsPrivilege: () => manage,
  } as unknown as InstanceResource
}

async function mountButton (instance: InstanceResource) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(ServiceLimitsButton, {
    props: { instance },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function cpuInput (): HTMLInputElement {
  return document.body.querySelector('.limit-field-cpu_limit input') as HTMLInputElement
}

describe('ServiceLimitsButton', () => {
  beforeEach(() => {
    apiMock.updateLimits.mockReset()
    document.body.innerHTML = ''
  })

  it('is the primary text button of the kit, Manage limits', async () => {
    const wrapper = await mountButton(project())

    const button = wrapper.get('[data-testid="services-limits"]')
    expect(button.text()).toBe('Manage limits')
    expect(button.classes()).toContain('text-primary')
    expect(button.classes()).toContain('v-btn--variant-text')
    wrapper.unmount()
  })

  it('opens the project limits and saves them, giving the new resources to the page', async () => {
    const saved = { ...resources(), limits: { ...resources().limits, cpu_limit: 2 } }
    apiMock.updateLimits.mockResolvedValue(saved)
    const wrapper = await mountButton(project())

    await wrapper.get('[data-testid="services-limits"]').trigger('click')
    await flushPromises()
    expect(cpuInput().value).toBe('1')

    cpuInput().value = '2'
    cpuInput().dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises();
    (document.body.querySelector('.project-limits-submit') as HTMLElement).click()
    await flushPromises()

    expect(apiMock.updateLimits).toHaveBeenCalledWith(7, expect.objectContaining({ cpu_limit: 2 }))
    expect(wrapper.emitted('limits-updated')).toEqual([[7, saved]])
    expect(wrapper.emitted('limits-saved')).toEqual([[{ id: 7, domain: 'site7.test', needsRebuild: true }]])
    wrapper.unmount()
  })

  it('reads View limits and opens the modal read-only without the manage privilege', async () => {
    const wrapper = await mountButton(project(false))

    expect(wrapper.get('[data-testid="services-limits"]').text()).toBe('View limits')
    await wrapper.get('[data-testid="services-limits"]').trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-testid="project-limits-read-only"]')).not.toBeNull()
    expect(document.body.querySelector('.project-limits-submit')).toBeNull()
    wrapper.unmount()
  })
})
