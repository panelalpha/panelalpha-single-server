import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmNewFileModal from './FmNewFileModal.vue'

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

function input (): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('[data-testid="fm-new-file-name"] input')
  if (!element) {
    throw new Error('name input not found')
  }
  return element
}

function typeName (value: string): void {
  input().value = value
  input().dispatchEvent(new Event('input'))
}

/** The footer button whose label is the given key (the labels are the keys in tests, see mount-kit). */
function footerButton (key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

function submitButton (): HTMLButtonElement | undefined {
  return footerButton('button.submit') as HTMLButtonElement | undefined
}

describe('FmNewFileModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('focuses the name field on open', async () => {
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    expect(document.activeElement).toBe(input())
    wrapper.unmount()
  })

  it('keeps the autofocus attribute on the field', async () => {
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()

    expect(input().hasAttribute('autofocus') || input().autofocus).toBe(true)
    wrapper.unmount()
  })

  it('keeps Submit disabled for an empty name and shows no feedback', async () => {
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(submitButton()?.disabled).toBe(true)
    expect(document.body.textContent).not.toContain('message.fileManager.newFile.fieldFeedback')
    wrapper.unmount()
  })

  it('rejects a name that already exists in the open folder (basename match, files only)', async () => {
    const store = useFileManagerStore()
    store.files = [file('report.txt')]
    store.directories = []
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()

    typeName('report.txt')
    await flushPromises()

    expect(submitButton()?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.newFile.fieldFeedback')

    typeName('new.txt')
    await flushPromises()

    expect(submitButton()?.disabled).toBe(false)
    expect(document.body.textContent).not.toContain('message.fileManager.newFile.fieldFeedback')
    wrapper.unmount()
  })

  it('refuses a name with a backslash in the field and sends nothing', async () => {
    const store = useFileManagerStore()
    const createFile = vi.spyOn(store, 'createFile').mockResolvedValue(true)
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()

    typeName(String.raw`sub\victim.txt`)
    await flushPromises()

    expect(submitButton()?.disabled).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.invalidName')

    typeName('victim.txt')
    await flushPromises()

    expect(submitButton()?.disabled).toBe(false)
    expect(document.body.textContent).not.toContain('message.fileManager.invalidName')
    expect(createFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('creates the file once on a double click and closes after success', async () => {
    const store = useFileManagerStore()
    let finish: (value: boolean) => void = () => {}
    const createFile = vi.spyOn(store, 'createFile').mockImplementation(() => new Promise<boolean>(resolve => {
      finish = resolve
    }))
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()
    typeName('new.txt')
    await flushPromises()

    submitButton()?.click()
    submitButton()?.click()
    await flushPromises()

    expect(createFile).toHaveBeenCalledTimes(1)
    expect(createFile).toHaveBeenCalledWith('new.txt')

    finish(true)
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('stays open when the creation fails', async () => {
    const store = useFileManagerStore()
    vi.spyOn(store, 'createFile').mockResolvedValue(false)
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()
    typeName('new.txt')
    await flushPromises()

    submitButton()?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(input().value).toBe('new.txt')
    wrapper.unmount()
  })

  it('emits close with the Cancel button', async () => {
    const wrapper = await mountKit(FmNewFileModal, { global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.cancel')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
