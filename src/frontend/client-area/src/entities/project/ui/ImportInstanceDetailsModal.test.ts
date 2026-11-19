import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { emit, on, resetAppEvents } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import ImportInstanceDetailsModal from './ImportInstanceDetailsModal.vue'

function raw (installation: string, details: Record<string, unknown> = {}, id = 7): RawInstance {
  return {
    id,
    type: 'wordpress',
    name: 'Imported',
    url: 'https://imported.example.com',
    domain: 'imported.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation },
    import_details: {
      message: 'Disk full',
      steps: { migrateFilesUsingPlugin: 'in-progress', installNewInstance: 'not-started' },
      current_step: { name: 'migrateFilesUsingPlugin', percent: 40, current_item: 'wp-content/a.zip' },
      ...details,
    },
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal () {
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(ImportInstanceDetailsModal, { attachTo: host })
}

async function show (wrapper: Awaited<ReturnType<typeof mountModal>>, instance: InstanceResource) {
  ;(wrapper.vm as unknown as { show: (i: InstanceResource) => void }).show(instance)
  await flushPromises()
}

describe('ImportInstanceDetailsModal', () => {
  beforeEach(() => {
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('shows the progress of the running import with its percent and one row per step', async () => {
    const wrapper = await mountModal()
    await show(wrapper, toInstanceResource(raw('in_progress')))

    expect(bodyQuery('[data-testid="import-details-progress"]')!.textContent).toContain('40%')
    expect(bodyQuery('[data-testid="import-details-failed"]')).toBeNull()
    expect(document.body.querySelectorAll('[data-testid="import-details-modal"] tbody tr')).toHaveLength(2)
    expect(bodyQuery('[data-testid="import-details-retry"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the error, the failed step and Try again for a failed import', async () => {
    const wrapper = await mountModal()
    await show(wrapper, toInstanceResource(raw('failed')))

    const failed = bodyQuery('[data-testid="import-details-failed"]')!
    expect(failed.textContent).toContain('message.importing.modal.failed')
    expect(failed.textContent).toContain('wp-content/a.zip')
    expect(failed.textContent).toContain('Disk full')
    expect(bodyQuery('[data-testid="import-details-progress"]')).toBeNull()
    expect(bodyQuery('[data-testid="import-details-retry"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('Try again raises instance-retry-install once with the instance and closes', async () => {
    const wrapper = await mountModal()
    const seen = vi.fn()
    on('instance-retry-install', seen)
    const instance = toInstanceResource(raw('failed'))
    await show(wrapper, instance)

    bodyQuery('[data-testid="import-details-retry"]')!.click()
    await flushPromises()

    expect(seen).toHaveBeenCalledExactlyOnceWith(instance)
    expect(bodyQuery('[data-testid="import-details-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('updates live from import-status-changed of the shown instance only', async () => {
    const wrapper = await mountModal()
    await show(wrapper, toInstanceResource(raw('in_progress')))

    emit('import-status-changed', raw('in_progress', { current_step: { name: 'migrateFilesUsingPlugin', percent: 75 } }, 99) as never)
    await flushPromises()
    expect(bodyQuery('[data-testid="import-details-progress"]')!.textContent).toContain('40%')

    emit('import-status-changed', raw('in_progress', { current_step: { name: 'migrateFilesUsingPlugin', percent: 75 } }) as never)
    await flushPromises()
    expect(bodyQuery('[data-testid="import-details-progress"]')!.textContent).toContain('75%')
    wrapper.unmount()
  })

  it('closes itself when the import leaves pending / in_progress / failed', async () => {
    const wrapper = await mountModal()
    await show(wrapper, toInstanceResource(raw('in_progress')))

    emit('import-status-changed', raw('failed') as never)
    await flushPromises()
    expect(bodyQuery('[data-testid="import-details-modal"]')?.closest('.v-overlay--active')).toBeTruthy()

    emit('import-status-changed', raw('finished') as never)
    await flushPromises()
    expect(bodyQuery('[data-testid="import-details-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('shows the status of each step in its chip', async () => {
    // The step status chip.
    const wrapper = await mountModal()
    await show(wrapper, toInstanceResource(raw('in_progress')))

    const rows = [...document.body.querySelectorAll('[data-testid="import-details-modal"] tbody tr')]
    expect(rows).toHaveLength(2)
    const text = rows.map(row => row.textContent ?? '').join(' | ')
    expect(text).toContain('message.status.in-progress')
    expect(text).toContain('message.status.not-started')
    wrapper.unmount()
  })
})
