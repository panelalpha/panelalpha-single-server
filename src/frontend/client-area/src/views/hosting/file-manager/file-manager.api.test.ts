import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  content,
  createDirectory,
  deleteItems,
  downloadText,
  downloadUrl,
  initialize,
  normalizeDirectory,
  normalizeFile,
  preview,
  rename,
  streamSource,
  updateFile,
  upload,
} from './file-manager.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiBaseUrl: () => '/api',
}))

describe('file-manager.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('reads the envelope and returns the content of a folder, normalized', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        result: { status: 'success', message: null },
        directories: [{ type: 'dir', path: 'docs', basename: 'docs', dirname: '', timestamp: '1700000000' }],
        files: [{ type: 'file', path: 'a.txt', basename: 'a.txt', dirname: '', filename: 'a', extension: 'txt', size: '12', timestamp: '1700000001' }],
      },
    })

    const response = await content(11, '')

    expect(api.get).toHaveBeenCalledWith('/file-manager/content/11', { params: { disk: 'local', path: '' } })
    expect(response.result.status).toBe('success')
    expect(response.data?.directories[0]?.timestamp).toBe(1_700_000_000)
    expect(response.data?.files[0]).toMatchObject({ size: 12, timestamp: 1_700_000_001 })
  })

  it('answers a 422 with the text of the error and no data', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 422, data: { message: 'The path is invalid.' } } })

    await expect(content(11, '../x')).resolves.toEqual({
      result: { status: 'error', messageKey: null, message: 'The path is invalid.' },
      data: null,
    })
  })

  it('answers a handled backend failure (HTTP 200 with status error) with data null', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { result: { status: 'error', message: 'Cannot get directory content.' } } })

    const response = await content(11, 'x')

    expect(response.result).toEqual({ status: 'error', messageKey: null, message: 'Cannot get directory content.' })
    expect(response.data).toBeNull()
  })

  it('reads a preview without result as a success with the image', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { image: 'data:image/png;base64,AAA' } })

    const response = await preview(11, 'a.png')

    expect(response).toEqual({ result: { status: 'success', messageKey: null, message: null }, data: { image: 'data:image/png;base64,AAA' } })
  })

  it('maps a success code of a create call to its message key and sends only the basename', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        result: { status: 'success', message: 'dirCreated' },
        directory: { type: 'dir', path: 'docs/new', basename: 'new', dirname: 'docs', timestamp: 1_700_000_002 },
      },
    })

    const response = await createDirectory(11, 'docs', 'new')

    expect(api.post).toHaveBeenCalledWith('/file-manager/create-directory/11', { disk: 'local', path: 'docs', name: 'new' })
    expect(response.result.messageKey).toBe('message.fileManager.dirCreated')
    expect(response.data?.directory.basename).toBe('new')
  })

  it('sends the upload as multipart with the overwrite flag', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { result: { status: 'success', message: 'uploaded' } } })
    const file = new File(['x'], 'x.txt', { type: 'text/plain' })

    const response = await upload(11, 'docs', [file], true)

    const [url, body] = vi.mocked(api.post).mock.calls[0] ?? []
    expect(url).toBe('/file-manager/upload/11')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('path')).toBe('docs')
    expect((body as FormData).get('overwrite')).toBe('1')
    expect((body as FormData).get('files[]')).toBeInstanceOf(File)
    expect((body as FormData).get('names[]')).toBe('x.txt')
    expect(response.result.messageKey).toBe('message.fileManager.uploaded')
  })

  it('names an upload and a write itself, so a double quote reaches the panel', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { result: { status: 'success', message: 'uploaded' } } })
    const quoted = new File(['x'], 'fmq"x.txt', { type: 'text/plain' })

    await upload(11, 'docs', [quoted], false)
    await updateFile(11, { dir: 'docs', name: 'fmq"x.txt', blob: quoted })

    const [uploadUrl, uploadBody] = vi.mocked(api.post).mock.calls[0] ?? []
    expect(uploadUrl).toBe('/file-manager/upload/11')
    expect((uploadBody as FormData).getAll('names[]')).toEqual(['fmq"x.txt'])
    const [writeUrl, writeBody] = vi.mocked(api.post).mock.calls[1] ?? []
    expect(writeUrl).toBe('/file-manager/update-file/11')
    expect((writeBody as FormData).get('name')).toBe('fmq"x.txt')
  })

  it('sends rename with full paths and the delete items as they are', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { result: { status: 'success', message: 'renamed' } } })

    await rename(11, { type: 'file', path: 'docs/a.txt' }, 'docs/b.txt')
    await deleteItems(11, [{ type: 'dir', path: 'docs' }])

    expect(api.post).toHaveBeenNthCalledWith(1, '/file-manager/rename/11', {
      disk: 'local',
      oldName: 'docs/a.txt',
      newName: 'docs/b.txt',
      type: 'file',
    })
    expect(api.post).toHaveBeenNthCalledWith(2, '/file-manager/delete/11', {
      disk: 'local',
      items: [{ type: 'dir', path: 'docs' }],
    })
  })

  it('reads the initialize config and the unsupported actions', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { result: { status: 'success', message: null }, config: { uploadMaxFilesize: 1024, unsupportedActions: ['zip'] } },
    })

    const response = await initialize(11)

    expect(response.data?.config).toEqual({ uploadMaxFilesize: 1024, unsupportedActions: ['zip'] })
  })

  it('builds the download URL from the API base and encodes the path', () => {
    expect(downloadUrl(11, 'my docs/a b.txt')).toBe('/api/file-manager/download/11?disk=local&path=my%20docs%2Fa%20b.txt')
  })

  it('gives the player the stream URL of the file, and a release that does nothing', async () => {
    const song = normalizeFile({ path: 'my docs/a b.mp3', basename: 'a b.mp3', extension: 'mp3' })

    const source = await streamSource(11, song)

    expect(source).toEqual({ ok: true, url: '/api/file-manager/stream-file/11?disk=local&path=my%20docs%2Fa%20b.mp3', release: expect.any(Function) })
    expect(api.get).not.toHaveBeenCalled()
    expect(() => source.ok && source.release()).not.toThrow()
  })

  it('writes a file as multipart: path is the folder and file is the blob with the name', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { result: { status: 'success', message: 'fileUpdated' } } })
    const blob = new Blob(['{"a":1}'], { type: 'application/json' })

    const response = await updateFile(11, { dir: 'docs', name: 'a.json', blob })

    const [url, body] = vi.mocked(api.post).mock.calls[0] ?? []
    expect(url).toBe('/file-manager/update-file/11')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('disk')).toBe('local')
    expect((body as FormData).get('path')).toBe('docs')
    const file = (body as FormData).get('file')
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('a.json')
    expect((body as FormData).get('name')).toBe('a.json')
    expect(response).toEqual({ result: { status: 'success', messageKey: 'message.fileManager.fileUpdated', message: null }, data: null })
  })

  it('reads a text download without parsing it: a JSON file stays text', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: '{"result":{"status":"ok"}}', headers: { 'content-type': 'application/octet-stream' } })

    const response = await downloadText(11, 'data.json')

    const config = vi.mocked(api.get).mock.calls[0]?.[1] as { responseType?: string, transformResponse?: Array<(data: unknown) => unknown> } | undefined
    expect(api.get).toHaveBeenCalledWith('/file-manager/download/11', expect.objectContaining({ params: { disk: 'local', path: 'data.json' }, responseType: 'text' }))
    expect(config?.transformResponse?.[0]?.('raw')).toBe('raw')
    expect(response).toEqual({ ok: true, text: '{"result":{"status":"ok"}}' })
  })

  it('returns plain text as it is, including text that is not valid JSON', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: 'hello\nworld', headers: {} })
    vi.mocked(api.get).mockResolvedValueOnce({ data: '{ not json', headers: { 'content-type': 'text/plain' } })

    await expect(downloadText(11, 'a.txt')).resolves.toEqual({ ok: true, text: 'hello\nworld' })
    await expect(downloadText(11, 'b.txt')).resolves.toEqual({ ok: true, text: '{ not json' })
  })

  it('returns an error JSON sent in HTTP 200 as an error, never as the content of the file', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: '{"result":{"status":"error","message":"Cannot download file."}}',
      headers: { 'content-type': 'application/json' },
    })

    await expect(downloadText(11, 'a.txt')).resolves.toEqual({
      ok: false,
      result: { status: 'error', messageKey: null, message: 'Cannot download file.' },
    })
  })

  it('treats an error JSON in HTTP 200 without a content type as an error too', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { result: { status: 'error', message: 'Cannot download file.' } } })

    await expect(downloadText(11, 'a.txt')).resolves.toMatchObject({ ok: false, result: { status: 'error', message: 'Cannot download file.' } })
  })

  it('answers a failed text download request (network or 500) as an error', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 500, data: { message: 'Server error.' } } })

    await expect(downloadText(11, 'a.txt')).resolves.toEqual({
      ok: false,
      result: { status: 'error', messageKey: null, message: 'Server error.' },
    })
  })

  it('normalizes timestamps and sizes to numbers', () => {
    expect(normalizeDirectory({ path: 'd', basename: 'd', dirname: '', timestamp: '5' }).timestamp).toBe(5)
    expect(normalizeFile({ path: 'f', basename: 'f', size: '7', timestamp: 'x' })).toMatchObject({ size: 7, timestamp: 0 })
  })
})
