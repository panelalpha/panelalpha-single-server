import type { Page, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { shellHome } from '../../parity/states/shell'

// Fake of the API for the Tasks screen of the Community panel (`/tasks`, `e2e/tasks.visual.spec.ts`): the single-server shell, `GET /community/tasks`
// with the filters the screen sends, and the project list of the project select. Each test gets its own fake. A request nobody answers is
// listed in `unhandled`; the fixture fails the test with it.

const FIXTURES = new URL('../../parity/fixtures/lite/', import.meta.url)

/** The instant the page clock starts at (`page.clock.install`); every date of the fixture is counted from it, so the text never drifts. */
export const FIXED = Date.parse('2026-10-25T10:00:00Z')
const MINUTE = 60_000

export interface TaskFixture {
  id: number
  action: string | null
  status: string
  error?: string | null
  username: string | null
  project: { id: number, name: string, domain?: string | null } | null
  /** Offsets from `FIXED`, in minutes (negative: in the past). */
  queued: number
  started: number | null
  finished: number | null
}

export interface FakeTasksBackend {
  /** Requests no handler answers. The fixture fails the test with these. */
  readonly unhandled: string[]
  /** `style.darkMode` of the app in `GET /home`, read on every request; undefined keeps the fixture. */
  darkMode?: boolean
  /** The tasks `GET /community/tasks` filters and pages; a test may replace it before it navigates (an empty list gives the empty state). */
  rows: TaskFixture[]
  /** The queries of `GET /community/tasks` so far. */
  readonly taskQueries: URLSearchParams[]
}

const BLOG = { id: 11, name: 'Blog', domain: 'blog.example.test' }
const SHOP = { id: 12, name: 'Shop' }

const MULTILINE_ERROR = [
  'Command failed: git pull origin main (exit code 1)',
  'fatal: unable to access \'https://git.example.test/shop.git/\': Could not resolve host: git.example.test',
  'Check the repository URL and the network of the server, then try again.',
].join('\n')

/** Two days of tasks: today (queued, running, completed, a failed one with a three-line error, a cancelled one without a project) and yesterday. */
export const defaultTaskRows: TaskFixture[] = [
  { id: 1, action: 'deploy', status: 'queued', username: 'admin', project: BLOG, queued: -1, started: null, finished: null },
  { id: 2, action: 'rebuild', status: 'running', username: 'admin', project: SHOP, queued: -6, started: -5, finished: null },
  { id: 3, action: 'backup', status: 'completed', username: 'admin', project: BLOG, queued: -60, started: -59, finished: -55 },
  { id: 4, action: 'git_pull', status: 'failed', error: MULTILINE_ERROR, username: 'admin', project: SHOP, queued: -120, started: -119, finished: -118 },
  { id: 5, action: 'delete', status: 'cancelled', username: 'editor', project: null, queued: -180, started: -179, finished: -178 },
  { id: 6, action: 'restore', status: 'completed', username: 'admin', project: BLOG, queued: -20 * 60, started: -20 * 60 + 1, finished: -20 * 60 + 9 },
  { id: 7, action: 'deploy_archive', status: 'failed', error: 'Archive is not a valid .zip file', username: 'admin', project: SHOP, queued: -21 * 60, started: -21 * 60 + 1, finished: -21 * 60 + 2 },
  { id: 8, action: 'backup', status: 'completed', username: 'panel', project: null, queued: -23 * 60, started: -23 * 60 + 1, finished: -23 * 60 + 3 },
]

const PROJECTS = [BLOG, SHOP]

function readFixture (name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
}

const at = (offset: number | null): string | null => (offset === null ? null : new Date(FIXED + offset * MINUTE).toISOString())

function taskBody (row: TaskFixture) {
  return {
    id: row.id,
    action: row.action,
    job_type: null,
    status: row.status,
    error: row.error ?? null,
    username: row.username,
    project: row.project,
    queued_at: at(row.queued),
    started_at: at(row.started),
    finished_at: at(row.finished),
  }
}

/** The filters of `GET /community/tasks`: `status` (`active` is queued and running), `action`, `project`, then the page. */
function taskPage (rows: TaskFixture[], query: URLSearchParams) {
  const status = query.get('status')
  const action = query.get('action')
  const project = query.get('project')
  const perPage = Number(query.get('per_page') ?? 50)
  const page = Number(query.get('page') ?? 1)
  const filtered = rows.filter(row => {
    const statusMatches = status === null || (status === 'active' ? ['queued', 'running'].includes(row.status) : row.status === status)
    return statusMatches && (action === null || row.action === action) && (project === null || row.project?.id === Number(project))
  })
  return {
    data: filtered.slice((page - 1) * perPage, page * perPage).map(row => taskBody(row)),
    meta: { total: filtered.length, last_page: Math.max(1, Math.ceil(filtered.length / perPage)) },
  }
}

export async function installFakeTasksBackend (page: Page): Promise<FakeTasksBackend> {
  const home = readFixture('home.json')
  const translation = readFixture('translation.en.json')
  const unhandled: string[] = []
  const taskQueries: URLSearchParams[] = []
  const backend: FakeTasksBackend = { unhandled, rows: defaultTaskRows, taskQueries }

  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
    const key = `${request.method()} ${path}`

    if (key === 'GET /home') {
      const app = backend.darkMode === undefined
        ? home.app
        : { ...home.app, theme: { ...home.app.theme, style: { ...home.app.theme?.style, darkMode: backend.darkMode } } }
      await json(route, 200, shellHome({ app, user: { is_ss_default: true, has_hosting_access: true } }))
      return
    }
    if (request.method() === 'GET' && /^\/[A-Za-z_-]+\/translation\.json$/.test(path)) {
      await json(route, 200, translation)
      return
    }
    switch (key) {
      case 'GET /csrf-cookie': {
        await route.fulfill({ status: 204, body: '' })
        return
      }
      case 'GET /community/tasks': {
        taskQueries.push(url.searchParams)
        await json(route, 200, taskPage(backend.rows, url.searchParams))
        return
      }
      // The project select and the shell list: the client rewrites `/instances` to `/projects` on single-server.
      case 'GET /projects': {
        await json(route, 200, { data: PROJECTS, meta: { total: PROJECTS.length } })
        return
      }
      case 'GET /notifications': {
        await json(route, 200, { data: [], meta: { total: 0 } })
        return
      }
      case 'GET /labels': {
        await json(route, 200, { data: [] })
        return
      }
      case 'POST /broadcasting/auth': {
        await json(route, 403, { message: 'The fake has no websocket.' })
        return
      }
      default: {
        unhandled.push(key)
        await route.abort('failed')
      }
    }
  })

  return backend
}
