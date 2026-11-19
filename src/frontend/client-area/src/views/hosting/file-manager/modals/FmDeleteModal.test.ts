import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmDeleteModal from './FmDeleteModal.vue'

function folder (name: string): FmDirectory {
  return { type: 'dir', path: name, basename: name, dirname: '', timestamp: 0 }
}

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 2048, timestamp: 0 }
}

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmDeleteModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('lists every selected item, folders first, and sends the selection to the store', async () => {
    const store = useFileManagerStore()
    store.directories = [folder('docs')]
    store.files = [file('a.txt'), file('b.txt')]
    store.select(file('a.txt'))
    store.select(file('b.txt'), true)
    store.select(folder('docs'), true)
    const deleteSelected = vi.spyOn(store, 'deleteSelected').mockResolvedValue(true)
    const wrapper = await mountKit(FmDeleteModal, { global: { plugins: [pinia] } })
    await flushPromises()

    const rows = Array.from(document.querySelectorAll('[data-testid="fm-selected-list"] li')).map(row => row.textContent?.trim())
    expect(rows[0]).toContain('docs')
    expect(rows.some(row => row?.includes('a.txt'))).toBe(true)
    expect(rows.some(row => row?.includes('b.txt'))).toBe(true)

    footerButton('button.delete')?.click()
    await flushPromises()

    expect(deleteSelected).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the empty notice and disables Delete when nothing is selected', async () => {
    const wrapper = await mountKit(FmDeleteModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(document.body.textContent).toContain('message.fileManager.delete.noSelected')
    expect(footerButton('button.delete')?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('keeps the modal open when the delete fails', async () => {
    const store = useFileManagerStore()
    store.files = [file('a.txt')]
    store.select(file('a.txt'))
    vi.spyOn(store, 'deleteSelected').mockResolvedValue(false)
    const wrapper = await mountKit(FmDeleteModal, { global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.delete')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
