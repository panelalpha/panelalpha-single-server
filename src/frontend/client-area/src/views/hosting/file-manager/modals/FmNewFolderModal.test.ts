import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmNewFolderModal from './FmNewFolderModal.vue'

function folder (name: string): FmDirectory {
  return { type: 'dir', path: name, basename: name, dirname: '', timestamp: 0 }
}

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

function input (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-new-folder-name"] input')
  if (!element) {
    throw new Error('name input not found')
  }
  return element
}

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmNewFolderModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('rejects a name of an existing folder but allows the name of a file (legacy directoryExist)', async () => {
    const store = useFileManagerStore()
    store.directories = [folder('docs')]
    store.files = [file('notes')]
    const wrapper = await mountKit(FmNewFolderModal, { global: { plugins: [pinia] } })
    await flushPromises()

    input().value = 'docs'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.newFolder.fieldFeedback')

    input().value = 'notes'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    expect(footerButton('button.submit')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('creates the folder and closes after success', async () => {
    const store = useFileManagerStore()
    const createDirectory = vi.spyOn(store, 'createDirectory').mockResolvedValue(true)
    const wrapper = await mountKit(FmNewFolderModal, { global: { plugins: [pinia] } })
    await flushPromises()
    input().value = 'new'
    input().dispatchEvent(new Event('input'))
    await flushPromises()

    footerButton('button.submit')?.click()
    await flushPromises()

    expect(createDirectory).toHaveBeenCalledWith('new')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
