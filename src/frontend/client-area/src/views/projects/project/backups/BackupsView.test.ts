import type { BackupRow, BackupsUsage } from '@/entities/project/instance-backups.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as backupsApi from '@/entities/project/instance-backups.api'
import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
import BackupAutomaticSwitcher from '@/entities/project/ui/backups/BackupAutomaticSwitcher.vue'
import CreateBackupModal from '@/entities/project/ui/backups/CreateBackupModal.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit as emitEvent } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import TableSkeletonMobile from '@/shared/ui/skeletons/TableSkeletonMobile.vue'
import TableSkeletonRow from '@/shared/ui/skeletons/TableSkeletonRow.vue'
import { mountKit } from '@/test/mount-kit'
import BackupsSelectSnackbar from './BackupsSelectSnackbar.vue'
import BackupsTable from './BackupsTable.vue'
import BackupsUsageItem from './BackupsUsageItem.vue'
import BackupsView from './BackupsView.vue'

vi.mock('@/entities/project/instance-backups.api', () => ({
  getBackups: vi.fn(),
  getAutomaticBackupSettings: vi.fn(),
  createBackup: vi.fn(),
  saveAutomaticBackupSettings: vi.fn(),
  restoreBackup: vi.fn(),
  deleteBackup: vi.fn(),
}))

const DESKTOP_WIDTH = 1400
const MOBILE_WIDTH = 900

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function row (overrides: Partial<BackupRow> = {}): BackupRow {
  return {
    id: 1,
    name: 'Nightly',
    date: 1_700_000_000,
    size: 1024,
    type: 'manual',
    mode: 'full',
    convert_from_id: null,
    version: null,
    note: null,
    directory: true,
    database: true,
    async_status: null,
    items: [],
    ...overrides,
  }
}

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 9,
    hostingServerType: 'custom',
    server_settings: { uses_own_backup_system: false },
    automatic_backups_editable: true,
    hasManageAutoBackupPrivilege: () => true,
    has_automatic_backup: null,
    setBackupDetails: vi.fn(),
    setAutomaticBackup: vi.fn(),
    ...overrides,
  } as unknown as InstanceResource
}

/** Resolves the list GET with the given rows and usage. */
function listResolves (data: BackupRow[], usage: BackupsUsage = {}) {
  vi.mocked(backupsApi.getBackups).mockResolvedValue({ data, usage })
}

async function mountView (instance = makeInstance(), { singleServer = false } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (singleServer) {
    useSessionStore().home = { app: { single_server: { active: true } } } as never
  }
  const wrapper = await mountKit(BackupsView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, instance }
}

describe('BackupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never' })
    setWidth(DESKTOP_WIDTH)
  })

  afterEach(() => {
    setWidth(1024)
  })

  it('shows the desktop skeleton while the list loads', async () => {
    vi.mocked(backupsApi.getBackups).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    expect(wrapper.findComponent(TableSkeletonRow).exists()).toBe(true)
    expect(wrapper.findComponent(TableSkeletonMobile).exists()).toBe(false)
  })

  it('shows five mobile skeletons below 1200 px', async () => {
    setWidth(MOBILE_WIDTH)
    vi.mocked(backupsApi.getBackups).mockReturnValue(new Promise(() => {}))

    const { wrapper } = await mountView()

    expect(wrapper.findAllComponents(TableSkeletonMobile)).toHaveLength(5)
    expect(wrapper.findComponent(TableSkeletonRow).exists()).toBe(false)
  })

  it('requests the list of the instance once on mount', async () => {
    listResolves([])

    await mountView(makeInstance({ id: 42 }))

    expect(backupsApi.getBackups).toHaveBeenCalledTimes(1)
    expect(backupsApi.getBackups).toHaveBeenCalledWith(42)
  })

  it('passes the rows to the frame after the GET', async () => {
    const instance = makeInstance()
    const rows = [row({ id: 1 }), row({ id: 2 })]
    listResolves(rows)

    await mountView(instance)

    expect(instance.setBackupDetails).toHaveBeenCalledWith(rows)
  })

  it('shows the empty state with the illustration and the create action when the list is empty', async () => {
    listResolves([])

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="backups-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="backups-empty-add"]').exists()).toBe(true)
  })

  it('opens the create dialog from the empty state action', async () => {
    listResolves([])

    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="backups-empty-add"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(CreateBackupModal).props('modelValue')).toBe(true)
  })

  it('says the list could not be loaded instead of the empty state, without an alert', async () => {
    vi.mocked(backupsApi.getBackups).mockRejectedValue(new Error('boom'))

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="backups-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="backups-empty"]').exists()).toBe(false)
    expect(wrapper.findComponent(BackupsTable).props('itemsLoading')).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([])
  })

  it('loads the list again from the Retry button of the error', async () => {
    vi.mocked(backupsApi.getBackups).mockRejectedValueOnce(new Error('boom'))
    const rows = [row({ id: 1 })]
    listResolves(rows)

    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="backups-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(backupsApi.getBackups).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="backups-load-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="backups-table"] tbody tr')).toHaveLength(1)
  })

  it('shows one usage chip per known key, in order', async () => {
    listResolves([], {
      backups_size: { total: '0.10', max: null },
      manual_backups_number: { total: 2, max: 5 },
    })

    const { wrapper } = await mountView()

    const chips = wrapper.findAllComponents(BackupsUsageItem)
    expect(chips.map(chip => chip.props('item').name)).toEqual(['manual_backups_number', 'backups_size'])
  })

  it('shows no usage chips for WP Cloud usage', async () => {
    listResolves([], {
      database_manual_backups_number: { total: 1, max: 4 },
      directory_manual_backups_number: { total: 0, max: 4 },
    })

    const { wrapper } = await mountView()

    expect(wrapper.findAllComponents(BackupsUsageItem)).toHaveLength(0)
  })

  it('disables Add new when the manual limit is reached', async () => {
    listResolves([], { manual_backups_number: { total: 3, max: 3 } })

    const { wrapper } = await mountView()

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeDefined()
  })

  it('enables Add new below the limit', async () => {
    listResolves([], { manual_backups_number: { total: 1, max: 3 } })

    const { wrapper } = await mountView()

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeUndefined()
  })

  it('shows no usage chips on single-server', async () => {
    listResolves([], { manual_backups_number: { total: 1, max: 3 }, backups_size: { total: '0.10', max: 1 } })

    const { wrapper } = await mountView(makeInstance(), { singleServer: true })

    expect(wrapper.findAllComponents(BackupsUsageItem)).toHaveLength(0)
  })

  it('does not block Add new on a reached plan limit on single-server', async () => {
    listResolves([], { manual_backups_number: { total: 3, max: 3 }, backups_size: { total: '1.00', max: 1 } })

    const { wrapper } = await mountView(makeInstance(), { singleServer: true })

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeUndefined()
  })

  it('still blocks Add new without a backup store on single-server', async () => {
    listResolves([], { manual_backups_number: { total: 0, max: 3 } })
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: false })

    const { wrapper } = await mountView(makeInstance(), { singleServer: true })

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeDefined()
  })

  it('blocks creating a backup and explains why when no backup store is set up', async () => {
    listResolves([])
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: false })

    const { wrapper } = await mountView()

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="backups-empty-add"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="backup-store-missing-notice"]').exists()).toBe(true)
  })

  it('does not block creating when the store is set up or the answer is unknown', async () => {
    listResolves([])

    for (const settings of [{ frequency: 'never', store_configured: true }, { frequency: 'never' }]) {
      vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue(settings)

      const { wrapper } = await mountView()

      expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('[data-testid="backup-store-missing-notice"]').exists()).toBe(false)
    }
  })

  it('does not block creating when the server runs its own backup system', async () => {
    listResolves([])
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never', store_configured: false })

    const { wrapper } = await mountView(makeInstance({ server_settings: { uses_own_backup_system: true } }))

    expect(wrapper.get('[data-testid="backups-add-new"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="backup-store-missing-notice"]').exists()).toBe(false)
  })

  it('hides the automatic backup switcher when the server runs its own backup system', async () => {
    listResolves([])

    const { wrapper } = await mountView(makeInstance({ server_settings: { uses_own_backup_system: true } }))

    expect(wrapper.findComponent(BackupAutomaticSwitcher).exists()).toBe(false)
  })

  it('shows the switcher when the server does not run its own backup system', async () => {
    listResolves([])

    const { wrapper } = await mountView()

    expect(wrapper.findComponent(BackupAutomaticSwitcher).exists()).toBe(true)
  })

  it('sets the automatic backup flag to false when the schedule is never', async () => {
    listResolves([])
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'never' })

    const { instance } = await mountView()

    expect(instance.setAutomaticBackup).toHaveBeenCalledWith(false)
  })

  it('sets the automatic backup flag to true for any other frequency', async () => {
    listResolves([])
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValue({ frequency: 'daily' })

    const { instance } = await mountView()

    expect(instance.setAutomaticBackup).toHaveBeenCalledWith(true)
  })

  it('refetches the schedule and updates the flag on reload-settings', async () => {
    listResolves([])
    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValueOnce({ frequency: 'never' })

    const { wrapper, instance } = await mountView()
    expect(instance.setAutomaticBackup).toHaveBeenLastCalledWith(false)

    vi.mocked(backupsApi.getAutomaticBackupSettings).mockResolvedValueOnce({ frequency: 'weekly' })
    wrapper.findComponent(BackupAutomaticSwitcher).vm.$emit('reload-settings')
    await flushPromises()

    expect(backupsApi.getAutomaticBackupSettings).toHaveBeenCalledTimes(2)
    expect(instance.setAutomaticBackup).toHaveBeenLastCalledWith(true)
  })

  it('reloads the list after a backup is created', async () => {
    listResolves([])

    const { wrapper } = await mountView()
    expect(backupsApi.getBackups).toHaveBeenCalledTimes(1)

    wrapper.findComponent(CreateBackupModal).vm.$emit('created')
    await flushPromises()

    expect(backupsApi.getBackups).toHaveBeenCalledTimes(2)
  })

  it('replaces a changed row from Echo and passes the backup to the frame chip', async () => {
    listResolves([row({ id: 1, note: 'before' })])
    const instance = makeInstance({ setBackupItem: vi.fn(), unsetBackupItem: vi.fn() })

    const { wrapper } = await mountView(instance)
    emitEvent('backup-item-changed', row({ id: 1, note: 'renamed' }))
    await flushPromises()

    expect(wrapper.text()).toContain('renamed')
    expect(instance.setBackupItem).toHaveBeenCalledWith(expect.objectContaining({ id: 1, note: 'renamed' }))
  })

  it('removes a deleted row from Echo, recounts the usage and updates the frame chip', async () => {
    listResolves([row({ id: 1 }), row({ id: 2 })], { manual_backups_number: { total: 2, max: 5 } })
    const instance = makeInstance({ setBackupItem: vi.fn(), unsetBackupItem: vi.fn() })

    const { wrapper } = await mountView(instance)
    emitEvent('backup-item-deleted', row({ id: 1 }))
    await flushPromises()

    expect(wrapper.findAllComponents(BackupsTable)[0]?.props('items')).toHaveLength(1)
    expect(wrapper.findComponent(BackupsUsageItem).props('item').data.total).toBe(1)
    expect(instance.unsetBackupItem).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('drops a selected backup from the selection when Echo deletes it', async () => {
    listResolves([row({ id: 1 }), row({ id: 2 })])
    const instance = makeInstance({ setBackupItem: vi.fn(), unsetBackupItem: vi.fn() })

    const { wrapper } = await mountView(instance)
    const table = wrapper.findComponent(BackupsTable)
    table.vm.$emit('update:checked-items', table.props('items').find(item => item.id === 1)!)
    table.vm.$emit('update:checked-items', table.props('items').find(item => item.id === 2)!)
    await flushPromises()
    emitEvent('backup-item-deleted', row({ id: 1 }))
    await flushPromises()

    expect(wrapper.findComponent(BackupsSelectSnackbar).props('checkedItems')).toEqual([2])
  })

  it('drops a GET answered after an Echo change, so the changed row stays', async () => {
    let resolveReload: (value: Awaited<ReturnType<typeof backupsApi.getBackups>>) => void = () => {}
    vi.mocked(backupsApi.getBackups)
      .mockResolvedValueOnce({ data: [row({ id: 1 })], usage: {} })
      .mockReturnValueOnce(new Promise(resolve => {
        resolveReload = resolve
      }))
    const instance = makeInstance({ setBackupItem: vi.fn(), unsetBackupItem: vi.fn() })

    const { wrapper } = await mountView(instance)
    wrapper.findComponent(CreateBackupModal).vm.$emit('created')
    await flushPromises()
    emitEvent('backup-item-changed', row({ id: 1, note: 'renamed' }))
    await flushPromises()
    resolveReload({ data: [row({ id: 1 })], usage: {} })
    await flushPromises()

    expect(wrapper.text()).toContain('renamed')
  })

  it('ignores an Echo event for a backup outside the loaded list, the usage and the chip included', async () => {
    listResolves([row({ id: 1 })], { manual_backups_number: { total: 1, max: 5 } })
    const instance = makeInstance({ setBackupItem: vi.fn(), unsetBackupItem: vi.fn() })

    const { wrapper } = await mountView(instance)
    emitEvent('backup-item-changed', row({ id: 99, note: 'elsewhere' }))
    emitEvent('backup-item-deleted', row({ id: 98 }))
    await flushPromises()

    expect(instance.setBackupItem).not.toHaveBeenCalled()
    expect(instance.unsetBackupItem).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('elsewhere')
    expect(wrapper.findComponent(BackupsUsageItem).props('item').data.total).toBe(1)
  })

  it('opens the create modal with retry_id from the try link of a failed create', async () => {
    listResolves([row({ id: 6, async_status: { create: 'failed' } })])

    const { wrapper } = await mountView()
    await wrapper.get('.try-again').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(CreateBackupModal).props('modelValue')).toBe(true)
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'create')
    await flushPromises()
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, expect.objectContaining({ retry_id: 6 }))
  })

  it('opens the convert modal with convert_from_id from the convert to full button', async () => {
    listResolves([row({ id: 7, mode: 'incremental' })])

    const { wrapper } = await mountView()
    await wrapper.findAll('.actions-row button')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAllComponents(BasicModalField).map(field => field.props('field').name)).toEqual(['backupNote'])
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'create')
    await flushPromises()
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, expect.objectContaining({ convert_from_id: 7 }))
  })

  it('restores a backup with the ticked flags and marks the row pending without a reload', async () => {
    listResolves([row({ id: 1, database: true, directory: true })])

    const { wrapper } = await mountView()
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-restore', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()
    wrapper.findComponent(ActionModalHost).vm.$emit('update:values', { restoreDatabase: true })
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.restoreBackup).toHaveBeenCalledWith(9, 1, {
      restoreDatabase: true,
      restoreDirectory: false,
      deleteExistingFiles: true,
    })
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(false)
    expect(wrapper.findComponent(BackupsTable).props('items')[0]?.async_status.restore).toBe('pending')
    expect(backupsApi.getBackups).toHaveBeenCalledTimes(1)
  })

  it('opens the custom restore dialog with code and data checkboxes and the warning, and sends the ticked flags', async () => {
    listResolves([row({ id: 1, database: true, directory: true })])

    const { wrapper } = await mountView(makeInstance({ type: 'custom', isContainer: true }))
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-restore', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()
    const modal = wrapper.findComponent(ActionModalHost).props('modal')!
    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toEqual(['restoreDatabase', 'restoreDirectory'])
    expect(modal.props.alert).toBeTruthy()
    wrapper.findComponent(ActionModalHost).vm.$emit('update:values', { restoreDirectory: true })
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.restoreBackup).toHaveBeenCalledWith(9, 1, {
      restoreDatabase: false,
      restoreDirectory: true,
      deleteExistingFiles: false,
    })
  })

  it('keeps the WordPress restore dialog for a classic custom project without a container', async () => {
    listResolves([row({ id: 1, database: true, directory: true })])

    const { wrapper } = await mountView(makeInstance({ type: 'custom', isContainer: false }))
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-restore', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()
    const modal = wrapper.findComponent(ActionModalHost).props('modal')!
    expect(modal.fields.map(field => ('name' in field ? field.name : undefined))).toContain('deleteExistingFiles')
    expect(modal.props.alert).toBeFalsy()
    expect(wrapper.text()).not.toContain('table.header.code')
  })

  it('sends no restore request and keeps the dialog open when no part is ticked', async () => {
    listResolves([row({ id: 1, database: true, directory: false })])

    const { wrapper } = await mountView()
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-restore', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.restoreBackup).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(true)
  })

  it('keeps Restore off with the reason while no part is ticked, and on once one is', async () => {
    listResolves([row({ id: 1, database: true, directory: true })])

    const { wrapper } = await mountView()
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-restore', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()

    const submit = () => wrapper.findComponent(BasicModal).props('buttons')?.find(button => button.id === 'submit')
    expect(submit()?.disabled).toBe(true)
    expect(wrapper.findComponent(BasicModal).props('submitReason')).toBe('notification.instance.backup.restore.error')

    await wrapper.findComponent(BasicModal).vm.$emit('button-click', 'submit')
    await flushPromises()
    expect(wrapper.findComponent(ActionModalHost).emitted('button')).toBeUndefined()
    expect(backupsApi.restoreBackup).not.toHaveBeenCalled()

    wrapper.findComponent(ActionModalHost).vm.$emit('update:values', { restoreDatabase: true })
    await flushPromises()

    expect(submit()?.disabled).toBeFalsy()
    expect(wrapper.findComponent(BasicModal).props('submitReason')).toBeUndefined()
  })

  it('deletes a backup after the confirm checkbox and marks the row pending without a reload', async () => {
    listResolves([row({ id: 1 })])

    const { wrapper } = await mountView()
    wrapper.findComponent(BackupsTable).vm.$emit('action-button-delete', wrapper.findComponent(BackupsTable).props('items')[0])
    await flushPromises()
    wrapper.findComponent(ActionModalHost).vm.$emit('update:values', { confirm: true })
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.deleteBackup).toHaveBeenCalledWith(9, 1)
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(false)
    expect(wrapper.findComponent(BackupsTable).props('items')[0]?.async_status.delete).toBe('pending')
    expect(backupsApi.getBackups).toHaveBeenCalledTimes(1)
  })

  it('opens the delete dialog from the try link of a failed delete', async () => {
    listResolves([row({ id: 4, async_status: { delete: 'failed' } })])

    const { wrapper } = await mountView()
    await wrapper.get('.try-again').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(ActionModalHost).props('modal')?.type).toBe('backup-delete')
  })

  it('opens the restore dialog from the try link of a failed restore', async () => {
    listResolves([row({ id: 5, async_status: { restore: 'failed' } })])

    const { wrapper } = await mountView()
    await wrapper.get('.try-again').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(ActionModalHost).props('modal')?.type).toBe('backup-restore')
  })

  /** Checks the rows of the page through the table, then asks the snackbar to remove them. */
  async function selectAndRemove (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], indexes: number[]) {
    const table = wrapper.findComponent(BackupsTable)
    for (const index of indexes) {
      table.vm.$emit('update:checked-items', table.props('items')[index]!)
    }
    await flushPromises()
    wrapper.findComponent(BackupsSelectSnackbar).vm.$emit('mass-action-remove')
    await flushPromises()
  }

  it('deletes the selected backups one by one, clears the selection and reloads the list', async () => {
    listResolves([row({ id: 1 }), row({ id: 2 }), row({ id: 3 })])

    const { wrapper } = await mountView()
    await selectAndRemove(wrapper, [0, 2])

    expect(wrapper.findComponent(ActionModalHost).props('modal')?.type).toBe('backup-mass-delete')
    expect(wrapper.findComponent(ActionModalHost).props('modal')?.fields).toEqual([])
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.deleteBackup).toHaveBeenNthCalledWith(1, 9, 1)
    expect(backupsApi.deleteBackup).toHaveBeenNthCalledWith(2, 9, 3)
    expect(backupsApi.deleteBackup).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(ActionModalHost).props('modal')?.props.submittingProgressLog).toContain('2/2.')
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(false)
    expect(wrapper.findComponent(BackupsSelectSnackbar).props('checkedItems')).toEqual([])
    expect(backupsApi.getBackups).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('stops at the first failed delete, keeps the selection and still closes the dialog and reloads the list', async () => {
    listResolves([row({ id: 1 }), row({ id: 2 })])
    vi.mocked(backupsApi.deleteBackup).mockRejectedValueOnce(new Error('boom'))

    const { wrapper } = await mountView()
    await selectAndRemove(wrapper, [0, 1])
    wrapper.findComponent(ActionModalHost).vm.$emit('button', 'submit')
    await flushPromises()

    expect(backupsApi.deleteBackup).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(ActionModalHost).props('modal')?.props.submittingProgressLog).toContain('delete.error 1/2')
    expect(wrapper.findComponent(ActionModalHost).props('open')).toBe(false)
    expect(wrapper.findComponent(BackupsSelectSnackbar).props('checkedItems')).toEqual([1, 2])
    expect(backupsApi.getBackups).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('titles the Code and Data columns for a custom project only', async () => {
    listResolves([row()])
    const custom = await mountView(makeInstance({ type: 'custom', isContainer: true }))
    // The kit sort header must show the ready text, not the raw key.
    expect(custom.wrapper.text()).toContain('Code')
    expect(custom.wrapper.text()).toContain('Data')
    expect(custom.wrapper.text()).not.toContain('table.header.code')
    expect(custom.wrapper.text()).not.toContain('table.header.data')
    custom.wrapper.unmount()

    const wordpress = await mountView(makeInstance({ type: 'wordpress' }))
    expect(wordpress.wrapper.text()).not.toContain('Code')
    expect(wordpress.wrapper.text()).toContain('table.header.database')
    wordpress.wrapper.unmount()
  })
})
