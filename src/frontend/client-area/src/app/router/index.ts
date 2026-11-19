import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { billingRoutes } from '@/views/account/billing/billing.routes'
import { accountRoutes } from '@/views/account/profile/account.routes'
import { servicesRoutes } from '@/views/account/services/services.routes'
import { settingsRoutes } from '@/views/account/settings/settings.routes'
import { tasksRoutes } from '@/views/account/tasks/tasks.routes'
import { authRoutes } from '@/views/auth/auth.routes'
import { connectAiRoutes } from '@/views/connect-ai/connect-ai.routes'
import { hostingRoutes } from '@/views/hosting/hosting.routes'
import { pageNotFoundRoutes } from '@/views/not-found/page-not-found.routes'
import { instancesRoutes } from '@/views/projects/instances.routes'
import { instanceRoutes } from '@/views/projects/project/instance.routes'
import { resellerRoutes } from '@/views/reseller/reseller.routes'
import { wizardRoutes } from '@/views/wizard/wizard.routes'
import { hubLoginRedirect, readHubTicket } from '@/shared/session/hub-login-exchange'
import { useSessionStore } from '@/shared/session/session.store'
import { isWizardFlowInProgress, markWizardFlowInProgress } from '@/shared/session/wizard-path'
import { resolveAuthGuardRedirect, shouldBootHome } from './auth-guard'
import { prefetchRouteComponents } from './boot-prefetch'
import { installChunkReload } from './chunk-reload'
import { updateDocumentTitle } from './document-title'
import { resolvePaidAreaRedirect } from './paid-area-guard'
import { resolveRootRedirect } from './root-redirect'
import { isWizardSetupPath, resolveSetupGuardRedirect } from './setup-guard'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    // Never rendered: `router.beforeEach` leads it to `/projects` or `/instances` once `/home` is known (`root-redirect.ts`).
    component: { render: () => null },
  },
  ...authRoutes,
  ...wizardRoutes,
  ...accountRoutes,
  ...billingRoutes,
  ...instancesRoutes,
  ...instanceRoutes,
  ...hostingRoutes,
  ...connectAiRoutes,
  ...servicesRoutes,
  ...resellerRoutes,
  ...settingsRoutes,
  ...tasksRoutes,
  // Catch-all stays last.
  ...pageNotFoundRoutes,
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// A chunk that no longer exists after a deploy: one reload of the target, no loop (`chunk-reload.ts`).
installChunkReload(router)

router.beforeEach(async to => {
  // Chunks of the target start now, not after `/home`.
  prefetchRouteComponents(to)

  const session = useSessionStore()

  // One-time hub ticket exchange, before `/home` (legacy POSTs first, then GETs `/home`).
  const hubRedirect = hubLoginRedirect(to, session.hubExchangeStarted)
  if (hubRedirect) {
    // Legacy reads and clears the address bar only on a /hub-login page load; an in-app push leaves the
    // previous page's URL alone and fails without a ticket.
    const onHubPage = window.location.pathname.endsWith('/hub-login')
    const ticket = onHubPage ? readHubTicket(window.location.hash) : null
    if (onHubPage) {
      history.replaceState(history.state, '', window.location.pathname)
    }
    await session.hubLogin(ticket)
    return hubRedirect
  }

  if (shouldBootHome(to, Boolean(session.home?.app))) {
    try {
      await session.ensureHome()
      // `beforeEnter` of /login, /register and /forgot-password reuses this `/home` instead of a second GET.
      session.markBootHome(true)
    } catch {
      // GET /home can fail offline; auth gate still applies below.
    }
  }

  // The setup guard runs after /home and before the auth gate.
  const setup = resolveSetupGuardRedirect(to, session.home, Boolean(session.user), isWizardFlowInProgress())
  if (setup) {
    return setup
  }

  // The tab finishing the setup keeps the wizard's later steps after the account exists.
  if (session.home?.app?.setup_required && isWizardSetupPath(to.path)) {
    markWizardFlowInProgress()
  }

  const root = resolveRootRedirect(to, session.home)
  if (root) {
    return root
  }

  const paidArea = resolvePaidAreaRedirect(to, session.home)
  if (paidArea) {
    return paidArea
  }

  // Require hydrated session.user, not merely localStorage+XSRF gate.
  return resolveAuthGuardRedirect(to, Boolean(session.user))
})

router.afterEach(to => {
  try {
    const session = useSessionStore()
    session.markBootHome(false)
    updateDocumentTitle(to, session.home)
  } catch {
    // Pinia may not be active during early boot / unit tests.
    updateDocumentTitle(to, null)
  }
})

// A navigation that throws skips `afterEach`; the boot `/home` mark must not outlive it.
router.onError(() => {
  try {
    useSessionStore().markBootHome(false)
  } catch {
    // Pinia may not be active during early boot / unit tests.
  }
})
