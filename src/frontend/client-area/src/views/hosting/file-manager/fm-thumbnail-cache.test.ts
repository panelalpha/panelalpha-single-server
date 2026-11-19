import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from './file-manager.api'
import { clearThumbnailCache, isImageDataUri, loadThumbnail, thumbnailKey } from './fm-thumbnail-cache'

vi.mock('./file-manager.api', () => ({
  thumbnail: vi.fn(),
}))

const photo = { path: 'docs/photo.png', timestamp: 100 }

function answer (image: string) {
  return { result: { status: 'success' as const, messageKey: null, message: null }, data: { image } }
}

describe('loadThumbnail', () => {
  beforeEach(() => {
    clearThumbnailCache()
    vi.mocked(fmApi.thumbnail).mockReset()
  })

  it('requests the thumbnail once per path and timestamp', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValue(answer('data:image/png;base64,AA'))

    await expect(loadThumbnail(7, photo)).resolves.toBe('data:image/png;base64,AA')
    await expect(loadThumbnail(7, photo)).resolves.toBe('data:image/png;base64,AA')

    expect(fmApi.thumbnail).toHaveBeenCalledTimes(1)
    expect(fmApi.thumbnail).toHaveBeenCalledWith(7, 'docs/photo.png')
  })

  it('requests it again when the file has a new timestamp', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValue(answer('data:image/png;base64,AA'))

    await loadThumbnail(7, photo)
    await loadThumbnail(7, { ...photo, timestamp: 200 })

    expect(fmApi.thumbnail).toHaveBeenCalledTimes(2)
  })

  it('keeps the accounts apart', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValue(answer('data:image/png;base64,AA'))

    await loadThumbnail(7, photo)
    await loadThumbnail(8, photo)

    expect(fmApi.thumbnail).toHaveBeenCalledTimes(2)
    expect(thumbnailKey(7, photo)).not.toBe(thumbnailKey(8, photo))
  })

  it('shares one request between tiles that ask for the same file at once', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValue(answer('data:image/png;base64,AA'))

    const [first, second] = await Promise.all([loadThumbnail(7, photo), loadThumbnail(7, photo)])

    expect(first).toBe('data:image/png;base64,AA')
    expect(second).toBe('data:image/png;base64,AA')
    expect(fmApi.thumbnail).toHaveBeenCalledTimes(1)
  })

  it('runs at most four requests at once and starts the next one when a slot frees', async () => {
    const resolvers: (() => void)[] = []
    vi.mocked(fmApi.thumbnail).mockImplementation(() => new Promise(resolve => {
      resolvers.push(() => resolve(answer('data:image/png;base64,AA')))
    }))

    const all = Promise.all(Array.from({ length: 6 }, (_, index) => loadThumbnail(7, { path: `docs/${index}.png`, timestamp: 1 })))
    await Promise.resolve()
    expect(fmApi.thumbnail).toHaveBeenCalledTimes(4)

    resolvers[0]?.()
    await vi.waitFor(() => expect(fmApi.thumbnail).toHaveBeenCalledTimes(5))
    resolvers[1]?.()
    await vi.waitFor(() => expect(fmApi.thumbnail).toHaveBeenCalledTimes(6))
    for (const resolve of resolvers.slice(2)) {
      resolve()
    }
    await all
  })

  it('accepts only an image data URI', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValue(answer('javascript:alert(1)'))

    await expect(loadThumbnail(7, photo)).resolves.toBeNull()
    expect(isImageDataUri('data:image/png;base64,AA')).toBe(true)
    expect(isImageDataUri('data:text/html;base64,AA')).toBe(false)
    expect(isImageDataUri('https://example.com/a.png')).toBe(false)
  })

  it('returns null when the request throws', async () => {
    vi.mocked(fmApi.thumbnail).mockRejectedValue(new Error('network'))

    await expect(loadThumbnail(7, photo)).resolves.toBeNull()
  })

  it('returns null and caches nothing when the request failed', async () => {
    vi.mocked(fmApi.thumbnail).mockResolvedValueOnce({ result: { status: 'error', messageKey: null, message: 'x' }, data: null })
    vi.mocked(fmApi.thumbnail).mockResolvedValueOnce(answer('data:image/png;base64,BB'))

    await expect(loadThumbnail(7, photo)).resolves.toBeNull()
    await expect(loadThumbnail(7, photo)).resolves.toBe('data:image/png;base64,BB')
    expect(fmApi.thumbnail).toHaveBeenCalledTimes(2)
  })
})
