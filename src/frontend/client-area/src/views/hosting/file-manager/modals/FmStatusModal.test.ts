import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmStatusModal from './FmStatusModal.vue'

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

describe('FmStatusModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('lists the errors of the session', async () => {
    const store = useFileManagerStore()
    store.errors = ['Cannot delete', 'Error creating archive!']
    const wrapper = await mountKit(FmStatusModal, { global: { plugins: [pinia] } })
    await flushPromises()

    const items = Array.from(document.querySelectorAll('[data-testid="fm-status-list"] li')).map(item => item.textContent?.trim())
    expect(items).toEqual(['Cannot delete', 'Error creating archive!'])
    expect(footerButton('button.fileManager.clear')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-errors notice and disables Clear when the list is empty', async () => {
    const wrapper = await mountKit(FmStatusModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(document.body.textContent).toContain('message.fileManager.status.noErrors')
    expect(footerButton('button.fileManager.clear')?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('clears the errors of the store with the Clear button', async () => {
    const store = useFileManagerStore()
    store.errors = ['Cannot delete']
    const wrapper = await mountKit(FmStatusModal, { global: { plugins: [pinia] } })
    await flushPromises()

    footerButton('button.fileManager.clear')?.click()
    await flushPromises()

    expect(store.errors).toEqual([])
    expect(document.body.textContent).toContain('message.fileManager.status.noErrors')
    wrapper.unmount()
  })
})
