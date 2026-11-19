import type { FmContent, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FileManager from './FileManager.vue'

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }

function folder (path: string, name: string) {
  return { type: 'dir' as const, path, basename: name, dirname: '', timestamp: 0 }
}

function file (path: string, size: number): FmFile {
  const name = path.split('/').at(-1) ?? path
  return { type: 'file', path, basename: name, dirname: '', filename: name, extension: 'txt', size, timestamp: 0 }
}

function answer (data: FmContent) {
  return { result: ok, data }
}

/** Folder listings by path: the home folder has `docs`, `docs` has `a`. */
function contentFor (path: string): FmContent {
  if (path === 'docs') {
    return { directories: [folder('docs/a', 'a')], files: [file('docs/notes.txt', 1024), file('docs/big.bin', 2048)] }
  }
  if (path === 'docs/a') {
    return { directories: [], files: [] }
  }
  return { directories: [folder('docs', 'docs')], files: [] }
}

async function mountManager (accountId = 11) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(FileManager, { props: { accountId }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, store: useFileManagerStore() }
}

describe('FileManager', () => {
  beforeEach(() => {
    // jsdom has no scrollIntoView; VTreeview calls it when the activated folder changes.
    Element.prototype.scrollIntoView = vi.fn()
    vi.mocked(fmApi.initialize).mockReset()
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
    vi.mocked(fmApi.content).mockImplementation(async (_id, path) => answer(contentFor(path)))
  })

  it('opens the account on mount: initialize, then the home folder and the root of the tree', async () => {
    const { wrapper, store } = await mountManager(11)

    expect(fmApi.initialize).toHaveBeenCalledWith(11)
    expect(fmApi.content).toHaveBeenCalledWith(11, '')
    expect(store.accountId).toBe(11)
    expect(wrapper.find('[data-testid="fm-navbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fm-tree"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fm-manager"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fm-info"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens the new account when the account changes', async () => {
    const { wrapper, store } = await mountManager(11)

    await wrapper.setProps({ accountId: 12 })
    await flushPromises()

    expect(fmApi.initialize).toHaveBeenLastCalledWith(12)
    expect(fmApi.content).toHaveBeenLastCalledWith(12, '')
    expect(store.accountId).toBe(12)
    wrapper.unmount()
  })

  it('resets the store on unmount', async () => {
    const { wrapper, store } = await mountManager(11)

    wrapper.unmount()

    expect(store.accountId).toBeNull()
    expect(store.directories).toEqual([])
  })

  it('loads the subfolders of a folder in the tree when it is opened', async () => {
    const { wrapper, store } = await mountManager(11)
    expect(fmApi.content).not.toHaveBeenCalledWith(11, 'docs')

    await store.toggleTree('docs')
    await flushPromises()

    expect(fmApi.content).toHaveBeenCalledWith(11, 'docs')
    expect(store.tree.docs?.children.map(item => item.basename)).toEqual(['a'])
    wrapper.unmount()
  })

  it('navigates from the breadcrumb and goes back and forward', async () => {
    const { wrapper, store } = await mountManager(11)
    await store.goTo('docs')
    await store.goTo('docs/a')
    await flushPromises()

    const docsCrumb = wrapper.findAll('.fm-breadcrumb__item').find(item => item.text() === 'docs')
    expect(docsCrumb).toBeDefined()

    await docsCrumb!.trigger('click')
    await flushPromises()
    expect(store.path).toBe('docs')

    await wrapper.get('[aria-label="button.back"]').trigger('click')
    await flushPromises()
    // The breadcrumb click recorded `docs` after `docs/a`, so back goes to `docs/a`.
    expect(store.path).toBe('docs/a')

    await wrapper.get('[aria-label="button.fileManager.forward"]').trigger('click')
    await flushPromises()
    expect(store.path).toBe('docs')
    wrapper.unmount()
  })

  it('shows the open folder in the breadcrumb as plain text, not a button', async () => {
    const { wrapper, store } = await mountManager(11)
    await store.goTo('docs')
    await flushPromises()

    const current = wrapper.get('.fm-breadcrumb__current')
    expect(current.text()).toBe('docs')
    expect(current.attributes('aria-current')).toBe('page')
    expect(wrapper.findAll('.fm-breadcrumb__item').some(item => item.text() === 'docs')).toBe(false)
    wrapper.unmount()
  })

  it('disables back on the first entry', async () => {
    const { wrapper } = await mountManager(11)

    expect(wrapper.get('[aria-label="button.back"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="button.fileManager.forward"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('counts folders and files and sums the size of the files in the info block', async () => {
    const { wrapper, store } = await mountManager(11)
    await store.goTo('docs')
    await flushPromises()

    const info = wrapper.get('[data-testid="fm-info"]').text()
    expect(info).toContain('1')
    expect(info).toContain('2')
    expect(info).toContain('3 KB')
    wrapper.unmount()
  })

  it('shows the tree column from md, without the folders toggle', async () => {
    const { wrapper } = await mountManager(11)

    expect(wrapper.find('[data-testid="fm-tree"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fm-tree-toggle"]').exists()).toBe(false)
    wrapper.unmount()
  })

  describe('below md (phone)', () => {
    const width = window.innerWidth
    beforeEach(() => {
      window.innerWidth = 500
    })
    afterEach(() => {
      window.innerWidth = width
    })

    it('keeps the tree in a collapsed panel that the Folders button expands', async () => {
      const { wrapper } = await mountManager(11)
      const toggle = wrapper.get('[data-testid="fm-tree-toggle"]')

      expect(toggle.text()).toContain('Folders')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.get('[data-testid="fm-tree"]').attributes('style')).toContain('display: none')

      await toggle.trigger('click')

      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(wrapper.get('[data-testid="fm-tree"]').attributes('style') ?? '').not.toContain('display: none')
      wrapper.unmount()
    })
  })
})
