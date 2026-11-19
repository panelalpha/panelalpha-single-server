import type { Page, Request, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { hostingService, hostingState } from '../../parity/states/hosting'
import { shellHome } from '../../parity/states/shell'

// Stateful in-memory fake of the API for the signed-in File Manager (`/hosting/file-manager`). Each test gets a fresh one,
// so tests stay independent. Frame calls (`/home`, `/services`, `/instances`, shell) come from the parity states; the
// `/file-manager/*` calls are answered here from a directory tree. Every JSON body carries `result`, as the backend does.
// Files keep their bytes: `download` and `stream-file` answer the bytes with their type, `preview` and `thumbnails` answer
// a data URI of an image, and `update-file` (the text editor and the cropper) replaces the bytes of the file.

const GB = 1_073_741_824
const FM_ROUTE = /^\/file-manager\/([a-z-]+)\/(\d+)$/
const FIXTURES = new URL('../../parity/fixtures/', import.meta.url)

/** Types of the media answered by `stream-file`. Audio and video are webm, wav and ogg (Chromium decodes these without proprietary codecs). */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  webm: 'video/webm',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

/** Types of the images answered by `preview` and `thumbnails`. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

interface FmNode {
  type: 'dir' | 'file'
  path: string
  size: number
  timestamp: number
  /** The bytes of a file; a file without them reads as `size` zero bytes. */
  content?: Buffer
}

interface FmClipboardBody {
  type: 'copy' | 'cut'
  directories: string[]
  files: string[]
}

interface UploadedFile {
  name: string
  size: number
  content: Buffer
}

type JsonBody = Record<string, any>
type Reply = Record<string, unknown>
/** A body sent as it is (the bytes of a file), with its own type, instead of JSON. */
type RawReply = { raw: { contentType: string, body: Buffer } }
type Answer = Reply | RawReply

export interface FakeBackend {
  /** Requests no handler answers. The fixture fails the test with these. */
  readonly unhandled: string[]
  /**
   * Services of `GET /services`, read on every request, so a test can change them before it navigates. The first service
   * is the default; its server accounts get a tree each. A `wp-cloud` service answers `zip` as unsupported (like the backend).
   */
  services: unknown[]
  /** `uploadMaxFilesize` of the config: the most bytes one upload may total. Default 1 GB. */
  uploadMaxFilesize: number
  /**
   * `style.darkMode` of the app in `GET /home`, read on every request (the visual tests set it before they navigate). Undefined
   * keeps the fixture as it is, so the flow tests see the same app as before.
   */
  darkMode?: boolean
  /**
   * Extra frame calls (`GET /projects/41`, ...), read on every request and added to the ones built from the parity hosting state. The
   * project mounting of the File Manager (`/projects/:id/advanced/file-manager`) sets them before it navigates.
   */
  frameHandlers?: Record<string, unknown>
  /** A whole `GET /home` body that replaces the default one (the single-server home of the project frame). */
  home?: Record<string, unknown>
  /** Paths of one account's tree now (`''` is home and is not listed). */
  paths: (accountId?: number) => string[]
  /** Adds a folder to an account's tree (a change made "by someone else", e.g. between two visits of the page). */
  addDirectory: (path: string, accountId?: number) => void
  /** Adds a file of `size` zero bytes to an account's tree. */
  addFile: (path: string, accountId?: number, size?: number) => void
  /** Adds a file with `content` to an account's tree; its size is the length of the content. */
  addFileContent: (path: string, content: Buffer, accountId?: number) => void
  /** The bytes of a file of an account's tree now, or undefined when there is no such file (what a save wrote, for instance). */
  fileContent: (path: string, accountId?: number) => Buffer | undefined
  /**
   * Makes the `/file-manager/<operation>` calls answer an error from now on, for every account. With a `status` of 400 or more the
   * answer is that HTTP status with `{ message }`; otherwise it is HTTP 200 with the backend's error body (`message`, default
   * `Server Error`). Without a call to this the operation answers as before.
   */
  failOperation: (operation: string, options?: { status?: number, message?: string }) => void
}

const DEFAULT_ACCOUNT_ID = 11

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const dirname = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const join = (dir: string, name: string): string => (dir === '' ? name : `${dir}/${name}`)
const extension = (name: string): string => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '')
const now = (): number => Math.floor(Date.now() / 1000)

const ok = (message: string | null = null, extra: Reply = {}): Reply => ({ result: { status: 'success', message }, ...extra })
const fail = (message: string): Reply => ({ result: { status: 'error', message } })
const isRaw = (answer: Answer): answer is RawReply => 'raw' in answer

function readFixture (name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
}

/** The bytes of a file node. */
const contentOf = (node: FmNode): Buffer => node.content ?? Buffer.alloc(node.size)

/** The home directory of a fresh account: two folders and one text file. */
function defaultTree (): Map<string, FmNode> {
  const nodes = new Map<string, FmNode>()
  const stamp = Math.floor(Date.parse('2026-10-05T12:00:00.000Z') / 1000)
  for (const dir of ['public_html', 'logs']) {
    nodes.set(dir, { type: 'dir', path: dir, size: 0, timestamp: stamp })
  }
  const readme = Buffer.from('Hello from readme\n')
  nodes.set('readme.txt', { type: 'file', path: 'readme.txt', size: readme.length, timestamp: stamp, content: readme })
  return nodes
}

/** The node at `path` and, for a folder, everything under it. */
function subtree (nodes: Map<string, FmNode>, path: string): FmNode[] {
  return [...nodes.values()].filter(node => node.path === path || node.path.startsWith(`${path}/`))
}

/** The backend's item shape: `content` items and the create/rename answers. */
function toApiEntry (node: FmNode): Record<string, unknown> {
  const base = { path: node.path, basename: basename(node.path), dirname: dirname(node.path), timestamp: node.timestamp }
  if (node.type === 'dir') {
    return { type: 'dir', ...base }
  }
  const name = basename(node.path)
  return { type: 'file', ...base, filename: name.replace(/\.[^.]*$/, ''), extension: extension(name), size: node.size }
}

/** Splits a multipart body into its parts (`name`, optional `filename`, and the value as bytes). */
function parseMultipart (body: Buffer, boundary: string): Array<{ name: string, filename?: string, value: Buffer }> {
  return body
    .toString('latin1')
    .split(`--${boundary}`)
    .slice(1, -1)
    .map(part => {
      const split = part.indexOf('\r\n\r\n')
      const head = part.slice(0, split)
      const name = /name="([^"]*)"/.exec(head)?.[1] ?? ''
      const filename = /filename="([^"]*)"/.exec(head)?.[1]
      return {
        name,
        ...(filename === undefined ? {} : { filename: Buffer.from(filename, 'latin1').toString('utf8') }),
        value: Buffer.from(part.slice(split + 4, -2), 'latin1'),
      }
    })
}

/**
 * The request body as the handler reads it: JSON, or a multipart body reduced to `path`, `overwrite` and `files` (each file with
 * its name, its size and its bytes). A text field is read as text.
 */
async function readBody (request: Request): Promise<JsonBody> {
  const type = request.headers()['content-type'] ?? ''
  if (!type.startsWith('multipart/form-data')) {
    return (request.postDataJSON() ?? {}) as JsonBody
  }
  const boundary = /boundary=(.+)$/.exec(type)?.[1] ?? ''
  const parts = parseMultipart(request.postDataBuffer() ?? Buffer.alloc(0), boundary)
  const text = (name: string): string => parts.find(part => part.name === name)?.value.toString('utf8') ?? ''
  const files: UploadedFile[] = parts
    .filter(part => part.filename !== undefined)
    .map(part => ({ name: part.filename!, size: part.value.length, content: part.value }))
  return {
    path: text('path'),
    overwrite: text('overwrite') === '1',
    files,
  }
}

/** One account's tree and its `/file-manager/*` operations. An unknown operation answers `undefined`. */
function createFileManager (unsupportedActions: () => string[], uploadMaxFilesize: () => number) {
  const nodes = defaultTree()

  const childrenOf = (dir: string): FmNode[] => [...nodes.values()].filter(node => dirname(node.path) === dir)

  function create (dir: string, name: string, type: 'dir' | 'file', message: string): Reply {
    const path = join(dir, name)
    if (nodes.has(path)) {
      return fail(type === 'dir' ? 'Directory exists' : 'File exists')
    }
    const node: FmNode = { type, path, size: 0, timestamp: now() }
    nodes.set(path, node)
    return ok(message, { [type === 'dir' ? 'directory' : 'file']: toApiEntry(node) })
  }

  /** Copies (or moves, for a cut) the sources into `target`. Nothing changes when a destination exists. */
  function transfer (sources: string[], target: string, move: boolean): Reply {
    const destinations = sources.map(source => join(target, basename(source)))
    if (sources.some((source, index) => destinations[index] !== source && nodes.has(destinations[index]!))) {
      return fail('File exists')
    }
    for (const [index, source] of sources.entries()) {
      const dest = destinations[index]!
      for (const node of subtree(nodes, source)) {
        const path = dest + node.path.slice(source.length)
        if (move) {
          nodes.delete(node.path)
        }
        nodes.set(path, { ...node, path })
      }
    }
    return ok('copied')
  }

  function paste (body: JsonBody): Reply {
    const clipboard = body.clipboard as FmClipboardBody
    return transfer([...clipboard.directories, ...clipboard.files], body.path ?? '', clipboard.type === 'cut')
  }

  function listFolder (query: URLSearchParams): Reply {
    const dir = query.get('path') ?? ''
    if (dir !== '' && !nodes.has(dir)) {
      return fail('Directory not found')
    }
    const items = childrenOf(dir)
    return ok(null, {
      directories: items.filter(node => node.type === 'dir').map(node => toApiEntry(node)),
      files: items.filter(node => node.type === 'file').map(node => toApiEntry(node)),
    })
  }

  function upload (body: JsonBody): Reply {
    let skipped = false
    for (const file of body.files as UploadedFile[]) {
      const path = join(body.path ?? '', file.name)
      if (nodes.has(path) && !body.overwrite) {
        skipped = true
        continue
      }
      nodes.set(path, { type: 'file', path, size: file.size, timestamp: now(), content: file.content })
    }
    return skipped ? { result: { status: 'warning', message: 'notAllUploaded' } } : ok('uploaded')
  }

  /** The `file` of the editor and the cropper: its name is the file name, `path` is the folder, and it always overwrites. */
  function updateFile (body: JsonBody): Reply {
    const file = (body.files as UploadedFile[])[0]
    if (file === undefined) {
      return fail('File not found')
    }
    const path = join(body.path ?? '', file.name)
    nodes.set(path, { type: 'file', path, size: file.content.length, timestamp: now(), content: file.content })
    return ok('fileUpdated')
  }

  function rename (body: JsonBody): Reply {
    const source = body.oldName as string
    const target = body.newName as string
    if (nodes.has(target)) {
      return fail(body.type === 'dir' ? 'Directory exists' : 'File exists')
    }
    for (const node of subtree(nodes, source)) {
      const path = target + node.path.slice(source.length)
      nodes.delete(node.path)
      nodes.set(path, { ...node, path })
    }
    return ok('renamed')
  }

  function remove (body: JsonBody): Reply {
    for (const item of body.items as Array<{ path: string }>) {
      for (const node of subtree(nodes, item.path)) {
        nodes.delete(node.path)
      }
    }
    return ok('deleted')
  }

  function zip (body: JsonBody): Reply {
    const name = body.name as string
    const path = join(body.path ?? '', name.endsWith('.zip') ? name : `${name}.zip`)
    nodes.set(path, { type: 'file', path, size: 2048, timestamp: now() })
    return ok()
  }

  /** `path` is the archive; it is extracted into a folder next to it, named `folder` or after the archive. */
  function unzip (body: JsonBody): Reply {
    const archive = body.path as string
    const target = join(dirname(archive), (body.folder as string | null) ?? archive.replace(/\.zip$/, ''))
    if (nodes.has(target)) {
      return fail('Directory exists')
    }
    const inside = join(target, 'extracted.txt')
    nodes.set(target, { type: 'dir', path: target, size: 0, timestamp: now() })
    nodes.set(inside, { type: 'file', path: inside, size: 42, timestamp: now() })
    return ok()
  }

  /** The file a query names, or undefined when it is not a file. */
  function fileAt (query: URLSearchParams): FmNode | undefined {
    const node = nodes.get(query.get('path') ?? '')
    return node?.type === 'file' ? node : undefined
  }

  /** `download`: the bytes of the file, as the backend sends them (`application/octet-stream`). */
  function download (query: URLSearchParams): Answer {
    const node = fileAt(query)
    if (node === undefined) {
      return fail('File not found')
    }
    return { raw: { contentType: 'application/octet-stream', body: contentOf(node) } }
  }

  /** `preview` and `thumbnails`: the image of the file as a data URI (no `result` on success, as the backend). */
  function image (query: URLSearchParams): Answer {
    const node = fileAt(query)
    const type = IMAGE_TYPES[extension(node?.path ?? '').toLowerCase()]
    if (node === undefined || type === undefined) {
      return fail('File not found')
    }
    return { image: `data:${type};base64,${contentOf(node).toString('base64')}` }
  }

  /** `stream-file`: the bytes of an audio or video file with its type. The whole file is sent, without a `Range` answer. */
  function stream (query: URLSearchParams): Answer {
    const node = fileAt(query)
    const type = MEDIA_TYPES[extension(node?.path ?? '').toLowerCase()]
    if (node === undefined || type === undefined) {
      return fail('File not found')
    }
    return { raw: { contentType: type, body: contentOf(node) } }
  }

  /** One answer per `/file-manager/<operation>/<id>`. */
  const operations: Record<string, (body: JsonBody, query: URLSearchParams) => Answer> = {
    'initialize': () => ok(null, { config: { uploadMaxFilesize: uploadMaxFilesize(), lang: 'en', unsupportedActions: unsupportedActions() } }),
    'content': (_body, query) => listFolder(query),
    'create-directory': body => create(body.path ?? '', body.name ?? '', 'dir', 'dirCreated'),
    'create-file': body => create(body.path ?? '', body.name ?? '', 'file', 'fileCreated'),
    upload,
    'update-file': body => updateFile(body),
    rename,
    'delete': remove,
    'paste': body => paste(body),
    zip,
    unzip,
    'download': (_body, query) => download(query),
    'preview': (_body, query) => image(query),
    'thumbnails': (_body, query) => image(query),
    'stream-file': (_body, query) => stream(query),
  }

  function handle (operation: string, body: JsonBody, query: URLSearchParams): Answer | undefined {
    return Object.hasOwn(operations, operation) ? operations[operation]!(body, query) : undefined
  }

  function addNode (node: FmNode): void {
    nodes.set(node.path, node)
  }

  /** The bytes of a file, or undefined when `path` is not a file. */
  function fileContent (path: string): Buffer | undefined {
    const node = nodes.get(path)
    return node?.type === 'file' ? contentOf(node) : undefined
  }

  return { handle, addNode, fileContent, paths: () => [...nodes.keys()] }
}

/**
 * Installs the fake backend on `page`: answers every `/api/**` request and records the ones it does not know.
 * Must run before `page.goto`; the mutable fields of the returned backend may change before any navigation.
 */
export async function installFakeBackend (page: Page): Promise<FakeBackend> {
  const services: unknown[] = [hostingService()]
  const managers = new Map<number, ReturnType<typeof createFileManager>>()
  const home = readFixture('home.json')
  const translation = readFixture('translation.en.json')
  const unhandled: string[] = []
  const failures = new Map<string, { status?: number, message?: string }>()

  /** The service that lists `accountId` as one of its server accounts, if any. */
  const serviceOf = (accountId: number): any => services.find(service => (service as any).server_accounts?.some((account: any) => account.id === accountId))

  function manager (accountId: number) {
    let existing = managers.get(accountId)
    if (existing === undefined) {
      existing = createFileManager(
        () => (serviceOf(accountId)?.hosting_server_type === 'wp-cloud' ? ['zip'] : []),
        () => backend.uploadMaxFilesize,
      )
      managers.set(accountId, existing)
    }
    return existing
  }

  const backend: FakeBackend = {
    unhandled,
    services,
    uploadMaxFilesize: GB,
    paths: (accountId = DEFAULT_ACCOUNT_ID) => manager(accountId).paths(),
    addDirectory: (path, accountId = DEFAULT_ACCOUNT_ID) => manager(accountId).addNode({ type: 'dir', path, size: 0, timestamp: now() }),
    addFile: (path, accountId = DEFAULT_ACCOUNT_ID, size = 512) => manager(accountId).addNode({ type: 'file', path, size, timestamp: now() }),
    addFileContent: (path, content, accountId = DEFAULT_ACCOUNT_ID) => manager(accountId).addNode({
      type: 'file',
      path,
      size: content.length,
      timestamp: now(),
      content,
    }),
    fileContent: (path, accountId = DEFAULT_ACCOUNT_ID) => manager(accountId).fileContent(path),
    failOperation: (operation, options = {}) => {
      failures.set(operation, options)
    },
  }

  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
    const key = `${request.method()} ${path}`

    const fm = FM_ROUTE.exec(path)
    if (fm !== null) {
      const failure = failures.get(fm[1]!)
      if (failure !== undefined) {
        // An HTTP error status, or the backend's error body on HTTP 200 (`fail`), as the backend answers a failed operation.
        const message = failure.message ?? 'Server Error'
        const httpError = failure.status !== undefined && failure.status >= 400
        await (httpError ? json(route, failure.status!, { message }) : json(route, 200, fail(message)))
        return
      }
      const answer = manager(Number(fm[2])).handle(fm[1]!, await readBody(request), url.searchParams)
      if (answer === undefined) {
        unhandled.push(key)
        await route.abort('failed')
        return
      }
      if (isRaw(answer)) {
        await route.fulfill({ status: 200, contentType: answer.raw.contentType, body: answer.raw.body })
        return
      }
      await json(route, 200, answer)
      return
    }
    if (key === 'GET /home' && backend.home !== undefined) {
      await json(route, 200, backend.home)
      return
    }
    if (key === 'GET /home') {
      // Hosting pages need `has_hosting_access`, or the router sends the user to My Instances (as the parity hosting states do).
      const app = backend.darkMode === undefined
        ? home.app
        : { ...home.app, theme: { ...home.app.theme, style: { ...home.app.theme?.style, darkMode: backend.darkMode } } }
      await json(route, 200, shellHome({ app, user: { has_hosting_access: true } }))
      return
    }
    if (request.method() === 'GET' && /^\/[A-Za-z_-]+\/translation\.json$/.test(path)) {
      await json(route, 200, translation)
      return
    }
    if (key === 'GET /csrf-cookie') {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    // Frame calls (`/services`, `/instances`, usage) come from the parity states, built from the services of this test.
    const frame = { ...hostingState({ services, path: '/hosting/file-manager' }).handlers, ...backend.frameHandlers } as Record<string, any>
    const spec = frame[key]
    if (spec === undefined || typeof spec !== 'object' || Array.isArray(spec)) {
      unhandled.push(key)
      await route.abort('failed')
      return
    }
    if (spec.json === undefined) {
      await route.fulfill({ status: spec.status ?? 200, body: spec.body ?? '' })
      return
    }
    await json(route, spec.status ?? 200, spec.json)
  })

  return backend
}
