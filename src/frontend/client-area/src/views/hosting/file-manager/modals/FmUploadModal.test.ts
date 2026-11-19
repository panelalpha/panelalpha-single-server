import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmUploadModal from './FmUploadModal.vue'

function picker (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-upload-input"]')
  if (!element) {
    throw new Error('file input not found')
  }
  return element
}

/** Selects files the way the browser does: the input gets the list and fires `change`. */
function select (files: File[]): void {
  Object.defineProperty(picker(), 'files', { value: files, configurable: true })
  picker().dispatchEvent(new Event('change'))
}

function submitButton (): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn'))
    .find(button => button.textContent?.includes('button.submit'))
}

function sized (name: string, size: number): File {
  return new File(['x'.repeat(size)], name)
}

describe('FmUploadModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    useFileManagerStore().config = { uploadMaxFilesize: 100, unsupportedActions: [] }
  })

  it('shows the no-selection notice and keeps Submit disabled', async () => {
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    expect(document.querySelector('.fm-upload__empty')?.textContent).toContain('message.fileManager.upload.noSelected')
    expect(submitButton()?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('blocks the upload when the sum of the selected files is above the limit', async () => {
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    select([sized('a.bin', 60), sized('b.bin', 60)])
    await flushPromises()

    expect(document.querySelector('[data-testid="fm-upload-limit"]')?.textContent).toContain('message.fileManager.limitExceeded')
    expect(document.querySelector('[data-testid="fm-upload-overwrite"]')).toBeNull()
    expect(submitButton()?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('uploads with the skip choice by default and closes after success', async () => {
    const store = useFileManagerStore()
    const upload = vi.spyOn(store, 'upload').mockResolvedValue(true)
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    const picked = [sized('a.txt', 10)]
    select(picked)
    await flushPromises()

    expect(submitButton()?.disabled).toBe(false)
    submitButton()?.click()
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(picked, false)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('sends the overwrite choice', async () => {
    const store = useFileManagerStore()
    const upload = vi.spyOn(store, 'upload').mockResolvedValue(true)
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    select([sized('a.txt', 10)])
    await flushPromises()

    document.querySelector<HTMLInputElement>('[data-testid="fm-upload-overwrite-option"] input')?.click()
    await flushPromises()
    submitButton()?.click()
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(expect.any(Array), true)
    wrapper.unmount()
  })

  it('refuses a picked file name with a backslash and sends nothing', async () => {
    const store = useFileManagerStore()
    const upload = vi.spyOn(store, 'upload').mockResolvedValue(true)
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    select([sized(String.raw`upl\oad.txt`, 10)])
    await flushPromises()

    expect(document.querySelector('[data-testid="fm-upload-invalid-name"]')?.textContent).toContain('message.fileManager.invalidName')
    expect(submitButton()?.disabled).toBe(true)
    expect(upload).not.toHaveBeenCalled()

    select([sized('oad.txt', 10)])
    await flushPromises()

    expect(document.querySelector('[data-testid="fm-upload-invalid-name"]')).toBeNull()
    expect(submitButton()?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('stays open after a warning (some files were not uploaded)', async () => {
    const store = useFileManagerStore()
    vi.spyOn(store, 'upload').mockResolvedValue(false)
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    select([sized('a.txt', 10)])
    await flushPromises()

    submitButton()?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(document.querySelector('[data-testid="fm-upload-row"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('a failed upload does not throw and keeps the modal open with the selection', async () => {
    const store = useFileManagerStore()
    vi.spyOn(store, 'upload').mockResolvedValue(false)
    const wrapper = await mountKit(FmUploadModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    select([sized('a.txt', 10)])
    await flushPromises()

    submitButton()?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(document.querySelector('[data-testid="fm-upload-row"]')).not.toBeNull()
    expect(submitButton()?.disabled).toBe(false)
    wrapper.unmount()
  })
})
