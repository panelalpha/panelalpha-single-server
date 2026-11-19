import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
import type { VueWrapper } from '@vue/test-utils'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as backupsApi from '@/entities/project/instance-backups.api'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { mountKit } from '@/test/mount-kit'
import CreateBackupModal from './CreateBackupModal.vue'

vi.mock('@/entities/project/instance-backups.api', () => ({
  createBackup: vi.fn(),
}))

interface OpenableModal {
  open: (retryId?: number, convertFromId?: number | null) => void
}

function makeInstance (type?: string, hostingServerType = 'pleskwp', isContainer = true): InstanceResource {
  return { id: 9, type, hostingServerType, isContainer } as unknown as InstanceResource
}

/**
 * Mounts the modal the way its parents do: `v-model` is wired to a prop the test flips. It starts closed, so the form reset runs on the
 * first open, as it does in the app.
 */
async function mountModal (options: { type?: string, hostingServerType?: string, container?: boolean, limitReached?: boolean, storeMissing?: boolean } = {}) {
  setActivePinia(createPinia())
  const emitted: boolean[] = []
  const wrapper: VueWrapper = await mountKit(CreateBackupModal, {
    props: {
      'instance': makeInstance(options.type, options.hostingServerType, options.container),
      'limitReached': options.limitReached ?? false,
      'storeMissing': options.storeMissing ?? false,
      'modelValue': false,
      'onUpdate:modelValue': (value: boolean) => {
        emitted.push(value)
        void wrapper.setProps({ modelValue: value })
      },
    },
    global: { plugins: [createPinia()] },
  })
  return { wrapper, emitted }
}

function fieldNames (wrapper: VueWrapper): string[] {
  return wrapper.findAllComponents(BasicModalField).map(field => field.props('field').name)
}

async function clickCreate (wrapper: VueWrapper): Promise<void> {
  wrapper.findComponent(BasicModal).vm.$emit('button-click', 'create')
  await flushPromises()
}

function openBy (wrapper: VueWrapper): OpenableModal {
  return wrapper.vm as unknown as OpenableModal
}

function createButton (wrapper: VueWrapper): ModalButton {
  const buttons = wrapper.findComponent(BasicModal).props('buttons') as ModalButton[]
  return buttons.find(button => button.id === 'create')!
}

async function tick (wrapper: VueWrapper, name: string, value: boolean): Promise<void> {
  const field = wrapper.findAllComponents(BasicModalField).find(component => component.props('field').name === name)!
  field.vm.$emit('update:modelValue', value)
  await flushPromises()
}

describe('CreateBackupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(backupsApi.createBackup).mockResolvedValue()
  })

  it('sends one request when create is clicked again while the first is still running', async () => {
    vi.mocked(backupsApi.createBackup).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountModal()

    await wrapper.setProps({ modelValue: true })
    await clickCreate(wrapper)
    await clickCreate(wrapper)

    expect(backupsApi.createBackup).toHaveBeenCalledTimes(1)
  })

  it('opens through v-model with the directory and database fields and sends no branch ids', async () => {
    const { wrapper } = await mountModal()

    await wrapper.setProps({ modelValue: true })

    expect(fieldNames(wrapper)).toEqual(['backupDirectory', 'backupDatabase', 'backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: true, backupDatabase: true, backupNote: '' })
  })

  it('disables create with the reason when both backup parts are unticked', async () => {
    const { wrapper } = await mountModal()

    await wrapper.setProps({ modelValue: true })
    expect(createButton(wrapper).disabled).toBe(false)
    expect(wrapper.findComponent(BasicModal).props('alert')).toBeUndefined()

    await tick(wrapper, 'backupDirectory', false)
    await tick(wrapper, 'backupDatabase', false)

    expect(createButton(wrapper).disabled).toBe(true)
    expect(wrapper.findComponent(BasicModal).props('alert')).toBe('Choose files or databases to back up.')
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).not.toHaveBeenCalled()
  })

  it('keeps create enabled and the reason hidden while one part stays ticked', async () => {
    const { wrapper } = await mountModal()

    await wrapper.setProps({ modelValue: true })
    await tick(wrapper, 'backupDirectory', false)

    expect(createButton(wrapper).disabled).toBe(false)
    expect(wrapper.findComponent(BasicModal).props('alert')).toBeUndefined()
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: false, backupDatabase: true, backupNote: '' })
  })

  it('marks the modal with the 560px width class and no inline style', async () => {
    const { wrapper } = await mountModal()

    await wrapper.setProps({ modelValue: true })

    const modal = wrapper.findComponent(BasicModal)
    expect(modal.classes()).toContain('create-backup-modal')
    expect(modal.attributes('style')).toBeUndefined()
  })

  it('sends retry_id on open(retryId) and keeps the full form', async () => {
    const { wrapper } = await mountModal()

    openBy(wrapper).open(7)
    await flushPromises()

    expect(fieldNames(wrapper)).toEqual(['backupDirectory', 'backupDatabase', 'backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, expect.objectContaining({ retry_id: 7 }))
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, expect.not.objectContaining({ convert_from_id: expect.anything() }))
  })

  it('shows only the note field on open(_, convertFromId) and sends convert_from_id', async () => {
    const { wrapper } = await mountModal()

    openBy(wrapper).open(undefined, 5)
    await flushPromises()

    expect(fieldNames(wrapper)).toEqual(['backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, {
      backupDirectory: true,
      backupDatabase: true,
      backupNote: '',
      convert_from_id: 5,
    })
  })

  it('does not open a plain create when the limit is reached', async () => {
    const { wrapper, emitted } = await mountModal({ limitReached: true })

    openBy(wrapper).open()
    await flushPromises()

    expect(emitted).toEqual([])
    expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
  })

  it('opens no create, retry or convert when no backup store is set up', async () => {
    const { wrapper, emitted } = await mountModal({ storeMissing: true })

    openBy(wrapper).open()
    openBy(wrapper).open(3)
    openBy(wrapper).open(undefined, 5)
    await flushPromises()

    expect(emitted).toEqual([])
    expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
  })

  it('opens a convert when the limit is reached', async () => {
    const { wrapper, emitted } = await mountModal({ limitReached: true })

    openBy(wrapper).open(undefined, 5)
    await flushPromises()

    expect(emitted).toEqual([true])
    expect(fieldNames(wrapper)).toEqual(['backupNote'])
  })

  it('clears the branch on close, so the next v-model open is a plain create', async () => {
    const { wrapper } = await mountModal()

    openBy(wrapper).open(7)
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(fieldNames(wrapper)).toEqual(['backupDirectory', 'backupDatabase', 'backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: true, backupDatabase: true, backupNote: '' })
  })

  it('uses the WP Cloud backup type field and its default on a plain create', async () => {
    const { wrapper } = await mountModal({ hostingServerType: 'wp-cloud' })

    await wrapper.setProps({ modelValue: true })

    expect(fieldNames(wrapper)).toEqual(['backupType', 'backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, {
      backupType: 'directory',
      backupDirectory: true,
      backupNote: '',
    })
  })

  it('shows only the note on a WP Cloud convert, with the same defaults', async () => {
    const { wrapper } = await mountModal({ hostingServerType: 'wp-cloud' })

    openBy(wrapper).open(undefined, 5)
    await flushPromises()

    expect(fieldNames(wrapper)).toEqual(['backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, expect.objectContaining({ convert_from_id: 5, backupType: 'directory' }))
  })

  it('shows only the note for a custom project and still sends both flags', async () => {
    const { wrapper } = await mountModal({ type: 'custom' })

    await wrapper.setProps({ modelValue: true })

    expect(fieldNames(wrapper)).toEqual(['backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: true, backupDatabase: true, backupNote: '' })
  })

  it('shows the directory and database choice on a classic PHP hosting project', async () => {
    const { wrapper } = await mountModal({ type: 'custom', container: false })

    await wrapper.setProps({ modelValue: true })

    expect(fieldNames(wrapper)).toEqual(['backupDirectory', 'backupDatabase', 'backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: true, backupDatabase: true, backupNote: '' })
  })

  it('keeps both flags and sends retry_id on a custom project retry', async () => {
    const { wrapper } = await mountModal({ type: 'custom' })

    openBy(wrapper).open(7)
    await flushPromises()

    expect(fieldNames(wrapper)).toEqual(['backupNote'])
    await clickCreate(wrapper)
    expect(backupsApi.createBackup).toHaveBeenCalledWith(9, { backupDirectory: true, backupDatabase: true, backupNote: '', retry_id: 7 })
  })

  it('keeps the WP Cloud backup type select for a custom project on a WP Cloud server', async () => {
    const { wrapper } = await mountModal({ type: 'custom', hostingServerType: 'wp-cloud' })

    await wrapper.setProps({ modelValue: true })

    expect(fieldNames(wrapper)).toEqual(['backupType', 'backupNote'])
  })

  it('shows the code and data info only for a container project not on WP Cloud', async () => {
    const info = 'This backup includes the project code and its data'
    const custom = await mountModal({ type: 'custom' })
    await custom.wrapper.setProps({ modelValue: true })
    expect(custom.wrapper.findComponent(BasicModal).props('message')).toContain(info)

    const wordpress = await mountModal()
    await wordpress.wrapper.setProps({ modelValue: true })
    expect(wordpress.wrapper.findComponent(BasicModal).props('message')).toBeUndefined()

    const wpCloud = await mountModal({ type: 'custom', hostingServerType: 'wp-cloud' })
    await wpCloud.wrapper.setProps({ modelValue: true })
    expect(wpCloud.wrapper.findComponent(BasicModal).props('message')).toBeUndefined()

    const classic = await mountModal({ type: 'custom', container: false })
    await classic.wrapper.setProps({ modelValue: true })
    expect(classic.wrapper.findComponent(BasicModal).props('message')).toBeUndefined()
  })
})
