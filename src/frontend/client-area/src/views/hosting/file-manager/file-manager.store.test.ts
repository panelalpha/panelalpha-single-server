import type { FmContent, FmFile } from './file-manager.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as fmApi from './file-manager.api'
import { useFileManagerStore } from './file-manager.store'

vi.mock('./file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  paste: vi.fn(),
  createFile: vi.fn(),
  createDirectory: vi.fn(),
  upload: vi.fn(),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }

function folder (path: string, name: string) {
  return { type: 'dir' as const, path, basename: name, dirname: '', timestamp: 0 }
}

function listing (names: string[]): FmContent {
  return { directories: names.map(name => folder(name, name)), files: [] }
}

function answer (data: FmContent) {
  return { result: ok, data }
}

describe('file-manager.store creation and upload', () => {
  const failure = (message: string) => ({ status: 'error' as const, messageKey: null, message })
  const warning = { status: 'warning' as const, messageKey: 'message.fileManager.notAllUploaded', message: null }
  const created = { status: 'success' as const, messageKey: 'message.fileManager.fileCreated', message: null }

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.createFile).mockReset()
    vi.mocked(fmApi.createDirectory).mockReset()
    vi.mocked(fmApi.upload).mockReset()
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs'])))
    await useFileManagerStore().open(11)
  })

  it('creates a file in the open folder, alerts, and refreshes the folder', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.createFile).mockResolvedValue({ result: created, data: { file: { type: 'file', path: 'new.txt', basename: 'new.txt', dirname: '', filename: 'new.txt', extension: 'txt', size: 0, timestamp: 0 } } })
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs', 'new.txt'])))
    vi.mocked(fmApi.content).mockClear()

    const done = await store.createFile('new.txt')

    expect(done).toBe(true)
    expect(fmApi.createFile).toHaveBeenCalledWith(11, '', 'new.txt')
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: true })
    // One request serves the folder and the open tree branch (the root, loaded by open).
    expect(fmApi.content).toHaveBeenCalledTimes(1)
    expect(store.directories.map(item => item.basename)).toEqual(['docs', 'new.txt'])
  })

  it('creates a folder in the open folder and lists it', async () => {
    const store = useFileManagerStore()
    await store.goTo('docs')
    vi.mocked(fmApi.createDirectory).mockResolvedValue({ result: ok, data: { directory: folder('docs/sub', 'sub') } })
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['sub'])))
    vi.mocked(fmApi.content).mockClear()

    const done = await store.createDirectory('sub')

    expect(done).toBe(true)
    expect(fmApi.createDirectory).toHaveBeenCalledWith(11, 'docs', 'sub')
    expect(fmApi.content).toHaveBeenCalledWith(11, 'docs')
    expect(store.directories.map(item => item.basename)).toEqual(['sub'])
  })

  it('refreshes the tree branch of the open folder after a folder is created', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.createDirectory).mockResolvedValue({ result: ok, data: { directory: folder('sub', 'sub') } })
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs', 'sub'])))
    vi.mocked(fmApi.content).mockClear()

    await store.createDirectory('sub')

    expect(store.path).toBe('')
    expect(store.tree[''].children.map(item => item.basename)).toEqual(['docs', 'sub'])
  })

  it('a failed creation alerts, returns false and does not refresh', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.createFile).mockResolvedValue({ result: failure('Name is taken.'), data: null })
    vi.mocked(fmApi.content).mockClear()

    const done = await store.createFile('docs')

    expect(done).toBe(false)
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Name is taken.' })
    expect(fmApi.content).not.toHaveBeenCalled()
  })

  it('uploads: success returns true and refreshes the folder', async () => {
    const store = useFileManagerStore()
    const picked = new File(['x'], 'x.txt')
    vi.mocked(fmApi.upload).mockResolvedValue({ result: { status: 'success', messageKey: 'message.fileManager.uploaded', message: null }, data: null })
    vi.mocked(fmApi.content).mockClear()

    const done = await store.upload([picked], true)

    expect(done).toBe(true)
    expect(fmApi.upload).toHaveBeenCalledWith(11, '', [picked], true)
    expect(fmApi.content).toHaveBeenCalledTimes(1)
  })

  it('upload warning alerts and refreshes, but returns false so the modal stays open', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.upload).mockResolvedValue({ result: warning, data: null })
    vi.mocked(fmApi.content).mockClear()

    const done = await store.upload([new File(['x'], 'x.txt')], false)

    expect(done).toBe(false)
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false })
    expect(fmApi.content).toHaveBeenCalledTimes(1)
  })

  it('a failed upload alerts, returns false, does not refresh and never throws', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.upload).mockResolvedValue({ result: failure('Upload failed.'), data: null })
    vi.mocked(fmApi.content).mockClear()

    await expect(store.upload([new File(['x'], 'x.txt')], false)).resolves.toBe(false)

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Upload failed.' })
    expect(fmApi.content).not.toHaveBeenCalled()
  })
})

describe('file-manager.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.initialize).mockReset()
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
  })

  it('opens an account: initialize, home folder and tree root', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs'])))
    const store = useFileManagerStore()

    await store.open(11)

    expect(fmApi.initialize).toHaveBeenCalledWith(11)
    expect(store.config).toEqual({ uploadMaxFilesize: 1024, unsupportedActions: [] })
    expect(store.path).toBe('')
    expect(store.directories.map(item => item.basename)).toEqual(['docs'])
    expect(store.tree['']).toMatchObject({ expanded: true, loaded: true })
  })

  it('fetches a folder again on every navigation (no cache)', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs'])))
    const store = useFileManagerStore()
    await store.open(11)

    await store.goTo('docs')
    await store.goTo('')
    await store.goTo('docs')

    const calls = vi.mocked(fmApi.content).mock.calls.filter(([, path]) => path === 'docs')
    expect(calls).toHaveLength(2)
  })

  it('keeps the history: back and forward move the pointer, a new folder drops the forward entries', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    await store.goTo('a')
    await store.goTo('a/b')

    await store.back()
    expect(store.path).toBe('a')
    expect(store.historyPointer).toBe(1)

    await store.back()
    expect(store.path).toBe('')

    await store.forward()
    await store.forward()
    expect(store.path).toBe('a/b')

    await store.back()
    await store.goTo('c')
    expect(store.history).toEqual(['', 'a', 'c'])
    expect(store.historyPointer).toBe(2)
  })

  it('does not change the folder when a navigation fails', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    vi.mocked(fmApi.content).mockResolvedValueOnce({
      result: { status: 'error', messageKey: null, message: 'Cannot get directory content.' },
      data: null,
    })

    await store.goTo('broken')

    expect(store.path).toBe('')
    expect(store.errors).toEqual(['Cannot get directory content.'])
  })

  it('refresh reloads the current folder and clears the selection', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['old'])))
    const store = useFileManagerStore()
    await store.open(11)
    store.select({ type: 'dir', path: 'old' })
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['old', 'new'])))

    await store.refresh()

    expect(store.directories.map(item => item.basename)).toEqual(['old', 'new'])
    expect(store.selection).toEqual({ directories: [], files: [] })
  })

  it('alerts when a folder or the account cannot be loaded', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    const alerts = useAlertsStore()
    const before = alerts.activeAlerts.length
    vi.mocked(fmApi.content).mockResolvedValueOnce({
      result: { status: 'error', messageKey: null, message: 'Cannot get directory content.' },
      data: null,
    })

    await store.goTo('broken')

    expect(alerts.activeAlerts).toHaveLength(before + 1)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Cannot get directory content.' })
  })

  it('applies only the latest of two quick navigations, whatever the order of the responses', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    let resolveFirst: (value: unknown) => void = () => {}
    vi.mocked(fmApi.content).mockReturnValueOnce(new Promise(resolve => {
      resolveFirst = resolve
    }) as never)
    vi.mocked(fmApi.content).mockResolvedValueOnce(answer(listing(['second'])))

    const first = store.goTo('a')
    const second = store.goTo('b')
    await second
    resolveFirst(answer(listing(['first'])))
    await first

    expect(store.path).toBe('b')
    expect(store.directories.map(item => item.basename)).toEqual(['second'])
    expect(store.history).toEqual(['', 'b'])
    expect(store.historyPointer).toBe(1)
  })

  it('drops the response of a refresh when a navigation started after it', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    let resolveRefresh: (value: unknown) => void = () => {}
    vi.mocked(fmApi.content).mockReturnValueOnce(new Promise(resolve => {
      resolveRefresh = resolve
    }) as never)
    vi.mocked(fmApi.content).mockResolvedValueOnce(answer(listing(['target'])))

    const refreshing = store.refresh()
    await store.goTo('a')
    resolveRefresh(answer(listing(['stale'])))
    await refreshing

    expect(store.path).toBe('a')
    expect(store.directories.map(item => item.basename)).toEqual(['target'])
  })

  it('sets the history pointer from the entry that was requested', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing([])))
    const store = useFileManagerStore()
    await store.open(11)
    await store.goTo('a')
    await store.goTo('a/b')

    await Promise.all([store.back(), store.back()])

    expect(store.path).toBe('a')
    expect(store.historyPointer).toBe(1)
  })

  it('reset empties the state and drops a response that is still on the way', async () => {
    let resolveSlow: (value: unknown) => void = () => {}
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['first'])))
    const store = useFileManagerStore()
    await store.open(11)

    const slow = new Promise(resolve => {
      resolveSlow = resolve
    })
    vi.mocked(fmApi.content).mockReturnValueOnce(slow as never)
    const pending = store.goTo('slow')
    store.reset()
    resolveSlow(answer(listing(['late'])))
    await pending

    expect(store.accountId).toBeNull()
    expect(store.directories).toEqual([])
    expect(store.path).toBe('')
    expect(store.tree).toEqual({})
  })

  it('opening another account starts from an empty state', async () => {
    vi.mocked(fmApi.content).mockImplementation(async (id: number) => answer(listing([`account-${id}`])))
    const store = useFileManagerStore()
    await store.open(11)
    store.toggleHidden()
    await store.open(12)

    expect(store.accountId).toBe(12)
    expect(store.directories.map(item => item.basename)).toEqual(['account-12'])
    expect(store.showHidden).toBe(true)
    expect(store.history).toEqual([''])
  })

  it('hides dot-files when showHidden is off, and shows them by default', async () => {
    vi.mocked(fmApi.content).mockResolvedValue({
      result: ok,
      data: { directories: [folder('.git', '.git'), folder('src', 'src')], files: [] },
    })
    const store = useFileManagerStore()
    await store.open(11)
    expect(store.visibleDirectories.map(item => item.basename)).toEqual(['.git', 'src'])

    store.toggleHidden()
    expect(store.visibleDirectories.map(item => item.basename)).toEqual(['src'])
  })

  it('filters the folder by name without case, together with the hidden-file filter', async () => {
    vi.mocked(fmApi.content).mockResolvedValue({
      result: ok,
      data: { directories: [folder('Photos', 'Photos'), folder('.cache', '.cache')], files: [fileEntry('photo.PNG'), fileEntry('notes.txt')] },
    })
    const store = useFileManagerStore()
    await store.open(11)

    store.setSearchTerm('PHOTO')
    expect(store.visibleDirectories.map(item => item.basename)).toEqual(['Photos'])
    expect(store.visibleFiles.map(item => item.basename)).toEqual(['photo.PNG'])

    store.setSearchTerm('c')
    store.toggleHidden()
    expect(store.visibleDirectories).toEqual([])
    expect(store.visibleFiles.map(item => item.basename)).toEqual([])
  })

  it('clears the selection when the term changes and the term when the folder changes', async () => {
    vi.mocked(fmApi.content).mockResolvedValue({ result: ok, data: { directories: [folder('docs', 'docs')], files: [fileEntry('a.txt')] } })
    const store = useFileManagerStore()
    await store.open(11)
    store.select(fileEntry('a.txt'))
    expect(store.selection.files).toEqual(['a.txt'])

    store.setSearchTerm('a')
    expect(store.selection.files).toEqual([])

    await store.refresh()
    expect(store.searchTerm).toBe('a')

    await store.goTo('docs')
    expect(store.searchTerm).toBe('')
  })

  it('selects like legacy: a plain click replaces the selection, Ctrl toggles, a click on a selected item keeps it', () => {
    const store = useFileManagerStore()
    store.select({ type: 'file', path: 'a.txt' })
    store.select({ type: 'file', path: 'b.txt' }, true)
    expect(store.selection.files).toEqual(['a.txt', 'b.txt'])

    store.select({ type: 'file', path: 'a.txt' })
    expect(store.selection.files).toEqual(['a.txt', 'b.txt'])

    store.select({ type: 'dir', path: 'docs' })
    expect(store.selection).toEqual({ directories: ['docs'], files: [] })

    store.select({ type: 'dir', path: 'docs' }, true)
    expect(store.selection).toEqual({ directories: [], files: [] })
  })

  it('copies the selection to the clipboard, and an empty selection leaves it unchanged', () => {
    const store = useFileManagerStore()
    store.setClipboard('copy')
    expect(store.clipboard).toBeNull()

    store.select({ type: 'file', path: 'a.txt' })
    store.setClipboard('cut')
    expect(store.clipboard).toEqual({ type: 'cut', directories: [], files: ['a.txt'] })

    store.clearClipboard()
    expect(store.clipboard).toBeNull()
  })

  it('sorts the visible lists and resets the sort when the folder changes', async () => {
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['b', 'a'])))
    const store = useFileManagerStore()
    await store.open(11)

    store.sortBy('name')
    expect(store.sort).toEqual({ field: 'name', direction: 'down' })
    expect(store.visibleDirectories.map(item => item.basename)).toEqual(['b', 'a'])

    await store.goTo('x')
    expect(store.sort).toEqual({ field: 'name', direction: 'up' })
  })
})

function fileEntry (path: string): FmFile {
  const name = path.split('/').at(-1) ?? path
  return { type: 'file', path, basename: name, dirname: '', filename: name, extension: 'txt', size: 1, timestamp: 0 }
}

describe('file-manager.store clipboard and paste', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.paste).mockReset()
    vi.mocked(fmApi.content).mockResolvedValue(answer(listing(['docs'])))
  })

  it('pastes the clipboard into the current folder with the legacy body, then refreshes and keeps a copy', async () => {
    vi.mocked(fmApi.paste).mockResolvedValue({ result: { status: 'success', messageKey: 'message.fileManager.copied', message: null }, data: null })
    const store = useFileManagerStore()
    await store.open(11)
    await store.goTo('docs')
    store.files = [fileEntry('docs/a.txt')]
    store.select({ type: 'file', path: 'docs/a.txt' })
    store.setClipboard('copy')
    const contentCalls = vi.mocked(fmApi.content).mock.calls.length

    await store.paste()

    expect(fmApi.paste).toHaveBeenCalledWith(11, 'docs', { type: 'copy', directories: [], files: ['docs/a.txt'] })
    expect(vi.mocked(fmApi.content).mock.calls.length).toBeGreaterThan(contentCalls)
    expect(store.clipboard).toEqual({ type: 'copy', directories: [], files: ['docs/a.txt'] })
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: true, successMessage: expect.any(String) })])
  })

  it('clears a cut clipboard after a successful paste', async () => {
    vi.mocked(fmApi.paste).mockResolvedValue({ result: { status: 'success', messageKey: null, message: null }, data: null })
    const store = useFileManagerStore()
    await store.open(11)
    store.select({ type: 'dir', path: 'docs' })
    store.setClipboard('cut')

    await store.paste()

    expect(store.clipboard).toBeNull()
  })

  it('keeps the clipboard and does not refresh when the paste fails, and records the error', async () => {
    vi.mocked(fmApi.paste).mockResolvedValue({ result: { status: 'error', messageKey: null, message: 'Cannot paste.' }, data: null })
    const store = useFileManagerStore()
    await store.open(11)
    store.select({ type: 'dir', path: 'docs' })
    store.setClipboard('cut')
    const contentCalls = vi.mocked(fmApi.content).mock.calls.length

    await store.paste()

    expect(store.clipboard).toEqual({ type: 'cut', directories: ['docs'], files: [] })
    expect(vi.mocked(fmApi.content).mock.calls.length).toBe(contentCalls)
    expect(store.errors).toEqual(['Cannot paste.'])
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Cannot paste.' })])
  })

  it('does nothing without a clipboard', async () => {
    const store = useFileManagerStore()
    await store.open(11)

    await store.paste()

    expect(fmApi.paste).not.toHaveBeenCalled()
  })

  it('removes one item from the clipboard, and an empty clipboard becomes null', () => {
    const store = useFileManagerStore()
    store.select({ type: 'dir', path: 'docs' })
    store.select({ type: 'file', path: 'a.txt' }, true)
    store.setClipboard('copy')

    store.removeFromClipboard('files', 'a.txt')
    expect(store.clipboard).toEqual({ type: 'copy', directories: ['docs'], files: [] })

    store.removeFromClipboard('directories', 'docs')
    expect(store.clipboard).toBeNull()
  })

  it('lists the selected folders first, then the selected files', async () => {
    const store = useFileManagerStore()
    await store.open(11)
    store.directories = [folder('docs', 'docs')]
    store.files = [fileEntry('a.txt'), fileEntry('b.txt')]
    store.select({ type: 'file', path: 'b.txt' })
    store.select({ type: 'dir', path: 'docs' }, true)
    store.select({ type: 'file', path: 'a.txt' }, true)

    expect(store.selectedItems.map(item => item.path)).toEqual(['docs', 'a.txt', 'b.txt'])
  })
})
