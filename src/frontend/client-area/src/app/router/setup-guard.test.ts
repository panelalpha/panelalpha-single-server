import type { SetupGuardRouteLike } from './setup-guard'
import { describe, expect, it } from 'vitest'
import { isWizardSetupPath, resolveSetupGuardRedirect } from './setup-guard'

type HomeArg = Parameters<typeof resolveSetupGuardRedirect>[1]

function route (path: string, meta: Record<string, unknown> = {}): SetupGuardRouteLike {
  return {
    path,
    matched: [{ meta }],
  }
}

function homeWith (setupRequired: boolean, freePanel = true): HomeArg {
  return ({
    app: { setup_required: setupRequired, community_panel: freePanel },
  }) as HomeArg
}

const STEP_PATHS = ['/wizard/general-config', '/wizard/panelalpha-connect', '/wizard/summary']
const SUMMARY_META = { requiresAuth: true, freePanel: true }

describe('resolveSetupGuardRedirect', () => {
  it('sends any other route to /wizard while setup is required', () => {
    expect(resolveSetupGuardRedirect(route('/'), homeWith(true), false)).toEqual({ path: '/wizard' })
    expect(resolveSetupGuardRedirect(route('/login'), homeWith(true), false)).toEqual({ path: '/wizard' })
    expect(resolveSetupGuardRedirect(route('/projects/1'), homeWith(true), true)).toEqual({ path: '/wizard' })
    expect(resolveSetupGuardRedirect(route('/wizard/summary'), homeWith(true), false)).toEqual({ path: '/wizard' })
    expect(resolveSetupGuardRedirect(route('/wizard/summary'), homeWith(true), true)).toEqual({ path: '/wizard' })
  })

  it('lets /wizard and both guest steps through while setup is required', () => {
    expect(resolveSetupGuardRedirect(route('/wizard'), homeWith(true), false)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/wizard/panelalpha-connect'), homeWith(true), false)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/wizard/general-config'), homeWith(true), false)).toBeUndefined()
  })

  it('sends Connect AI to /wizard while setup is required and leaves it to requiresAuth once it is done', () => {
    expect(resolveSetupGuardRedirect(route('/wizard/connect-ai'), homeWith(true), false)).toEqual({ path: '/wizard' })
    expect(resolveSetupGuardRedirect(route('/wizard/connect-ai'), homeWith(true), true)).toEqual({ path: '/wizard' })
    // A guest after the setup is sent to /login by the auth guard (`requiresAuth`), not by this one.
    expect(resolveSetupGuardRedirect(route('/wizard/connect-ai', { requiresAuth: true, freePanel: true }), homeWith(false), false)).toBeUndefined()
  })

  it('sends /wizard to / when logged in and setup is done', () => {
    expect(resolveSetupGuardRedirect(route('/wizard'), homeWith(false), true)).toEqual({ path: '/' })
  })

  it('sends /wizard to /login when logged out and setup is done', () => {
    expect(resolveSetupGuardRedirect(route('/wizard'), homeWith(false), false)).toEqual({ path: '/login' })
  })

  it('closes every step to a signed-in user whose browser is not finishing the setup', () => {
    // The finding: signed in as the panel's account, /wizard/* rendered the first-run wizard (steps, the summary with the admin e-mail).
    for (const path of STEP_PATHS) {
      expect(resolveSetupGuardRedirect(route(path, SUMMARY_META), homeWith(false), true)).toEqual({ path: '/' })
      expect(resolveSetupGuardRedirect(route(path, SUMMARY_META), homeWith(false, false), true)).toEqual({ path: '/' })
    }
  })

  it('closes every step to a guest once the setup is done', () => {
    for (const path of STEP_PATHS) {
      expect(resolveSetupGuardRedirect(route(path), homeWith(false), false)).toEqual({ path: '/login' })
    }
  })

  it('keeps the steps of the flow that is finishing the setup open to its signed-in user', () => {
    // The account step and the Hub round trip load a new page once the account exists; the remaining steps must stay reachable there.
    for (const path of STEP_PATHS) {
      expect(resolveSetupGuardRedirect(route(path, SUMMARY_META), homeWith(false), true, true)).toBeUndefined()
    }
    // The start page leads away even inside the flow: the flow is in its steps.
    expect(resolveSetupGuardRedirect(route('/wizard'), homeWith(false), true, true)).toEqual({ path: '/' })
    // A guest is not signed in, so no flow of theirs is finishing.
    expect(resolveSetupGuardRedirect(route('/wizard/general-config'), homeWith(false), false, true)).toEqual({ path: '/login' })
  })

  it('reads a trailing slash like the path without it', () => {
    expect(resolveSetupGuardRedirect(route('/wizard/'), homeWith(true), false)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/wizard/general-config/'), homeWith(true), false)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/wizard/'), homeWith(false), true)).toEqual({ path: '/' })
    expect(resolveSetupGuardRedirect(route('/wizard/general-config/'), homeWith(false), false)).toEqual({ path: '/login' })
    expect(resolveSetupGuardRedirect(route('/wizard/panelalpha-connect/'), homeWith(true), false)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/wizard/general-config/'), homeWith(false), true)).toEqual({ path: '/' })
    expect(resolveSetupGuardRedirect(route('/wizard/summary/'), homeWith(false), true, true)).toBeUndefined()
  })

  it('sends the read-only first step to / on a panel that is not the Community panel', () => {
    const first = route('/wizard/general-config', { freePanel: true })
    expect(resolveSetupGuardRedirect(first, homeWith(false), true)).toEqual({ path: '/' })
    expect(resolveSetupGuardRedirect(first, homeWith(false, false), true)).toEqual({ path: '/' })
    // While the setup is required the first step is open whatever /home says about the panel.
    expect(resolveSetupGuardRedirect(first, homeWith(true, false), false)).toBeUndefined()
    // A paid panel has the wizard in its Admin Area, so the flow of a Free setup keeps nothing open there.
    expect(resolveSetupGuardRedirect(first, homeWith(false, false), true, true)).toEqual({ path: '/' })
  })

  it('leaves other routes alone when setup is done', () => {
    expect(resolveSetupGuardRedirect(route('/projects'), homeWith(false), true)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/login'), homeWith(false), false)).toBeUndefined()
  })

  it('sends a Free-panel page to / on a panel that is not the Community panel', () => {
    const tasks = route('/tasks', { freePanel: true })
    expect(resolveSetupGuardRedirect(tasks, homeWith(false, false), true)).toEqual({ path: '/' })
    expect(resolveSetupGuardRedirect(tasks, homeWith(false, true), true)).toBeUndefined()
    expect(resolveSetupGuardRedirect(route('/projects'), homeWith(false, false), true)).toBeUndefined()
  })

  it('leaves a Free-panel page alone before /home is loaded', () => {
    expect(resolveSetupGuardRedirect(route('/tasks', { freePanel: true }), {} as HomeArg, true)).toBeUndefined()
  })

  it('treats a failed GET /home (null) as setup done: the wizard leads to /login, a Free page passes', () => {
    expect(resolveSetupGuardRedirect(route('/wizard'), null, false)).toEqual({ path: '/login' })
    expect(resolveSetupGuardRedirect(route('/wizard/summary', SUMMARY_META), null, false)).toEqual({ path: '/login' })
    expect(resolveSetupGuardRedirect(route('/tasks', { freePanel: true }), null, true)).toBeUndefined()
  })

  it('lets /wizard through when it is matched by the catch-all while setup is required (no loop)', () => {
    const catchAll: SetupGuardRouteLike = { path: '/wizard', matched: [{ meta: { catchAll: true } }] }
    expect(resolveSetupGuardRedirect(catchAll, homeWith(true), false)).toBeUndefined()
  })
})

describe('isWizardSetupPath', () => {
  it('knows the wizard screens and nothing else', () => {
    for (const path of ['/wizard', '/wizard/', '/wizard/general-config', '/wizard/general-config/', '/wizard/summary', '/wizard/panelalpha-connect']) {
      expect(isWizardSetupPath(path)).toBe(true)
    }
    for (const path of ['/', '/projects', '/login', '/setup', '/hub-connected', '/wizard/nope', '/projects/wizard']) {
      expect(isWizardSetupPath(path)).toBe(false)
    }
  })
})
