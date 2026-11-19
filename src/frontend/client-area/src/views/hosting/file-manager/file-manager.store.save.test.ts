import type { FmContent } from './file-manager.types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from './file-manager.api'
import { useFileManagerStore } from './file-manager.store'

vi.mock('./file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  updateFile: vi.fn(),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }
const saved = { status: 'success' as const, messageKey: 'message.fileManager.fileUpdated', message: null }
const failure = { status: 'error' as const, messageKey: null, message: 'Cannot update file.' }

const home: FmContent = { directories: [], files: [] }

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('file-manager.store saveFile', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.mocked(fmApi.initialize).mockResolvedValue({ result: ok, data: { config: { uploadMaxFilesize: 1024, unsupportedActions: [] } } })
    vi.mocked(fmApi.content).mockReset()
    vi.mocked(fmApi.content).mockResolvedValue({ result: ok, data: home })
    vi.mocked(fmApi.updateFile).mockReset()
    await useFileManagerStore().open(11)
    vi.mocked(fmApi.content).mockClear()
  })

  it('writes the blob into the open folder and refreshes the folder on success', async () => {
    const store = useFileManagerStore()
    await store.goTo('docs')
    vi.mocked(fmApi.content).mockClear()
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: saved, data: null })
    const blob = new Blob(['text'])

    const done = await store.saveFile('a.txt', blob)

    expect(done).toBe(true)
    expect(fmApi.updateFile).toHaveBeenCalledWith(11, { dir: 'docs', name: 'a.txt', blob })
    expect(fmApi.content).toHaveBeenCalledWith(11, 'docs')
  })

  it('returns false and does not refresh when the write fails', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: failure, data: null })

    const done = await store.saveFile('a.txt', new Blob(['x']))

    expect(done).toBe(false)
    expect(fmApi.content).not.toHaveBeenCalled()
    expect(store.errors).toEqual(['Cannot update file.'])
  })

  it('rejects a second save while the first one is running (no second request)', async () => {
    const store = useFileManagerStore()
    const first = deferred<fmApi.FmCall<null>>()
    vi.mocked(fmApi.updateFile).mockReturnValueOnce(first.promise)

    const running = store.saveFile('a.txt', new Blob(['1']))
    expect(store.fileSaving).toBe(true)
    const second = await store.saveFile('a.txt', new Blob(['2']))

    expect(second).toBe(false)
    expect(fmApi.updateFile).toHaveBeenCalledTimes(1)

    first.resolve({ result: saved, data: null })
    await expect(running).resolves.toBe(true)
    expect(store.fileSaving).toBe(false)
  })

  it('accepts a new save after the first one has finished', async () => {
    const store = useFileManagerStore()
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: saved, data: null })

    await store.saveFile('a.txt', new Blob(['1']))
    const again = await store.saveFile('a.txt', new Blob(['2']))

    expect(again).toBe(true)
    expect(fmApi.updateFile).toHaveBeenCalledTimes(2)
  })
})
