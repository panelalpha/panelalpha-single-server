import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { mountKit } from '@/test/mount-kit'
import FmContextMenu from './FmContextMenu.vue'

const folder: FmDirectory = { type: 'dir', path: 'docs', basename: 'docs', dirname: '', timestamp: 0 }
const notes: FmFile = { type: 'file', path: 'notes.txt', basename: 'notes.txt', dirname: '', filename: 'notes', extension: 'txt', size: 1, timestamp: 0 }

const position = { x: 10, y: 20 }

/** The menu is teleported to the overlay container of the page, so it is looked up in the document. */
function menuEl (): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="fm-context-menu"]')
}

function menuItemNames (): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(item => item.textContent?.trim() ?? '')
}

describe('FmContextMenu', () => {
  let wrappers: { unmount: () => void }[] = []

  beforeEach(() => {
    // jsdom has no elementsFromPoint, which the overlay scroll strategy calls when the menu is placed at a point.
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] })
    setActivePinia(createPinia())
    useFileManagerStore().config = { uploadMaxFilesize: 1024, unsupportedActions: [] }
  })

  afterEach(() => {
    for (const wrapper of wrappers) {
      wrapper.unmount()
    }
    wrappers = []
  })

  it('shows the items of the target and reports the chosen action (the screen closes it)', async () => {
    const store = useFileManagerStore()
    store.directories = [folder]
    store.select(folder)
    const wrapper = await mountKit(FmContextMenu, { props: { target: folder, position } })
    wrappers.push(wrapper)
    await flushPromises()

    expect(menuEl()).not.toBeNull()
    expect(menuItemNames()).toEqual([
      'button.fileManager.open',
      'button.copy',
      'button.fileManager.cut',
      'button.fileManager.rename',
      'button.fileManager.zip',
      'button.delete',
      'button.fileManager.properties',
    ])

    document.querySelector<HTMLElement>('[data-testid="fm-context-menu-open"]')?.click()
    await flushPromises()

    expect(wrapper.emitted('select')).toEqual([['open']])
  })

  it('does not open without items: the empty area with an empty clipboard', async () => {
    const wrapper = await mountKit(FmContextMenu, { props: { target: null, position } })
    wrappers.push(wrapper)
    await flushPromises()

    expect(menuEl()).toBeNull()
  })

  it('offers only paste on the empty area when the clipboard has items', async () => {
    const store = useFileManagerStore()
    store.clipboard = { type: 'copy', directories: [], files: ['notes.txt'] }
    const wrapper = await mountKit(FmContextMenu, { props: { target: null, position } })
    wrappers.push(wrapper)
    await flushPromises()

    expect(menuItemNames()).toEqual(['button.fileManager.paste'])
  })

  it('shows the file rules: view and download, no open', async () => {
    const store = useFileManagerStore()
    store.files = [notes]
    store.select(notes)
    const wrapper = await mountKit(FmContextMenu, { props: { target: notes, position } })
    wrappers.push(wrapper)
    await flushPromises()

    expect(document.querySelector('[data-testid="fm-context-menu-open"]')).toBeNull()
    expect(document.querySelector('[data-testid="fm-context-menu-download"]')).not.toBeNull()
  })

  it('is a menu of menuitems with one Tab stop per item and dividers between groups', async () => {
    const store = useFileManagerStore()
    store.directories = [folder]
    store.select(folder)
    const wrapper = await mountKit(FmContextMenu, { props: { target: folder, position } })
    wrappers.push(wrapper)
    await flushPromises()

    expect(menuEl()?.getAttribute('role')).toBe('menu')
    expect(menuEl()?.getAttribute('tabindex')).toBe('-1')
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    expect(items.length).toBeGreaterThan(1)
    expect(items.every(item => item.getAttribute('tabindex') === '0')).toBe(true)
    expect(document.querySelectorAll('[data-testid="fm-context-menu"] .v-divider').length).toBeGreaterThan(0)
  })
})
