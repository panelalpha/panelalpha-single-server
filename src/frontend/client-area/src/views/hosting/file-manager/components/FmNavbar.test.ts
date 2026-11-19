import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmNavbar from './FmNavbar.vue'

function file (name: string): FmFile {
  return { type: 'file', path: name, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

/** The navbar is mounted detached, so its buttons are looked up in the wrapper, not in the document. */
function button (wrapper: VueWrapper, label: string) {
  return wrapper.find(`button[aria-label="${label}"]`)
}

describe('FmNavbar', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('opens the creation modals from the navbar, one at a time', async () => {
    const store = useFileManagerStore()
    const wrapper = await mountKit(FmNavbar, { global: { plugins: [pinia] } })
    await flushPromises()

    await button(wrapper, 'button.fileManager.newFile').trigger('click')
    expect(store.activeModal).toBe('newFile')
    store.closeModal()

    await button(wrapper, 'button.fileManager.newFolder').trigger('click')
    expect(store.activeModal).toBe('newFolder')
    store.closeModal()

    await button(wrapper, 'button.fileManager.upload').trigger('click')
    expect(store.activeModal).toBe('upload')
    wrapper.unmount()
  })

  it('keeps Delete disabled without a selection and opens the delete modal with one', async () => {
    const store = useFileManagerStore()
    store.files = [file('a.txt')]
    const wrapper = await mountKit(FmNavbar, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(button(wrapper, 'button.delete').attributes('disabled')).toBeDefined()

    store.select(file('a.txt'))
    await flushPromises()
    expect(button(wrapper, 'button.delete').attributes('disabled')).toBeUndefined()

    await button(wrapper, 'button.delete').trigger('click')
    expect(store.activeModal).toBe('delete')
    wrapper.unmount()
  })

  it('disables Up in the root and goes to the parent folder with it, like opening a folder', async () => {
    const store = useFileManagerStore()
    store.accountId = 7
    const wrapper = await mountKit(FmNavbar, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(button(wrapper, 'Up').attributes('disabled')).toBeDefined()

    store.path = 'docs/a'
    const goTo = vi.spyOn(store, 'goTo').mockResolvedValue(undefined)
    await flushPromises()
    expect(button(wrapper, 'Up').attributes('disabled')).toBeUndefined()

    await button(wrapper, 'Up').trigger('click')
    expect(goTo).toHaveBeenCalledWith('docs')
    wrapper.unmount()
  })

  it('filters the folder from the search field after the debounce', async () => {
    vi.useFakeTimers()
    const store = useFileManagerStore()
    store.files = [file('a.txt'), file('b.txt')]
    const wrapper = await mountKit(FmNavbar, { global: { plugins: [pinia] } })
    const input = wrapper.get('[data-testid="fm-search"] input')
    expect(input.attributes('aria-label')).toBe('form.placeholder.search')

    await input.setValue('a')
    expect(store.searchTerm).toBe('')
    vi.advanceTimersByTime(300)
    expect(store.searchTerm).toBe('a')
    expect(store.visibleFiles.map(item => item.basename)).toEqual(['a.txt'])
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('drops a term typed just before the folder changes', async () => {
    vi.useFakeTimers()
    const store = useFileManagerStore()
    const wrapper = await mountKit(FmNavbar, { global: { plugins: [pinia] } })
    const input = wrapper.get('[data-testid="fm-search"] input')

    await input.setValue('x')
    store.path = 'docs'
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(500)
    expect(store.searchTerm).toBe('')
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
    vi.useRealTimers()
  })
})
