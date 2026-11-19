import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmRenameModal from './FmRenameModal.vue'

function folder (name: string): FmDirectory {
  return { type: 'dir', path: name, basename: name, dirname: '', timestamp: 0 }
}

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

function input (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-rename-name"] input')
  if (!element) {
    throw new Error('name input not found')
  }
  return element
}

function typeName (value: string): Promise<void> {
  input().value = value
  input().dispatchEvent(new Event('input'))
  return flushPromises()
}

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmRenameModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('starts with the current name, which cannot be submitted unchanged', async () => {
    const store = useFileManagerStore()
    store.files = [file('notes.txt')]
    store.select(file('notes.txt'))
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(input().value).toBe('notes.txt')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('rejects a name of another file in the folder and keeps the feedback', async () => {
    const store = useFileManagerStore()
    store.files = [file('notes.txt'), file('todo.txt')]
    store.select(file('notes.txt'))
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('todo.txt')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.rename.fileExist')

    await typeName('done.txt')
    expect(footerButton('button.submit')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('checks a folder against the folders only (legacy directoryExist)', async () => {
    const store = useFileManagerStore()
    store.directories = [folder('docs'), folder('old')]
    store.files = [file('notes.txt')]
    store.select(folder('old'))
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('notes.txt')
    expect(footerButton('button.submit')?.disabled).toBe(false)

    await typeName('docs')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.rename.directoryExist')
    wrapper.unmount()
  })

  it('refuses a new name with a backslash and sends nothing', async () => {
    const store = useFileManagerStore()
    store.files = [file('notes.txt')]
    store.select(file('notes.txt'))
    const rename = vi.spyOn(store, 'renameItem').mockResolvedValue(true)
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName(String.raw`sub\notes.txt`)
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.invalidName')
    expect(rename).not.toHaveBeenCalled()

    await typeName('notes2.txt')
    expect(footerButton('button.submit')?.disabled).toBe(false)
    expect(document.body.textContent).not.toContain('message.fileManager.invalidName')
    wrapper.unmount()
  })

  it('renames with the typed name and closes after success', async () => {
    const store = useFileManagerStore()
    store.files = [file('notes.txt')]
    store.select(file('notes.txt'))
    const renameItem = vi.spyOn(store, 'renameItem').mockResolvedValue(true)
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('plan.txt')
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(renameItem).toHaveBeenCalledWith(file('notes.txt'), 'plan.txt')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the modal open when the rename fails', async () => {
    const store = useFileManagerStore()
    store.files = [file('notes.txt')]
    store.select(file('notes.txt'))
    vi.spyOn(store, 'renameItem').mockResolvedValue(false)
    const wrapper = await mountKit(FmRenameModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('plan.txt')
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
