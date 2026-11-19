import type { Page, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { onboardingService } from '../../parity/states/onboarding'
import { shellHome } from '../../parity/states/shell'
import { WIZARD_FLOW_KEY } from '../../src/shared/session/wizard-path'

// Fake of the API for the first-run wizard (`/wizard/*`, `e2e/admin-wizard*.spec.ts`). Each test gets its own, so tests stay independent.
// `GET /home` is the lite fixture: a guest while `setupRequired` is true, a signed-in user after `POST /community/setup` (the backend logs the
// new admin in). The Connect calls (`/community/hub*`) answer from `hub`. A request nobody answers is listed in `unhandled`; the fixture fails the test with it.

const FIXTURES = new URL('../../parity/fixtures/lite/', import.meta.url)
// The service of a fresh Free panel as the onboarding reads it (`parity/states/onboarding.ts`): active, empty, three installation types.
const FREE_SERVICE = onboardingService({ id: 10, onboarding: { installation_type: { wordpress: true, git: true, files: true } } })

export interface FakeWizardBackend {
  /** Requests no handler answers. The fixture fails the test with these. */
  readonly unhandled: string[]
  /** `app.setup_required` of `GET /home`, read on every request. True at the start; `POST /community/setup` turns it off. */
  setupRequired: boolean
  /** The user is signed in (after the setup). Tests that open a later step set it to true together with `setupRequired = false`. */
  signedIn: boolean
  /** Answer of `GET /community/hub`. */
  hub: { paired: boolean, accountName: string | null }
  /** `style.darkMode` of the app in `GET /home` (the theme of the wizard); undefined keeps the fixture. */
  darkMode?: boolean
  /** Server name of `GET /home` (`app.name`), shown read-only in step 1 once the account exists. */
  serverName: string
  /** Bodies of the `POST` calls, in order, by path (`/community/setup`, `/community/hub/start`, `/community/hub/complete`). */
  readonly posts: Array<{ path: string, body: unknown }>
  /** Makes `POST /community/setup` answer this error (`status` with `{ message, errors? }`); undefined restores success. */
  failSetup: { status: number, body: Record<string, unknown> } | undefined
  /** `hub_url` of a connected `POST /community/hub/complete` (the Hub account page). */
  hubUrl: string
  /** Answer of `POST /community/hub/start` (`link`). */
  hubStartLink: string
  /** Answer of `POST /community/hub/complete`: `status` of a 200, or an error `status` with a body. */
  hubComplete: { status: string } | { httpStatus: number, body: Record<string, unknown> }
  /** `user.password_generated` of `GET /home` for a signed-in user: the account Hub created has a generated password (step 2 then runs in the `hub` mode). */
  passwordGenerated: boolean
  /** `user.email` of `GET /home` for a signed-in user. */
  userEmail: string
  /** Answer of `GET /community/settings`, kept up to date by `PUT /community/settings`. */
  settings: { name: string, default_language: string, default_date_format: string }
  /** Bodies of the `PUT` calls, in order, by path (`/community/settings`). */
  readonly puts: Array<{ path: string, body: unknown }>
  /** Makes `GET /community/settings` answer this error (`status` with a body); undefined restores success. */
  failSettingsGet: { status: number, body: Record<string, unknown> } | undefined
  /** Makes `PUT /community/settings` answer this error (`status` with `{ message, errors? }`); undefined restores success. */
  failSettingsPut: { status: number, body: Record<string, unknown> } | undefined
  /** Answer of `GET /mcp-tokens` (step 3 and Summary), kept up to date by `POST /mcp-tokens`. Empty at the start: no AI connection. */
  mcpTokens: Array<{ id: number, name: string, last_used_at: string | null, revoked_at: string | null, created_at: string }>
  /** Makes `GET /mcp-tokens` answer 500; undefined restores success. */
  failMcpTokens: boolean
  /** Makes `GET /community/hub` answer 500 (the status of the pairing is then unknown on Summary); undefined restores success. */
  failHubStatus: boolean
  /** Bodies of the `POST /mcp-tokens` calls, in order. */
  readonly mcpPosts: unknown[]
}

/**
 * Marks the tab as the one that is finishing the setup: the app closes the wizard's steps to every other browser and keeps them open only in
 * that one (`src/shared/session/wizard-path.ts`). A spec that opens a later step as an already-signed-in admin calls it before the visit.
 */
export async function markWizardFlow (page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      window.sessionStorage.setItem(key, '1')
    } catch {
      // A browser without storage: the spec cannot open a later step.
    }
  }, WIZARD_FLOW_KEY)
}

function readFixture (name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
}

/** Calls of step 3 (the MCP tokens) and of `/projects` after "Create your first project". Returns true when it answered. */
async function answerStep3Calls (
  route: Route,
  key: string,
  backend: FakeWizardBackend,
  json: (route: Route, status: number, body: unknown) => Promise<void>,
): Promise<boolean> {
  // `/projects` after "Create your first project": no projects and no labels, so the empty list opens the onboarding.
  if (['GET /labels', 'GET /projects', 'GET /services/10/domains'].includes(key)) {
    await json(route, 200, { data: [], meta: { total: 0 } })
    return true
  }
  if (key === 'GET /mcp-tokens') {
    if (backend.failMcpTokens) {
      await json(route, 500, { message: 'The tokens could not be read.' })
      return true
    }
    await json(route, 200, { data: backend.mcpTokens })
    return true
  }
  if (key === 'POST /mcp-tokens') {
    const body = (route.request().postDataJSON() ?? {}) as { name?: string }
    backend.mcpPosts.push(body)
    const token = { id: backend.mcpTokens.length + 1, name: body.name ?? '', last_used_at: null, revoked_at: null, created_at: '2026-11-01T10:00:00.000000Z' }
    backend.mcpTokens = [...backend.mcpTokens, token]
    await json(route, 201, { data: { ...token, plain_text_token: 'pat_wizard_0123456789abcdef' } })
    return true
  }
  return false
}

export async function installFakeWizardBackend (page: Page): Promise<FakeWizardBackend> {
  const home = readFixture('home.json')
  const translation = readFixture('translation.en.json')
  const unhandled: string[] = []
  const posts: FakeWizardBackend['posts'] = []
  const puts: FakeWizardBackend['puts'] = []

  const backend: FakeWizardBackend = {
    unhandled,
    setupRequired: true,
    signedIn: false,
    hub: { paired: false, accountName: null },
    serverName: 'My server',
    posts,
    failSetup: undefined,
    hubUrl: 'https://hub.example.test/account',
    hubStartLink: 'https://hub.example.test/connect',
    hubComplete: { status: 'connected' },
    passwordGenerated: false,
    userEmail: 'jane@example.com',
    settings: { name: 'My server', default_language: 'en', default_date_format: 'DD/MM/YYYY' },
    puts,
    failSettingsGet: undefined,
    failSettingsPut: undefined,
    mcpTokens: [],
    failMcpTokens: false,
    failHubStatus: false,
    mcpPosts: [],
  }

  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
    const key = `${request.method()} ${path}`

    if (key === 'GET /home') {
      let app = { ...home.app, name: backend.serverName, setup_required: backend.setupRequired }
      if (backend.darkMode !== undefined) {
        app = { ...app, theme: { ...app.theme, style: { ...app.theme?.style, darkMode: backend.darkMode } } }
      }
      // The signed-in admin has the active service of the Community panel (WordPress, Git, files; room for projects), so "Create your first
      // project" opens the choice of the installation type, not "No Active Plans" (impl-review F7).
      const user = { email: backend.userEmail, password_generated: backend.passwordGenerated, services: [FREE_SERVICE] }
      await json(route, 200, backend.signedIn ? shellHome({ app, user }) : { app })
      return
    }
    if (request.method() === 'GET' && /^\/[A-Za-z_-]+\/translation\.json$/.test(path)) {
      await json(route, 200, translation)
      return
    }
    // The signed-in shell reads the notifications of the new admin: none.
    if (key === 'GET /notifications') {
      await json(route, 200, { data: [], meta: { total: 0 } })
      return
    }
    if (key === 'GET /csrf-cookie') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (await answerStep3Calls(route, key, backend, json)) {
      return
    }
    if (key === 'GET /community/hub') {
      if (backend.failHubStatus) {
        await json(route, 500, { message: 'The Hub status could not be read.' })
        return
      }
      await json(route, 200, { paired: backend.hub.paired, account_name: backend.hub.accountName, hub_url: backend.hub.paired ? backend.hubUrl : null })
      return
    }
    if (key === 'GET /community/settings') {
      if (backend.failSettingsGet !== undefined) {
        await json(route, backend.failSettingsGet.status, backend.failSettingsGet.body)
        return
      }
      await json(route, 200, backend.settings)
      return
    }
    if (key === 'PUT /community/settings') {
      puts.push({ path, body: request.postDataJSON() ?? {} })
      if (backend.failSettingsPut !== undefined) {
        await json(route, backend.failSettingsPut.status, backend.failSettingsPut.body)
        return
      }
      backend.settings = { ...backend.settings, ...request.postDataJSON() }
      await json(route, 200, backend.settings)
      return
    }
    if (request.method() === 'POST' && path.startsWith('/community/')) {
      posts.push({ path, body: request.postDataJSON() ?? {} })
      if (path === '/community/setup') {
        if (backend.failSetup !== undefined) {
          await json(route, backend.failSetup.status, backend.failSetup.body)
          return
        }
        backend.setupRequired = false
        backend.signedIn = true
        // The backend logs in the account it created, so `/home` has its email from now on.
        const email = (request.postDataJSON() as { email?: unknown } | null)?.email
        if (typeof email === 'string' && email !== '') {
          backend.userEmail = email
        }
        await json(route, 200, {})
        return
      }
      if (path === '/community/hub/start') {
        await json(route, 200, { link: backend.hubStartLink })
        return
      }
      if (path === '/community/hub/complete') {
        if ('httpStatus' in backend.hubComplete) {
          await json(route, backend.hubComplete.httpStatus, backend.hubComplete.body)
          return
        }
        // A connected return on a panel that needs its setup creates the admin and signs the guest in (backend `hub/complete`).
        if (backend.hubComplete.status === 'connected') {
          if (backend.setupRequired) {
            backend.setupRequired = false
            backend.signedIn = true
            backend.passwordGenerated = true
          }
          backend.hub = { paired: true, accountName: backend.hub.accountName ?? 'Ann Ann' }
          await json(route, 200, { status: 'connected', account_name: backend.hub.accountName, hub_url: backend.hubUrl, setup_completed: true })
          return
        }
        await json(route, 200, { status: backend.hubComplete.status })
        return
      }
    }

    unhandled.push(key)
    await route.abort('failed')
  })

  return backend
}
