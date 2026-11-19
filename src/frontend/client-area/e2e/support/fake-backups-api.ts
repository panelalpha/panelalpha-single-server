import type { Page, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from '../../parity/states/instance'
import { backupRow, backupsEndpoints, backupsHandlers, instanceBackupsHome } from '../../parity/states/instance-backups.parity'

// Fake of the API for the Backups page of a `custom` project (`/projects/1/backups`, `e2e/project-backups-custom.visual.spec.ts`). The frame,
// the shell and the Backups endpoints come from the parity handlers (`backupsHandlers`); only the project type and the rows are set here.
// Each test gets its own fake. A request nobody answers is listed in `unhandled`; the fixture fails the test with it.

const FIXTURES = new URL('../../parity/fixtures/lite/', import.meta.url)

export interface FakeBackupsBackend {
  /** Requests no handler answers. The fixture fails the test with these. */
  readonly unhandled: string[]
  /** `style.darkMode` of the app in `GET /home`, read on every request; undefined keeps the fixture. */
  darkMode?: boolean
}

/** The files of a full backup of a custom project: the code, two volumes and a database. */
const FULL_ITEMS = [
  { id: 11, directory: true, database: false, type: 'files', name: null },
  { id: 12, directory: false, database: true, type: 'volume', name: 'uploads' },
  { id: 13, directory: false, database: true, type: 'volume', name: 'cache' },
  { id: 14, directory: false, database: true, type: 'database', name: 'app_db' },
]

/** Rows of the custom project: a full backup, one with the code only (no data), and one still running (`parts: null`). */
export const customBackupRows: Array<Record<string, unknown>> = [
  backupRow(1, {
    name: 'Manual backup',
    size: 1_610_612_736,
    parts: { files: true, volumes: ['uploads', 'cache'], databases: ['app_db'] },
    items: FULL_ITEMS,
  }),
  backupRow(2, {
    type: 'automatic',
    size: 52_428_800,
    database: false,
    parts: { files: true, volumes: [], databases: [] },
    items: [{ id: 21, directory: true, database: false, type: 'files', name: null }],
  }),
  backupRow(3, { size: null, async_status: { create: 'pending' }, parts: null, items: [] }),
]

function readFixture (name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
}

export async function installFakeBackupsBackend (page: Page): Promise<FakeBackupsBackend> {
  const translation = readFixture('translation.en.json')
  const unhandled: string[] = []
  const backend: FakeBackupsBackend = { unhandled }
  const handlers = backupsHandlers({
    ...backupsEndpoints(customBackupRows),
    'GET /projects/1': { json: { data: instancePageRaw(1, { privileges: INSTANCE_PAGE_PRIVILEGES, type: 'custom', is_container: true }) } },
  }) as Record<string, any>

  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
    const key = `${request.method()} ${path}`

    if (key === 'GET /home') {
      const home = instanceBackupsHome as { app: any }
      const app = backend.darkMode === undefined
        ? home.app
        : { ...home.app, theme: { ...home.app.theme, style: { ...home.app.theme?.style, darkMode: backend.darkMode } } }
      await json(route, 200, { ...home, app })
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
    const spec = handlers[key]
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
