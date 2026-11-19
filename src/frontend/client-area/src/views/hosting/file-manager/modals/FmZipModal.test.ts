import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmZipModal from './FmZipModal.vue'

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

function input (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-zip-name"] input')
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

describe('FmZipModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('disables Submit for an empty name and shows the selection', async () => {
    const store = useFileManagerStore()
    store.files = [file('a.txt')]
    store.select(file('a.txt'))
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.querySelector('[data-testid="fm-selected-list"]')?.textContent).toContain('a.txt')
    wrapper.unmount()
  })

  it('rejects the name of an existing archive, the name counted with .zip (legacy fileExist)', async () => {
    const store = useFileManagerStore()
    store.files = [file('backup.zip')]
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.zip.fieldFeedback')

    await typeName('archive')
    expect(footerButton('button.submit')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('keeps a name typed with .zip as it is, whatever the case', async () => {
    const store = useFileManagerStore()
    store.files = [file('a.txt')]
    store.select(file('a.txt'))
    const zipSelected = vi.spyOn(store, 'zipSelected').mockResolvedValue(true)
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup.zip')
    footerButton('button.submit')?.click()
    await flushPromises()
    expect(zipSelected).toHaveBeenLastCalledWith('backup.zip')

    await typeName('backup.ZIP')
    footerButton('button.submit')?.click()
    await flushPromises()
    expect(zipSelected).toHaveBeenLastCalledWith('backup.ZIP')
    wrapper.unmount()
  })

  it('shows the .zip suffix only for a name that does not end in .zip', async () => {
    const store = useFileManagerStore()
    store.select(file('a.txt'))
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup')
    expect(document.querySelector('[data-testid="fm-zip"] .v-text-field__suffix')?.textContent).toBe('.zip')

    await typeName('backup.zip')
    expect(document.querySelector('[data-testid="fm-zip"] .v-text-field__suffix')).toBeNull()
    wrapper.unmount()
  })

  it('rejects an existing archive typed with its .zip name', async () => {
    const store = useFileManagerStore()
    store.files = [file('backup.zip')]
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup.zip')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.zip.fieldFeedback')
    wrapper.unmount()
  })

  it('creates the archive with the .zip name and closes after success', async () => {
    const store = useFileManagerStore()
    store.files = [file('a.txt')]
    store.select(file('a.txt'))
    const zipSelected = vi.spyOn(store, 'zipSelected').mockResolvedValue(true)
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup')
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(zipSelected).toHaveBeenCalledWith('backup.zip')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the modal open when the archive is not created', async () => {
    const store = useFileManagerStore()
    store.select(file('a.txt'))
    vi.spyOn(store, 'zipSelected').mockResolvedValue(false)
    const wrapper = await mountKit(FmZipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    await typeName('backup')
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
