import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmUnzipModal from './FmUnzipModal.vue'

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  unzip: vi.fn(),
}))

function folder (name: string): FmDirectory {
  return { type: 'dir', path: name, basename: name, dirname: '', timestamp: 0 }
}

function archive (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'zip', size: 1, timestamp: 0 }
}

function folderInput (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-unzip-folder"] input')
  if (!element) {
    throw new Error('folder input not found')
  }
  return element
}

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmUnzipModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('extracts to the current folder by default, without a folder name (legacy warning shown)', async () => {
    const store = useFileManagerStore()
    store.select(archive('a.zip'))
    const unzipSelected = vi.spyOn(store, 'unzipSelected').mockResolvedValue(true)
    const wrapper = await mountKit(FmUnzipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(document.body.textContent).toContain('message.fileManager.unzip.warning')
    expect(footerButton('button.submit')?.disabled).toBe(false)

    footerButton('button.submit')?.click()
    await flushPromises()

    expect(unzipSelected).toHaveBeenCalledWith(null)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('extracts into a new folder with the typed name', async () => {
    const store = useFileManagerStore()
    store.select(archive('a.zip'))
    const unzipSelected = vi.spyOn(store, 'unzipSelected').mockResolvedValue(true)
    const wrapper = await mountKit(FmUnzipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    document.querySelector<HTMLInputElement>('[data-testid="fm-unzip-new-folder"] input')?.click()
    await flushPromises()
    expect(footerButton('button.submit')?.disabled).toBe(true)

    folderInput().value = 'extracted'
    folderInput().dispatchEvent(new Event('input'))
    await flushPromises()
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(unzipSelected).toHaveBeenCalledWith('extracted')
    wrapper.unmount()
  })

  it('shows the Engine refusal in the dialog after a failed extraction, so the target can be changed there', async () => {
    const store = useFileManagerStore()
    store.accountId = 11
    store.files = [archive('version2.zip')]
    store.select(archive('version2.zip'))
    vi.mocked(fmApi.unzip).mockReset()
    vi.mocked(fmApi.unzip).mockResolvedValue({
      result: {
        status: 'error',
        messageKey: null,
        message: 'public_html already holds 1 of the entries the archive unpacks to (version2.php). Nothing was extracted: extract into a folder that does not hold them.',
      },
      data: null,
    })
    const wrapper = await mountKit(FmUnzipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.submit')?.click()
    await flushPromises()

    const refusal = document.querySelector('[data-testid="fm-unzip-refusal"]')
    expect(refusal?.textContent).toContain('already holds 1 of the entries')
    expect(document.body.textContent).toContain('Nothing was extracted')
    expect(store.actionError).toContain('already holds 1 of the entries')
    expect(wrapper.emitted('close')).toBeUndefined()

    document.querySelector<HTMLInputElement>('[data-testid="fm-unzip-new-folder"] input')?.click()
    await flushPromises()
    expect(document.querySelector('[data-testid="fm-unzip-refusal"]')).toBeNull()
    wrapper.unmount()
  })

  it('rejects the name of an existing folder in the new-folder mode (legacy directoryExist)', async () => {
    const store = useFileManagerStore()
    store.directories = [folder('docs')]
    store.select(archive('a.zip'))
    const wrapper = await mountKit(FmUnzipModal, { global: { plugins: [pinia] } })
    await flushPromises()

    document.querySelector<HTMLInputElement>('[data-testid="fm-unzip-new-folder"] input')?.click()
    await flushPromises()
    folderInput().value = 'docs'
    folderInput().dispatchEvent(new Event('input'))
    await flushPromises()

    expect(footerButton('button.submit')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.unzip.fieldFeedback')
    wrapper.unmount()
  })
})
