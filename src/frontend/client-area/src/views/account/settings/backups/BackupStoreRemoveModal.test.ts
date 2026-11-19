import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import BackupStoreRemoveModal from './BackupStoreRemoveModal.vue'
import * as api from './free-backups.api'

vi.mock('./free-backups.api', () => ({
  removeFreeBackupStore: vi.fn(),
}))

const OTHER = { id: 2, name: 'Default', driver: 'local', location: '/opt/panelalpha/backups/local' }

function result (store: api.FreeBackupStore | null, cleanup: api.FreeBackupCleanup | null): api.FreeBackupsChange {
  return {
    store,
    store_selected: false,
    store_created: false,
    defaults: { auto_enable: true, frequency: 'daily', hour: 3, day_of_week: null, day_of_month: null, keep_last: 7 },
    cleanup,
  }
}

async function mountModal (props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(BackupStoreRemoveModal, {
    global: { plugins: [pinia] },
    props: { modelValue: true, ...props },
  })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

function q<T extends HTMLElement = HTMLElement> (selector: string): T | null {
  return document.querySelector<T>(selector)
}

async function confirm () {
  q('.store-remove-confirm')!.click()
  await flushPromises()
}

function acknowledgeInput (): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-testid="store-remove-confirm-check"] input')!
}

async function acknowledge (): Promise<void> {
  acknowledgeInput().click()
  await flushPromises()
}

describe('BackupStoreRemoveModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('says the panel goes back to the server store and deletes the one it created', async () => {
    const { wrapper } = await mountModal({ storeCreated: true })

    expect(q('.backup-store-remove-modal.basic-modal')).not.toBeNull()
    expect(q('.store-remove-text')!.textContent).toContain('settings.backups.removeStoreText')
    expect(q('.store-remove-confirm')!.textContent).toContain('settings.backups.removeStoreConfirm')
    expect(q('.store-remove-cancel')).not.toBeNull()
    wrapper.unmount()
  })

  it('says a store the panel did not create stays on the server', async () => {
    const { wrapper } = await mountModal({ storeCreated: false })

    expect(q('.store-remove-text')!.textContent).toContain('settings.backups.removeStoreKeep')
    wrapper.unmount()
  })

  it('takes an acknowledgement for a store it created before Remove store works', async () => {
    const { wrapper } = await mountModal({ storeCreated: true })

    expect(q('[data-testid="store-remove-confirm-check"]')!.textContent).toContain('settings.backups.removeStoreAcknowledge')
    expect(q('.store-remove-confirm')!.hasAttribute('disabled')).toBe(true)

    await confirm()
    expect(api.removeFreeBackupStore).not.toHaveBeenCalled()

    await acknowledge()
    expect(q('.store-remove-confirm')!.hasAttribute('disabled')).toBe(false)
    wrapper.unmount()
  })

  it('takes an acknowledgement for a store it did not create before Remove store works', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(OTHER, { id: 1, container: 'kept', reason: 'not_ours' }))
    const { wrapper } = await mountModal({ storeCreated: false })

    expect(q('[data-testid="store-remove-confirm-check"]')!.textContent).toContain('settings.backups.removeStoreAcknowledgeKeep')
    expect(q('.store-remove-confirm')!.hasAttribute('disabled')).toBe(true)

    await acknowledge()
    expect(q('.store-remove-confirm')!.hasAttribute('disabled')).toBe(false)
    await confirm()
    expect(api.removeFreeBackupStore).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('removes the store, emits removed, toasts and closes', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(OTHER, { id: 1, container: 'deleted', reason: null }))
    const { wrapper, alerts } = await mountModal({ storeCreated: true })
    await acknowledge()
    await confirm()

    expect(api.removeFreeBackupStore).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('removed')![0]).toEqual([result(OTHER, { id: 1, container: 'deleted', reason: null })])
    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'settings.backups.storeRemoved' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  it('says an in-use store stays on the server', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(OTHER, { id: 1, container: 'kept', reason: 'in_use' }))
    const { wrapper, alerts } = await mountModal({ storeCreated: true })
    await acknowledge()
    await confirm()

    expect(alerts.activeAlerts[0]).toMatchObject({ successMessage: 'settings.backups.storeRemovedInUse' })
    wrapper.unmount()
  })

  it('says a store the panel did not create stays on the server after the removal', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(OTHER, { id: 1, container: 'kept', reason: 'not_ours' }))
    const { wrapper, alerts } = await mountModal({ storeCreated: false })
    await acknowledge()
    await confirm()

    expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'settings.backups.storeRemovedNotOurs' })
    wrapper.unmount()
  })

  it('says a store it could not delete stays on the server', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(OTHER, { id: 1, container: 'kept', reason: 'error' }))
    const { wrapper, alerts } = await mountModal({ storeCreated: true })
    await acknowledge()
    await confirm()

    expect(alerts.activeAlerts[0]).toMatchObject({ successMessage: 'settings.backups.storeRemovedKept' })
    wrapper.unmount()
  })

  it('says no store is set up when none is left', async () => {
    vi.mocked(api.removeFreeBackupStore).mockResolvedValue(result(null, { id: 1, container: 'deleted', reason: null }))
    const { wrapper, alerts } = await mountModal({ storeCreated: true })
    await acknowledge()
    await confirm()

    expect(alerts.activeAlerts[0]).toMatchObject({ successMessage: 'settings.backups.storeRemovedNone' })
    wrapper.unmount()
  })

  it('shows a failure in the dialog and stays open', async () => {
    vi.mocked(api.removeFreeBackupStore).mockRejectedValue({ response: { status: 500, data: { message: 'Engine down.' } } })
    const { wrapper, alerts } = await mountModal({ storeCreated: true })
    await acknowledge()
    await confirm()

    expect(q('.store-remove-error')!.textContent).toContain('Engine down.')
    expect(alerts.activeAlerts).toHaveLength(0)
    expect(wrapper.emitted('removed')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('cancel closes without a request', async () => {
    const { wrapper } = await mountModal({ storeCreated: true })

    q('.store-remove-cancel')!.click()
    await flushPromises()

    expect(api.removeFreeBackupStore).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })
})
