import type { InstanceResource, ProjectLimitValues, ProjectResources } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateLimits } from '@/entities/project/project-limits.api'
import { mountKit } from '@/test/mount-kit'
import ProjectLimitsModal from './ProjectLimitsModal.vue'

const apiMock = vi.hoisted(() => ({ put: vi.fn() }))

vi.mock('@/shared/api/client', () => ({
  api: { put: apiMock.put, get: vi.fn() },
  apiBaseUrl: () => '',
}))

const MB = 1024 * 1024
const PREFIX = 'heading.instance.advanced.projectLimits'
const NONE: ProjectLimitValues = { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null }

function resources (overrides: Partial<ProjectResources> = {}): ProjectResources {
  return {
    usage: { cpu_percent: 50, memory_bytes: 512 * MB, memory_limit_bytes: 2048 * MB, sampled_at: new Date().toISOString() },
    disk: { total_bytes: 5 * 1024 * MB, limit_bytes: 10 * 1024 * MB, measured_at: new Date().toISOString() },
    limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: -1, device_read_bps: -1, device_write_bps: -1 },
    ceilings: NONE,
    ...overrides,
  }
}

function fakeInstance (block: ProjectResources): InstanceResource {
  return { id: 7, type: 'wordpress', isContainer: false, resources: block } as unknown as InstanceResource
}

async function mountModal (block: ProjectResources, readOnly = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const instance = fakeInstance(block)
  // As the callers do: the request, then the answer kept on the project.
  const save = async (body: Parameters<typeof updateLimits>[1]): Promise<boolean> => {
    instance.resources = await updateLimits(instance.id, body)
    return true
  }
  const wrapper = await mountKit(ProjectLimitsModal, {
    props: { instance, readOnly, modelValue: true, save },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, instance }
}

function field (key: string): HTMLInputElement {
  return document.body.querySelector(`.limit-field-${key} input`) as HTMLInputElement
}

async function type (key: string, value: string): Promise<void> {
  const input = field(key)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function clickSave (): Promise<void> {
  (document.body.querySelector('.project-limits-submit') as HTMLElement).click()
  await flushPromises()
}

describe('ProjectLimitsModal', () => {
  beforeEach(() => {
    apiMock.put.mockReset()
    document.body.innerHTML = ''
  })

  it('shows the saved limits in GB, cores and GB', async () => {
    const { wrapper } = await mountModal(resources())

    expect(field('memory_limit').value).toBe('2')
    expect(field('cpu_limit').value).toBe('1')
    expect(field('disk_space_limit').value).toBe('10')
    wrapper.unmount()
  })

  it('sends one PUT with all six keys in stored units and emits saved', async () => {
    const block = resources()
    apiMock.put.mockResolvedValue({ data: { data: { ...block, limits: { ...block.limits, memory_limit: 1536 } } } })
    const { wrapper, instance } = await mountModal(block)

    await type('memory_limit', '1.5')
    await clickSave()

    expect(apiMock.put).toHaveBeenCalledTimes(1)
    expect(apiMock.put).toHaveBeenCalledWith('/instances/7/limits', {
      memory_limit: 1536,
      cpu_limit: 1,
      disk_space_limit: 10_240,
      inodes_limit: -1,
      device_read_bps: -1,
      device_write_bps: -1,
    })
    expect(wrapper.emitted('saved')).toEqual([[true]])
    expect(instance.resources?.limits.memory_limit).toBe(1536)
    wrapper.unmount()
  })

  it('keeps the modal open and emits nothing when the caller sent nothing (save gives false)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const save = vi.fn().mockResolvedValue(false)
    const wrapper = await mountKit(ProjectLimitsModal, {
      props: { instance: fakeInstance(resources()), readOnly: false, modelValue: true, save },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    await flushPromises()

    await type('cpu_limit', '2')
    await clickSave()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toMatchObject({ cpu_limit: 2, memory_limit: 2048 })
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not send a form that fails the client rules, and says why under the field', async () => {
    const { wrapper } = await mountModal(resources())

    await type('memory_limit', '')
    await clickSave()

    expect(apiMock.put).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(`${PREFIX}.error.required`)
    wrapper.unmount()
  })

  it('shows a 422 under the field it names and keeps the modal open', async () => {
    apiMock.put.mockRejectedValue({ response: { status: 422, data: { errors: { memory_limit: ['The plan allows at most 1024 MB.'] } } } })
    const { wrapper } = await mountModal(resources())

    await clickSave()

    expect(document.body.textContent).toContain('The plan allows at most 1024 MB.')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(document.body.querySelector('[data-testid="project-limits-error"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows a 422 for an unknown key in the modal alert', async () => {
    apiMock.put.mockRejectedValue({ response: { status: 422, data: { errors: { other: ['Something else is wrong.'] } } } })
    const { wrapper } = await mountModal(resources())

    await clickSave()

    expect(document.body.querySelector('[data-testid="project-limits-error"]')?.textContent).toContain('Something else is wrong.')
    wrapper.unmount()
  })

  it('disables No limit and shows the maximum when the plan sets a ceiling', async () => {
    const { wrapper } = await mountModal(resources({ ceilings: { ...NONE, cpu_limit: 2 } }))

    const box = document.body.querySelector('.limit-unlimited-cpu_limit input') as HTMLInputElement
    expect(box.disabled).toBe(true)
    expect(document.body.textContent).toContain(`${PREFIX}.hint.max`)
    wrapper.unmount()
  })

  it('is read only without the privilege: inputs are off and there is no Save', async () => {
    const { wrapper } = await mountModal(resources(), true)

    expect(field('memory_limit').disabled).toBe(true)
    expect(document.body.querySelector('.project-limits-submit')).toBeNull()
    expect(document.body.querySelector('[data-testid="project-limits-read-only"]')).not.toBeNull()
    wrapper.unmount()
  })
})
