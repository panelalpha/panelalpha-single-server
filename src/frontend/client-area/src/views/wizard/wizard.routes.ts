import type { RouteRecordRaw } from 'vue-router'
import { resolveHubConnectedRedirect } from './hub-connected-redirect'
// One lazy import for the four records, so the wizard is a single chunk outside the main bundle.
const WizardView = () => import('./WizardView.vue')

function returnStorage (): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// The start page and the four steps. `/wizard`, step 1 (PanelAlpha Connect: Hub first) and
// step 2 (General Config: the local account or the server name) are open to a guest; Summary needs the signed-in admin on a Free panel.
// The guard (`app/router/setup-guard.ts`) decides which of them a visit may open.
export const wizardRoutes: RouteRecordRaw[] = [
  {
    path: '/wizard',
    name: 'wizard',
    component: WizardView,
    meta: { requiresAuth: false, displayNavbar: false, hideShellFooter: true, forceLightTheme: true, title: 'setup' },
  },
  {
    path: '/wizard/general-config',
    name: 'wizard-general-config',
    component: WizardView,
    // `freePanel` only matters once the setup is done (the guard returns first while it is required): a signed-in user of a paid panel
    // must not see the read-only step 1 there.
    meta: { requiresAuth: false, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' },
  },
  {
    path: '/wizard/panelalpha-connect',
    name: 'wizard-panelalpha-connect',
    component: WizardView,
    // Step 1 is open to a guest: the guest signs in through Hub or opens the local form. Once the setup is done the guard
    // sends a guest to /login (`freePanel` as for step 2).
    meta: { requiresAuth: false, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' },
  },
  {
    path: '/wizard/connect-ai',
    name: 'wizard-connect-ai',
    component: WizardView,
    meta: { requiresAuth: true, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' },
  },
  {
    path: '/wizard/summary',
    name: 'wizard-summary',
    component: WizardView,
    meta: { requiresAuth: true, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' },
  },
  // Links and bookmarks of the old setup lead to the wizard.
  { path: '/setup', redirect: '/wizard' },
  { path: '/setup/summary', redirect: '/wizard' },
  {
    // A record `redirect` resolves before `beforeEach`, so a guest keeps `state` and `result`.
    path: '/hub-connected',
    name: 'hub-connected',
    meta: { requiresAuth: false },
    redirect: to => resolveHubConnectedRedirect(to.query, returnStorage()),
  },
]
