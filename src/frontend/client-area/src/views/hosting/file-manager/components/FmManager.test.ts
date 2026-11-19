import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { clearThumbnailCache } from '@/views/hosting/file-manager/fm-thumbnail-cache'
import { mountKit } from '@/test/mount-kit'
import FmManager from './FmManager.vue'

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  preview: vi.fn(),
  thumbnail: vi.fn(),
  downloadBlob: vi.fn(),
  downloadUrl: vi.fn((id: number, path: string) => `/file-manager/download/${id}?path=${path}`),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }

function folder (path: string): FmDirectory {
  return { type: 'dir', path, basename: path.split('/').at(-1) ?? path, dirname: '', timestamp: 0 }
}

function file (path: string, extension: string, size = 10): FmFile {
  const name = path.split('/').at(-1) ?? path
  return { type: 'file', path, basename: name, dirname: '', filename: name, extension, size, timestamp: 0 }
}

function setup () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFileManagerStore()
  store.accountId = 7
  store.path = 'docs'
  store.directories = [folder('docs/a')]
  store.files = [file('docs/photo.png', 'png'), file('docs/notes.txt', 'txt'), file('docs/manual.pdf', 'pdf', 2048)]
  return { pinia, store }
}

async function mountList (pinia: ReturnType<typeof createPinia>) {
  const wrapper = await mountKit(FmManager, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

// Rows of the table: folder `a` first, then the files by name: manual.pdf, notes.txt, photo.png.
function rows (wrapper: { findAll: (selector: string) => { attributes: (name: string) => string | undefined }[] }) {
  return wrapper.findAll('tbody tr')
}

describe('FmManager', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    // jsdom has no elementsFromPoint, which the overlay scroll strategy of the context menu calls.
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] })
    clearThumbnailCache()
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.preview).mockReset()
    vi.mocked(fmApi.thumbnail).mockReset()
    vi.mocked(fmApi.content).mockResolvedValue({ result: ok, data: { directories: [], files: [] } })
  })

  it('shows the empty folder state (table and grid) only for a folder without items and without a term', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)
    expect(wrapper.find('[data-testid="fm-empty"]').exists()).toBe(false)

    store.directories = []
    store.files = []
    await flushPromises()
    expect(wrapper.get('[data-testid="fm-empty"]').text()).toContain('This folder is empty')
    expect(wrapper.find('[data-testid="fm-no-results"]').exists()).toBe(false)

    store.view = 'grid'
    await flushPromises()
    expect(wrapper.find('[data-testid="fm-empty"]').exists()).toBe(true)

    store.setSearchTerm('zzz')
    await flushPromises()
    expect(wrapper.find('[data-testid="fm-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fm-no-results"]').exists()).toBe(true)
  })

  it('shows the no-results state for a term that matches nothing, and Clear filters brings the list back', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)
    expect(wrapper.find('[data-testid="fm-no-results"]').exists()).toBe(false)

    store.setSearchTerm('zzz')
    await flushPromises()
    expect(wrapper.find('[data-testid="fm-no-results"]').exists()).toBe(true)
    expect(wrapper.find('tbody tr').exists()).toBe(false)

    await wrapper.get('[data-testid="fm-no-results"] button').trigger('click')
    await flushPromises()
    expect(store.searchTerm).toBe('')
    expect(wrapper.find('[data-testid="fm-no-results"]').exists()).toBe(false)
    expect(rows(wrapper)).toHaveLength(4)
  })

  it('selects one item on a click and adds to the selection with Ctrl or Cmd', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)
    const [manual, notes] = [rows(wrapper)[1]!, rows(wrapper)[2]!]

    await notes.trigger('click')
    expect(store.selection).toEqual({ directories: [], files: ['docs/notes.txt'] })

    await manual.trigger('click', { ctrlKey: true })
    expect(store.selection.files).toEqual(['docs/notes.txt', 'docs/manual.pdf'])

    await manual.trigger('click', { metaKey: true })
    expect(store.selection.files).toEqual(['docs/notes.txt'])

    await notes.trigger('click')
    expect(store.selection.files).toEqual(['docs/notes.txt'])
    wrapper.unmount()
  })

  it('opens a folder on double click', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)

    await rows(wrapper)[0]!.trigger('dblclick')
    await flushPromises()

    expect(fmApi.content).toHaveBeenCalledWith(7, 'docs/a')
    expect(store.path).toBe('docs/a')
    wrapper.unmount()
  })

  it('shows the preview of an image on double click', async () => {
    const { pinia } = setup()
    vi.mocked(fmApi.preview).mockResolvedValue({ result: ok, data: { image: 'data:image/png;base64,AA' } })
    const wrapper = await mountList(pinia)

    await rows(wrapper)[3]!.trigger('dblclick')
    await flushPromises()

    expect(fmApi.preview).toHaveBeenCalledWith(7, 'docs/photo.png')
    expect(wrapper.findComponent({ name: 'FmPreviewModal' }).props('file')).toMatchObject({ basename: 'photo.png' })
    wrapper.unmount()
  })

  it('opens a PDF in a new window on double click', async () => {
    const { pinia } = setup()
    vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window)
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
    vi.mocked(fmApi.downloadBlob).mockResolvedValue(new Blob(['%PDF']))
    const wrapper = await mountList(pinia)

    await rows(wrapper)[1]!.trigger('dblclick')
    await flushPromises()

    expect(window.open).toHaveBeenCalled()
    expect(fmApi.downloadBlob).toHaveBeenCalledWith(7, 'docs/manual.pdf')
    expect(wrapper.findComponent({ name: 'FmPreviewModal' }).props('file')).toBeNull()
    vi.restoreAllMocks()
    wrapper.unmount()
  })

  it('opens the editor on double click of a text file (the click before it selects the file)', async () => {
    const { pinia, store } = setup()
    vi.spyOn(window, 'open')
    const wrapper = await mountList(pinia)

    await rows(wrapper)[2]!.trigger('click')
    await rows(wrapper)[2]!.trigger('dblclick')
    await flushPromises()

    expect(store.selectedItems).toEqual([expect.objectContaining({ basename: 'notes.txt' })])
    expect(store.activeModal).toBe('editor')
    expect(fmApi.preview).not.toHaveBeenCalled()
    expect(fmApi.downloadBlob).not.toHaveBeenCalled()
    expect(fmApi.content).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'FmPreviewModal' }).props('file')).toBeNull()
    vi.restoreAllMocks()
    wrapper.unmount()
  })

  it('the menu action edit opens the editor for the selected text file', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)

    await rows(wrapper)[2]!.trigger('contextmenu', { clientX: 1, clientY: 1 })
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-edit"]')?.click()
    await flushPromises()

    expect(store.activeModal).toBe('editor')
    expect(store.selectedItems).toEqual([expect.objectContaining({ basename: 'notes.txt' })])
    wrapper.unmount()
  })

  it('loads thumbnails only for images in the grid view', async () => {
    const { pinia, store } = setup()
    vi.mocked(fmApi.thumbnail).mockResolvedValue({ result: ok, data: { image: 'data:image/png;base64,TT' } })
    store.setView('grid')
    const wrapper = await mountList(pinia)

    expect(fmApi.thumbnail).toHaveBeenCalledTimes(1)
    expect(fmApi.thumbnail).toHaveBeenCalledWith(7, 'docs/photo.png')
    expect(wrapper.find('.fm-thumbnail__image').attributes('src')).toBe('data:image/png;base64,TT')
    wrapper.unmount()
  })

  it('does not load thumbnails in the table view', async () => {
    const { pinia } = setup()
    const wrapper = await mountList(pinia)

    expect(fmApi.thumbnail).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('a right click on an item that is not selected selects it alone and opens the menu at the pointer', async () => {
    const { pinia, store } = setup()
    store.select({ type: 'file', path: 'docs/notes.txt' })
    const wrapper = await mountList(pinia)

    await rows(wrapper)[3]!.trigger('contextmenu', { clientX: 30, clientY: 40 })
    await flushPromises()

    expect(store.selection).toEqual({ directories: [], files: ['docs/photo.png'] })
    const menu = wrapper.findComponent({ name: 'FmContextMenu' })
    expect(menu.props('target')).toMatchObject({ path: 'docs/photo.png' })
    expect(menu.props('position')).toEqual({ x: 30, y: 40 })
    wrapper.unmount()
  })

  it('the menu action copy puts the selection into the clipboard', async () => {
    const { pinia, store } = setup()
    const wrapper = await mountList(pinia)

    await rows(wrapper)[3]!.trigger('contextmenu', { clientX: 1, clientY: 1 })
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-copy"]')?.click()
    await flushPromises()

    expect(store.clipboard).toEqual({ type: 'copy', directories: [], files: ['docs/photo.png'] })
    expect(wrapper.findComponent({ name: 'FmContextMenu' }).props('position')).toBeNull()
    wrapper.unmount()
  })

  it('the menu action download opens the file in a new tab without an opener', async () => {
    const { pinia } = setup()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = await mountList(pinia)

    await rows(wrapper)[2]!.trigger('contextmenu', { clientX: 1, clientY: 1 })
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-download"]')?.click()
    await flushPromises()

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('/file-manager/download/7'), '_blank', 'noopener')
    vi.restoreAllMocks()
    wrapper.unmount()
  })

  it('the menu action properties opens the properties of the selected item', async () => {
    const { pinia } = setup()
    const wrapper = await mountList(pinia)

    await rows(wrapper)[2]!.trigger('contextmenu', { clientX: 1, clientY: 1 })
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-properties"]')?.click()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'FmPropertiesModal' }).props('item')).toMatchObject({ basename: 'notes.txt' })
    wrapper.unmount()
  })

  it('the menu actions rename, zip, unzip and delete open their modal (none is a no-op)', async () => {
    // Rows: folder a, then the files by name: backup.zip, manual.pdf, notes.txt, photo.png.
    const cases: [number, string, string][] = [
      [3, 'rename', 'fm-context-menu-rename'],
      [3, 'zip', 'fm-context-menu-zip'],
      [1, 'unzip', 'fm-context-menu-unzip'],
      [3, 'delete', 'fm-context-menu-delete'],
    ]
    for (const [row, modal, testId] of cases) {
      const { pinia, store } = setup()
      store.files = [...store.files, file('docs/backup.zip', 'zip')]
      const wrapper = await mountList(pinia)

      await rows(wrapper)[row]!.trigger('contextmenu', { clientX: 1, clientY: 1 })
      await flushPromises()
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.dataset.testid === testId)?.click()
      await flushPromises()

      expect(store.activeModal).toBe(modal)
      wrapper.unmount()
    }
  })

  it('opens the audio player on double click of an audio file, with that file as the selection', async () => {
    const { pinia, store } = setup()
    store.files = [...store.files, file('docs/song.mp3', 'mp3')]
    const wrapper = await mountList(pinia)
    const song = wrapper.findAll('tbody tr').find(row => row.text().includes('song.mp3'))!

    await song.trigger('click')
    await song.trigger('dblclick')
    await flushPromises()

    expect(store.activeModal).toBe('audioPlayer')
    expect(store.selectedItems).toEqual([expect.objectContaining({ basename: 'song.mp3' })])
    expect(fmApi.preview).not.toHaveBeenCalled()
    expect(fmApi.downloadBlob).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('opens the video player on double click of a video file', async () => {
    const { pinia, store } = setup()
    store.files = [...store.files, file('docs/clip.mp4', 'mp4')]
    const wrapper = await mountList(pinia)
    const clip = wrapper.findAll('tbody tr').find(row => row.text().includes('clip.mp4'))!

    await clip.trigger('dblclick')
    await flushPromises()

    expect(store.activeModal).toBe('videoPlayer')
    wrapper.unmount()
  })

  it('the menu action Play opens the audio player for the selected audio files, in the order of the selection', async () => {
    const { pinia, store } = setup()
    store.files = [...store.files, file('docs/song.mp3', 'mp3'), file('docs/track.ogg', 'ogg')]
    const wrapper = await mountList(pinia)
    const rowOf = (name: string) => wrapper.findAll('tbody tr').find(row => row.text().includes(name))!

    await rowOf('song.mp3').trigger('click')
    await rowOf('track.ogg').trigger('click', { ctrlKey: true })
    await rowOf('song.mp3').trigger('contextmenu', { clientX: 1, clientY: 1 })
    await flushPromises()
    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-audioPlay"]')?.click()
    await flushPromises()

    expect(store.activeModal).toBe('audioPlayer')
    expect(store.selectedItems.map(item => item.basename)).toEqual(['song.mp3', 'track.ogg'])
    wrapper.unmount()
  })
})
