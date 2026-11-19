import type { HomeResponse } from '@/shared/session/session.api'
import { WIZARD_PATH } from '@/shared/session/wizard-path'

/** Steps a guest may open while the first-run setup is required: Hub first (step 1), then the account or the server name (step 2). */
const WIZARD_GUEST_PATHS: ReadonlySet<string> = new Set(['/wizard/panelalpha-connect', '/wizard/general-config'])

/** The three step addresses, `/wizard` (the start page) aside: once the setup is done only the flow that is finishing it may open them. */
const WIZARD_STEP_PATHS: ReadonlySet<string> = new Set([...WIZARD_GUEST_PATHS, '/wizard/summary'])

/** `/wizard/` is the same page as `/wizard` for the router (non-strict), so a trailing slash must not slip past the comparisons. */
function routePath (path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** Whether the visit is the wizard itself, i.e. the screens the guard remembers the flow of. */
export function isWizardSetupPath (path: string): boolean {
  const normalized = routePath(path)
  return normalized === WIZARD_PATH || WIZARD_STEP_PATHS.has(normalized)
}

/**
 * First-run setup gate.
 * While the first-run setup is required every route leads to `/wizard`, except `/wizard` itself and its two guest steps. Once it is not,
 * `/wizard` leads away (to `/` when signed in, else to `/login`), and so do the three steps: only the browser that is finishing the setup
 * may open them (`wizardFlow`, the sessionStorage mark `shared/session/wizard-path.ts` writes and the finish clears), because the account
 * step and the Hub round trip load a new page once the account exists. Every other visit goes to `/` (signed in) or `/login`.
 * A Free-panel page (`meta.freePanel`: tasks, settings, the wizard steps after the account) leads to / on a panel whose /home says
 * it is not the Community panel (`app.community_panel`; a paid panel has these in its Admin Area).
 * Returns a redirect target, or `undefined` to let the navigation pass.
 */
export interface SetupGuardRouteLike {
  path: string
  matched: ReadonlyArray<{ meta: Record<string, unknown> }>
}

export function resolveSetupGuardRedirect (
  to: SetupGuardRouteLike,
  home: Pick<HomeResponse, 'app'> | null | undefined,
  hasUser: boolean,
  wizardFlow = false,
): { path: '/wizard' | '/' | '/login' } | undefined {
  const app = home?.app
  const required = Boolean(app?.setup_required)
  const path = routePath(to.path)

  if (required) {
    return path === WIZARD_PATH || WIZARD_GUEST_PATHS.has(path) ? undefined : { path: WIZARD_PATH }
  }
  if (path === WIZARD_PATH) {
    return { path: hasUser ? '/' : '/login' }
  }
  if (to.matched.some(record => record.meta.freePanel === true) && app && !app.community_panel) {
    return { path: '/' }
  }
  if (WIZARD_STEP_PATHS.has(path)) {
    return wizardFlow && hasUser ? undefined : { path: hasUser ? '/' : '/login' }
  }
  return undefined
}
