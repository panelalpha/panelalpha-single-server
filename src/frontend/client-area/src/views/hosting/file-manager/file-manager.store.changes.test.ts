import type { FmContent, FmDirectory, FmFile } from './file-manager.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as fmApi from './file-manager.api'
import { useFileManagerStore } from './file-manager.store'

vi.mock('./file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  rename: vi.fn(),
  deleteItems: vi.fn(),
  zip: vi.fn(),
  unzip: vi.fn(),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }
const deleted = { status: 'success' as const, messageKey: 'message.fileManager.deleted', message: null }
const failure = (message: string) => ({ status: 'error' as const, messageKey: null, message })

function folder (path: string): FmDirectory {
  const name = path.split('/').at(-1) ?? path
  return { type: 'dir', path, basename: name, dirname: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', timestamp: 0 }
}

function file (path: string): FmFile {
  const name = path.split('/').at(-1) ?? path
  return { type: 'file', path, basename: name, dirname: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', filename: name, extension: 'zip', size: 5, timestamp: 0 }
}

/** The home folder has `docs` (a folder) and `a.zip` (a file); `docs` has `x.txt`. */
function contentFor (path: string): FmContent {
  if (path === 'docs') {
    return { directories: [], files: [file('docs/x.txt')] }
  }
  return { directories: [folder('docs')], files: [file('a.zip')] }
}

describe('file-manager.store changes (rename, delete, zip, unzip, modals)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.content).mockImplementation(async (_id, path) => ({ result: ok, data: contentFor(path) }))
    vi.mocked(fmApi.rename).mockReset()
    vi.mocked(fmApi.deleteItems).mockReset()
    vi.mocked(fmApi.zip).mockReset()
    vi.mocked(fmApi.unzip).mockReset()
    await useFileManagerStore().open(11)
  })

  it('renames with the full paths: the new name keeps the folder of the item', async () => {
    const store = useFileManagerStore()
    await store.goTo('docs')
    vi.mocked(fmApi.rename).mockResolvedValue({ result: { status: 'success', messageKey: 'message.fileManager.renamed', message: null }, data: null })

    const done = await store.renameItem(file('docs/x.txt'), 'y.txt')

    expect(done).toBe(true)
    expect(fmApi.rename).toHaveBeenCalledWith(11, file('docs/x.txt'), 'docs/y.txt')
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: true })
  })

  it('renames a folder in the open folder with its full path and keeps the modal open on error', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.rename).mockResolvedValue({ result: failure('Cannot rename'), data: null })

    const done = await store.renameItem(folder('docs'), 'other')

    expect(done).toBe(false)
    expect(fmApi.rename).toHaveBeenCalledWith(11, folder('docs'), 'other')
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Cannot rename' })
    expect(store.errors).toEqual(['Cannot rename'])
  })

  it('deletes the selection as { type, path } items, folders first, and clears the selection after success', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    store.select(folder('docs'), true)
    vi.mocked(fmApi.deleteItems).mockResolvedValue({ result: deleted, data: null })

    const done = await store.deleteSelected()

    expect(done).toBe(true)
    expect(fmApi.deleteItems).toHaveBeenCalledWith(11, [
      { type: 'dir', path: 'docs' },
      { type: 'file', path: 'a.zip' },
    ])
    expect(store.selection).toEqual({ directories: [], files: [] })
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: true })
  })

  it('keeps the selection and records the error when the delete fails (HTTP 200 with status error)', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    vi.mocked(fmApi.deleteItems).mockResolvedValue({ result: failure('Cannot delete'), data: null })

    const done = await store.deleteSelected()

    expect(done).toBe(false)
    expect(store.selection.files).toEqual(['a.zip'])
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Cannot delete' })
    expect(store.errors).toEqual(['Cannot delete'])
  })

  it('does not call the API when nothing is selected', async () => {
    const store = useFileManagerStore()

    expect(await store.deleteSelected()).toBe(false)
    expect(fmApi.deleteItems).not.toHaveBeenCalled()
  })

  it('zips the selection into the open folder, with the name the modal built', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    store.select(folder('docs'), true)
    vi.mocked(fmApi.zip).mockResolvedValue({ result: ok, data: null })

    const done = await store.zipSelected('backup.zip')

    expect(done).toBe(true)
    expect(fmApi.zip).toHaveBeenCalledWith(11, '', 'backup.zip', { directories: ['docs'], files: ['a.zip'] })
    // Success without a message gives no alert (legacy shows nothing for it), but the folder is refreshed.
    expect(useAlertsStore().activeAlerts).toHaveLength(0)
    expect(fmApi.content).toHaveBeenLastCalledWith(11, '')
  })

  it('records a zip error from HTTP 200 in the alert and in the status errors', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    vi.mocked(fmApi.zip).mockResolvedValue({ result: failure('Error creating archive!'), data: null })

    expect(await store.zipSelected('backup.zip')).toBe(false)
    expect(store.errors).toEqual(['Error creating archive!'])
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Error creating archive!' })
  })

  it('unzips the selected archive into its own folder when no folder name is given', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    vi.mocked(fmApi.unzip).mockResolvedValue({ result: ok, data: null })

    expect(await store.unzipSelected(null)).toBe(true)
    expect(fmApi.unzip).toHaveBeenCalledWith(11, 'a.zip', null)
  })

  it('unzips into a new folder with the given name', async () => {
    const store = useFileManagerStore()
    store.select(file('a.zip'))
    vi.mocked(fmApi.unzip).mockResolvedValue({ result: ok, data: null })

    expect(await store.unzipSelected('extracted')).toBe(true)
    expect(fmApi.unzip).toHaveBeenCalledWith(11, 'a.zip', 'extracted')
  })

  it('does not unzip a folder', async () => {
    const store = useFileManagerStore()
    store.select(folder('docs'))

    expect(await store.unzipSelected(null)).toBe(false)
    expect(fmApi.unzip).not.toHaveBeenCalled()
  })

  it('opens one modal at a time and closes it', () => {
    const store = useFileManagerStore()

    store.openModal('rename')
    expect(store.activeModal).toBe('rename')

    store.openModal('status')
    expect(store.activeModal).toBe('status')

    store.closeModal()
    expect(store.activeModal).toBeNull()
  })

  it('closes the open modal on reset (leaving the page or changing the account)', () => {
    const store = useFileManagerStore()
    store.openModal('delete')

    store.reset()

    expect(store.activeModal).toBeNull()
  })
})
