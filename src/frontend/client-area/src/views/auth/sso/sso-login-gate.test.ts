import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, RouterView } from 'vue-router'
import { router, routes } from '@/app/router'
import { resolveAuthGuardRedirect } from '@/app/router/auth-guard'
import { resolvePaidAreaRedirect } from '@/app/router/paid-area-guard'
import { authRoutes } from '@/views/auth/auth.routes'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'

const SSO_PATH = '/sso-login?token=fx44token'

/** The Community panel's `/home`: `community_panel` is the edition the panel names there; it has no Admin Area to hand off from. */
const FREE_HOME: HomeResponse = { app: { community_panel: true } }
/** A paid panel's `/home`: no Free panel, so the Admin Area and its hand-off page exist. */
const PAID_HOME: HomeResponse = { app: { community_panel: false } }

function visited (path: string, query: Record<string, string>) {
  return { path, query, hash: '', matched: [{ meta: { requiresAuth: false, standalone: true, paidArea: 'admin-area' } }] }
}

describe('the /sso-login route record', () => {
  it('is the Admin Area hand-off: shell-free and gated on the edition', () => {
    const record = authRoutes.find(route => route.name === 'sso-login')!

    expect(record.path).toBe('/sso-login')
    expect(record.meta).toMatchObject({ requiresAuth: false, displayNavbar: false, standalone: true, paidArea: 'admin-area' })
  })
})

describe('resolvePaidAreaRedirect on /sso-login', () => {
  it('sends the page of a Free panel to the not-found page under the same address, keeping the token', () => {
    expect(resolvePaidAreaRedirect(visited('/sso-login', { token: 'fx44token' }), FREE_HOME)).toEqual({
      name: 'error',
      params: { pathMatch: ['sso-login'] },
      query: { token: 'fx44token' },
      hash: '',
      replace: true,
    })
  })

  it('keeps the page on a panel with an Admin Area', () => {
    expect(resolvePaidAreaRedirect(visited('/sso-login', { token: 'fx44token' }), PAID_HOME)).toBeUndefined()
    // A panel that names no edition at all is not the Free one (the key is there in Free, `true`).
    expect(resolvePaidAreaRedirect(visited('/sso-login', {}), { app: {} } as HomeResponse)).toBeUndefined()
  })

  it('keeps it while /home is unknown (an offline boot)', () => {
    expect(resolvePaidAreaRedirect(visited('/sso-login', { token: 'fx44token' }), null)).toBeUndefined()
  })
})

let mounted: string[] = []

function probe (name: string) {
  return defineComponent({
    mounted () {
      mounted.push(name)
    },
    render: () => h('div', { 'data-testid': name }),
  })
}

// The real record (stub component), the real gate and the real catch-all: the page is only mounted where the edition serves it.
function stubbedRoutes (): RouteRecordRaw[] {
  return [
    { ...authRoutes.find(route => route.name === 'sso-login')!, component: probe('sso-login') },
    { path: '/login', name: 'login', component: probe('login') },
    { ...routes.find(record => record.name === 'error')!, component: probe('error') } as RouteRecordRaw,
  ]
}

async function mountAt (path: string, panelHome: HomeResponse | null) {
  mounted = []
  const testRouter = createRouter({ history: createMemoryHistory(), routes: stubbedRoutes() })
  // The area gate decides before the auth gate asks for a user.
  testRouter.beforeEach(to => resolvePaidAreaRedirect(to, panelHome) ?? resolveAuthGuardRedirect(to, false))
  await mountKit({ render: () => h(RouterView) }, { global: { plugins: [testRouter] } })
  await testRouter.push(path)
  await flushPromises()
  return testRouter
}

describe('a /sso-login address of a Free panel', () => {
  it('lands on the not-found page and never mounts the hand-off (no token is posted)', async () => {
    const testRouter = await mountAt(SSO_PATH, FREE_HOME)

    expect(testRouter.currentRoute.value.name).toBe('error')
    expect(testRouter.currentRoute.value.path).toBe('/sso-login')
    expect(testRouter.currentRoute.value.query).toEqual({ token: 'fx44token' })
    expect(testRouter.currentRoute.value.meta).toMatchObject({ requiresAuth: false, displayNavbar: false, title: 'page-not-found' })
    expect(mounted).toEqual(['error'])
  })
})

describe('a /sso-login address of a panel with an Admin Area', () => {
  it('mounts the hand-off', async () => {
    const testRouter = await mountAt(SSO_PATH, PAID_HOME)

    expect(testRouter.currentRoute.value.name).toBe('sso-login')
    expect(mounted).toEqual(['sso-login'])
  })
})

// The built router (real records, real guards) decides too.
describe('the built router', () => {
  it('lands /sso-login of a Free panel on the not-found page', async () => {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome(FREE_HOME)

    await router.push(SSO_PATH)

    expect(router.currentRoute.value.name).toBe('error')
    expect(router.currentRoute.value.path).toBe('/sso-login')
    expect(router.currentRoute.value.meta.title).toBe('page-not-found')
  })

  it('opens the hand-off on a panel with an Admin Area', async () => {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome(PAID_HOME)

    await router.push(SSO_PATH)

    expect(router.currentRoute.value.name).toBe('sso-login')
  })
})
