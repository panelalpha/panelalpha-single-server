import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmClipboardModal from './FmClipboardModal.vue'

function rows (): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="fm-clipboard-row"]'))
}

/** The footer button whose label is the given key (the labels are the keys in tests, see mount-kit). */
function footerButton (key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmClipboardModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('lists the items of the clipboard and removes one of them', async () => {
    const store = useFileManagerStore()
    store.clipboard = { type: 'cut', directories: ['docs'], files: ['a.png'] }
    const wrapper = await mountKit(FmClipboardModal, { props: { open: true }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(rows()).toHaveLength(2)

    document.querySelector<HTMLElement>('[data-testid="fm-clipboard-remove"]')?.click()
    await flushPromises()

    expect(store.clipboard).toEqual({ type: 'cut', directories: [], files: ['a.png'] })
    wrapper.unmount()
  })

  it('clears the whole clipboard with the Clear button', async () => {
    const store = useFileManagerStore()
    store.clipboard = { type: 'copy', directories: [], files: ['a.png'] }
    const wrapper = await mountKit(FmClipboardModal, { props: { open: true }, global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.fileManager.clear')?.click()
    await flushPromises()

    expect(store.clipboard).toBeNull()
    expect(document.querySelector('[data-testid="fm-clipboard-type"]')).toBeNull()
    wrapper.unmount()
  })

  it('emits close with the Cancel button', async () => {
    const wrapper = await mountKit(FmClipboardModal, { props: { open: true }, global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.cancel')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
