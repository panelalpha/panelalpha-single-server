import type { FmClipboard, FmConfig, FmContent, FmDirectory, FmFile, FmFileWrite, FmItemRef, FmSelection } from './file-manager.types'
import type { FmResult } from './fm-response'
import { api, apiBaseUrl } from '@/shared/api/client'
import { fmErrorResult, parseFmBody } from './fm-response'

// Calls of the File Manager, same endpoints and bodies as legacy (`/file-manager/*` under the API base).
// The account is the path segment `{id}`; the disk is always `local`. No response cache (legacy cached 36000 s).

export const FM_DISK = 'local'

/** One call: the envelope as `result`, and the data when the call did not fail (`null` on error). */
export interface FmCall<T> {
  result: FmResult
  data: T | null
}

type FmBody = { result?: unknown } & Record<string, unknown>

async function call<T> (request: Promise<{ data: FmBody }>, pick: (body: FmBody) => T): Promise<FmCall<T>> {
  try {
    const { data } = await request
    const result = parseFmBody(data)
    return { result, data: result.status === 'error' ? null : pick(data) }
  } catch (error) {
    return { result: fmErrorResult(error), data: null }
  }
}

function toNumber (value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function toText (value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Legacy `timestamp` is a string in `content` and an int elsewhere; the app keeps a number. */
export function normalizeDirectory (raw: unknown): FmDirectory {
  const item = raw as Record<string, unknown>
  return {
    type: 'dir',
    path: toText(item.path),
    basename: toText(item.basename),
    dirname: toText(item.dirname),
    timestamp: toNumber(item.timestamp),
  }
}

export function normalizeFile (raw: unknown): FmFile {
  const item = raw as Record<string, unknown>
  return {
    type: 'file',
    path: toText(item.path),
    basename: toText(item.basename),
    dirname: toText(item.dirname),
    filename: toText(item.filename),
    extension: toText(item.extension),
    size: toNumber(item.size),
    timestamp: toNumber(item.timestamp),
  }
}

function toConfig (raw: unknown): FmConfig {
  const item = (raw ?? {}) as Record<string, unknown>
  const actions = Array.isArray(item.unsupportedActions) ? item.unsupportedActions : []
  return {
    uploadMaxFilesize: toNumber(item.uploadMaxFilesize),
    unsupportedActions: actions.filter((action): action is string => typeof action === 'string'),
  }
}

function listOf<T> (value: unknown, normalize: (raw: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(item => normalize(item)) : []
}

/** `GET /file-manager/initialize/{id}`: the upload limit and the actions the account lacks. */
export function initialize (accountId: number): Promise<FmCall<{ config: FmConfig }>> {
  return call(api.get<FmBody>(`/file-manager/initialize/${accountId}`), body => ({ config: toConfig(body.config) }))
}

/** `GET /file-manager/content/{id}?path=`: folders and files of one folder ('' is home). */
export function content (accountId: number, path: string): Promise<FmCall<FmContent>> {
  return call(
    api.get<FmBody>(`/file-manager/content/${accountId}`, { params: { disk: FM_DISK, path } }),
    body => ({
      directories: listOf(body.directories, normalizeDirectory),
      files: listOf(body.files, normalizeFile),
    }),
  )
}

/** `GET /file-manager/thumbnails/{id}?path=`: a 80x80 data URI of an image. */
export function thumbnail (accountId: number, path: string): Promise<FmCall<{ image: string }>> {
  return call(
    api.get<FmBody>(`/file-manager/thumbnails/${accountId}`, { params: { disk: FM_DISK, path } }),
    body => ({ image: toText(body.image) }),
  )
}

/** `GET /file-manager/preview/{id}?path=`: the image to preview (the body has no `result` on success). */
export function preview (accountId: number, path: string): Promise<FmCall<{ image: string }>> {
  return call(
    api.get<FmBody>(`/file-manager/preview/${accountId}`, { params: { disk: FM_DISK, path } }),
    body => ({ image: toText(body.image) }),
  )
}

/** `POST /file-manager/create-directory/{id}`: `path` is the folder that gets the new one, `name` is only the basename. */
export function createDirectory (accountId: number, path: string, name: string): Promise<FmCall<{ directory: FmDirectory }>> {
  return call(
    api.post<FmBody>(`/file-manager/create-directory/${accountId}`, { disk: FM_DISK, path, name }),
    body => ({ directory: normalizeDirectory(body.directory) }),
  )
}

/** `POST /file-manager/create-file/{id}`. */
export function createFile (accountId: number, path: string, name: string): Promise<FmCall<{ file: FmFile }>> {
  return call(
    api.post<FmBody>(`/file-manager/create-file/${accountId}`, { disk: FM_DISK, path, name }),
    body => ({ file: normalizeFile(body.file) }),
  )
}

/** `POST /file-manager/upload/{id}` (multipart): several files into `path`; `overwrite` replaces existing files (sent as `1`/`0`, as legacy). */
export function upload (accountId: number, path: string, files: readonly File[], overwrite: boolean): Promise<FmCall<null>> {
  const form = new FormData()
  form.append('disk', FM_DISK)
  form.append('path', path)
  form.append('overwrite', overwrite ? '1' : '0')
  for (const file of files) {
    form.append('files[]', file)
    // A browser escapes `"` in the part header.
    form.append('names[]', file.name)
  }
  return call(api.post<FmBody>(`/file-manager/upload/${accountId}`, form), () => null)
}

/**
 * `POST /file-manager/update-file/{id}` (multipart): `path` is the folder, `file` is the
 * blob with the name of the file. It always overwrites (no `overwrite` flag, unlike upload).
 */
export function updateFile (accountId: number, { dir, name, blob }: FmFileWrite): Promise<FmCall<null>> {
  const form = new FormData()
  form.append('disk', FM_DISK)
  form.append('path', dir)
  form.append('file', blob, name)
  // A browser escapes `"` in the part header.
  form.append('name', name)
  return call(api.post<FmBody>(`/file-manager/update-file/${accountId}`, form), () => null)
}

/** `POST /file-manager/delete/{id}`: `items` are `{ type, path }` (a folder is removed with its content). */
export function deleteItems (accountId: number, items: readonly FmItemRef[]): Promise<FmCall<null>> {
  return call(api.post<FmBody>(`/file-manager/delete/${accountId}`, { disk: FM_DISK, items }), () => null)
}

/** `POST /file-manager/paste/{id}`: copy or move the clipboard items into `path`. */
export function paste (accountId: number, path: string, clipboard: FmClipboard): Promise<FmCall<null>> {
  return call(
    api.post<FmBody>(`/file-manager/paste/${accountId}`, { disk: FM_DISK, path, clipboard }),
    () => null,
  )
}

/** `POST /file-manager/rename/{id}`: `oldName` and `newName` are full paths, unlike the create calls. */
export function rename (accountId: number, item: FmItemRef, newName: string): Promise<FmCall<null>> {
  return call(
    api.post<FmBody>(`/file-manager/rename/${accountId}`, { disk: FM_DISK, oldName: item.path, newName, type: item.type }),
    () => null,
  )
}

/** `POST /file-manager/zip/{id}`: an archive `name.zip` in `path` from the selected paths. */
export function zip (accountId: number, path: string, name: string, elements: FmSelection): Promise<FmCall<null>> {
  return call(
    api.post<FmBody>(`/file-manager/zip/${accountId}`, { disk: FM_DISK, path, name, elements }),
    () => null,
  )
}

/** `POST /file-manager/unzip/{id}`: `folder` is the new folder name, or null to extract into `path`. */
export function unzip (accountId: number, path: string, folder: string | null): Promise<FmCall<null>> {
  return call(api.post<FmBody>(`/file-manager/unzip/${accountId}`, { disk: FM_DISK, path, folder }), () => null)
}

function fileUrl (endpoint: string, accountId: number, path: string): string {
  return `${apiBaseUrl()}/file-manager/${endpoint}/${accountId}?disk=${FM_DISK}&path=${encodeURIComponent(path)}`
}

/** The URL a browser opens to download a file (the same-origin session cookie is sent). */
export function downloadUrl (accountId: number, path: string): string {
  return fileUrl('download', accountId, path)
}

/** The URL of the byte stream for audio and video. */
export function streamFileUrl (accountId: number, path: string): string {
  return fileUrl('stream-file', accountId, path)
}

/** The address a player reads: `release` frees it. `ok: false` is a source that could not be made (the player shows an alert). */
export type FmStreamSource = { ok: true, url: string, release: () => void } | { ok: false }

/**
 * The only source of the audio and video players. It is the stream endpoint, which the browser calls with the session cookie;
 * nothing is downloaded, so `release` does nothing here.
 */
export async function streamSource (accountId: number, file: FmFile): Promise<FmStreamSource> {
  return { ok: true, url: streamFileUrl(accountId, file.path), release: () => undefined }
}

export type FmTextResult = { ok: true, text: string } | { ok: false, result: FmResult }

/**
 * The result body of a text download. A failure is HTTP 200 JSON `{ result: { status: 'error' } }` (`download` answers it instead of the file).
 * Only a JSON type (or no type) is looked at: a file is sent as `application/octet-stream`, so a JSON file is never taken for an error.
 * Returns the error when the body is one, otherwise null.
 */
function downloadErrorResult (data: unknown, headers: unknown): FmResult | null {
  if (typeof data === 'string') {
    const contentType = String((headers as Record<string, unknown> | undefined)?.['content-type'] ?? '')
    if (contentType !== '' && !contentType.includes('application/json')) {
      return null
    }
    if (!data.trimStart().startsWith('{')) {
      return null
    }
    try {
      const body = parseFmBody(JSON.parse(data))
      return body.status === 'error' ? body : null
    } catch {
      return null
    }
  }
  const body = parseFmBody(data)
  return body.status === 'error' ? body : null
}

/**
 * `GET /file-manager/download/{id}` as text, for the text editor. Axios does not parse the body (a JSON file stays text).
 * A handled failure comes back as `{ ok: false, result }` and is never shown as the content of the file.
 */
export async function downloadText (accountId: number, path: string): Promise<FmTextResult> {
  try {
    const response = await api.get<unknown>(`/file-manager/download/${accountId}`, {
      params: { disk: FM_DISK, path },
      responseType: 'text',
      transformResponse: [(data: unknown) => data],
    })
    const failure = downloadErrorResult(response.data, response.headers)
    if (failure !== null) {
      return { ok: false, result: failure }
    }
    const { data } = response
    return { ok: true, text: typeof data === 'string' ? data : JSON.stringify(data) }
  } catch (error) {
    return { ok: false, result: fmErrorResult(error) }
  }
}

/** A download the server refused: HTTP 200 JSON with `status: error`, the same body the text download reads. */
export class FmDownloadError extends Error {
  readonly result: FmResult

  constructor (result: FmResult) {
    super('file-manager download failed')
    this.result = result
  }
}

/**
 * `GET /file-manager/download/{id}` as a Blob, for the PDF viewer. Throws on a failed request, and on a refused download
 * (HTTP 200 JSON), so that the error is not opened as a PDF.
 */
export async function downloadBlob (accountId: number, path: string): Promise<Blob> {
  const { data, headers } = await api.get<Blob>(`/file-manager/download/${accountId}`, {
    params: { disk: FM_DISK, path },
    responseType: 'blob',
  })
  if (String((headers as Record<string, unknown> | undefined)?.['content-type'] ?? '').includes('application/json')) {
    const failure = downloadErrorResult(data instanceof Blob ? await data.text() : String(data), headers)
    if (failure !== null) {
      throw new FmDownloadError(failure)
    }
  }
  return data
}
